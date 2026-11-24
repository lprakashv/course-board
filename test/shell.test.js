import assert from 'node:assert/strict';
import test from 'node:test';
import { createCourseShell, setPageTitle } from '../src/browser/shell.js';

test('host controls route titles with a safe default', t => {
  globalThis.document = { title: '' };
  t.after(() => { delete globalThis.document; });
  const course = { title: 'My Course' };
  const lesson = { title: 'Caching', steps: [{ title: 'Read' }, { title: 'Write' }] };
  const route = { lesson, step: 1 };
  setPageTitle(course, null);
  assert.equal(document.title, 'My Course');
  setPageTitle(course, route);
  assert.equal(document.title, 'Caching · My Course');
  setPageTitle(course, route, ({ lesson, step }) => lesson.steps[step].title);
  assert.equal(document.title, 'Write');
  setPageTitle(course, null, ({ lesson, step }) => `${lesson} ${step}`);
  assert.equal(document.title, 'null null');
  setPageTitle(course, route, () => ' ');
  assert.equal(document.title, 'Caching · My Course');
});

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
  assert.throws(() => shell.start({ render() { throw new Error('Could not render'); } }), /Could not render/);
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
  for (const file of ['app.js', 'shell.js', 'navigation.js', 'diagrams.js', 'panes.js']) {
    assert.ok((await readFile(join(path, file), 'utf8')).length > 0);
  }
});
