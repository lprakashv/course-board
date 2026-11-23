import assert from 'node:assert/strict';
import test from 'node:test';
import { createCourseShell } from '../src/browser/shell.js';

test('shell supports existing routes and state through its lifecycle', () => {
  const handlers = new Map();
  const values = new Map([['legacy', '{"done":["one"],"dark":true}']]);
  const target = {
    location: { hash: '#/learn/one/2' },
    localStorage: { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) },
    addEventListener: (event, fn) => handlers.set(event, fn),
    removeEventListener: (event, fn) => { if (handlers.get(event) === fn) handlers.delete(event); },
  };
  const shell = createCourseShell({ target, storageKey: 'legacy', readRoute: hash => hash.split('/') });
  assert.deepEqual(shell.route(), ['#', 'learn', 'one', '2']);
  assert.deepEqual(shell.readState({}), { done: ['one'], dark: true });
  shell.writeState({ done: ['two'], dark: false });
  assert.deepEqual(JSON.parse(values.get('legacy')), { done: ['two'], dark: false });
  const calls = [];
  const stop = shell.start({ render: () => calls.push('initial'), onNavigate: () => calls.push('navigation') });
  handlers.get('hashchange')();
  stop();
  assert.deepEqual(calls, ['initial', 'navigation']);
  assert.equal(handlers.size, 0);
  target.localStorage = { getItem() { throw Error('blocked'); }, setItem() { throw Error('blocked'); } };
  assert.deepEqual(shell.readState({}), {});
  assert.doesNotThrow(() => shell.writeState({}));
});

test('browser shell modules can be vendored for an existing course', async t => {
  const { mkdtemp, readFile, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { copyBrowserShell } = await import('../src/index.js');
  const path = await mkdtemp(join(tmpdir(), 'course-shell-vendor-'));
  t.after(() => rm(path, { recursive: true, force: true }));
  await copyBrowserShell(path);
  for (const file of ['app.js', 'shell.js', 'navigation.js', 'diagrams.js']) {
    assert.ok((await readFile(join(path, file), 'utf8')).length > 0);
  }
});
