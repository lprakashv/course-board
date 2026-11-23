import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { once } from 'node:events';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const cli = fileURLToPath(new URL('../src/cli.js', import.meta.url));
const example = fileURLToPath(new URL('../example/', import.meta.url));

async function launchPreview(t, args) {
  const server = spawn(process.execPath, [cli, ...args], {
    env: { ...process.env, PORT: '0' }, stdio: ['ignore', 'pipe', 'inherit'],
  });
  const closed = once(server, 'close');
  t.after(async () => { server.kill(); await closed; });
  const lines = createInterface({ input: server.stdout });
  const [line] = await once(lines, 'line', { signal: AbortSignal.timeout(5000) });
  const url = line.match(/http:\/\/127\.0\.0\.1:\d+\//)?.[0];
  assert.ok(url, line);
  return url;
}

test('CLI shares customization with dev and serves the staged build in preview', { timeout: 10000 }, async t => {
  const root = await mkdtemp(join(tmpdir(), 'course-board-preview-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const name of ['content', 'public']) {
    await cp(join(example, name), join(root, name), { recursive: true });
  }
  const message = join(root, 'public', 'message.txt');
  await writeFile(message, 'First build');
  const hook = 'custom shell.mjs';
  await writeFile(join(root, hook), `
    import assert from 'node:assert/strict';
    import { readFile, writeFile } from 'node:fs/promises';
    import { join } from 'node:path';

    export default async function customize({ site, course }) {
      const text = await readFile(join(site, 'media', 'message.txt'), 'utf8');
      if (text === 'fail') throw new Error('custom shell failed');
      const model = JSON.parse(await readFile(join(site, 'course.json'), 'utf8'));
      assert.equal(model.title, course.title);
      assert.ok(course.chapters[0].lessons[0].steps[0].text);
      assert.ok(model.chapters[0].lessons[0].steps[0].html);
      assert.equal(model.chapters[0].lessons[0].steps[0].text, undefined);
      assert.match(await readFile(join(site, '_board', 'diagrams.js'), 'utf8'), /renderDiagram/);
      await writeFile(join(site, 'index.html'), '<h1>' + text + '</h1>');
    }
  `);
  const args = [root, '--customize', hook];
  execFileSync(process.execPath, [cli, 'build', ...args]);
  const index = join(root, 'dist', 'index.html');
  assert.equal(await readFile(index, 'utf8'), '<h1>First build</h1>');
  assert.equal(await readFile(join(root, 'dist', '.nojekyll'), 'utf8'), '');

  const preview = await launchPreview(t, ['preview', root]);
  await writeFile(message, 'Edited source');
  const published = await fetch(preview);
  assert.equal(published.status, 200);
  assert.equal(await published.text(), '<h1>First build</h1>');

  const url = await launchPreview(t, ['dev', ...args]);
  const edited = await fetch(url);
  assert.equal(edited.status, 200);
  assert.equal(await edited.text(), '<h1>Edited source</h1>');
  const module = await fetch(new URL('_board/diagrams.js', url));
  assert.equal(module.headers.get('content-type'), 'text/javascript; charset=utf-8');
  assert.match(await module.text(), /renderDiagram/);

  await writeFile(message, 'fail');
  const failure = await fetch(url);
  assert.equal(failure.status, 500);
  assert.equal(await failure.text(), 'custom shell failed');
  assert.equal(await readFile(index, 'utf8'), '<h1>Edited source</h1>');
});
