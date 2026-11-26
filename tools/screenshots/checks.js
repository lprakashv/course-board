import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateConfig } from './capture.js';

test('accepts page definitions with navigation steps', () => {
  const config = { pages: [{ name: 'lesson', path: '/#lesson', viewport: { width: 800, height: 600 }, steps: [
    { action: 'click', selector: 'a' },
    { action: 'fill', selector: 'input', value: 'search' },
    { action: 'press', selector: 'input', key: 'Enter' },
    { action: 'waitFor', selector: 'main' }
  ] }] };
  assert.equal(validateConfig(config), config);
});

test('rejects invalid or duplicate screenshot definitions', () => {
  for (const config of [
    { pages: [] },
    { pages: [{ name: '../outside', path: '/' }] },
    { pages: [{ name: 'a', path: '//other.example' }] },
    { pages: [{ name: 'a', path: '/', steps: [{ action: 'fill', selector: 'input' }] }] },
    { pages: [{ name: 'a', path: '/' }, { name: 'a', path: '/other' }] }
  ]) assert.throws(() => validateConfig(config));
});

test('publishes images and updates only the marked section', async () => {
  const { mkdtemp, mkdir, readFile, writeFile, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { publish } = await import('./publish.js');
  const root = await mkdtemp(join(tmpdir(), 'screenshots-'));
  try {
    const images = join(root, 'capture');
    await mkdir(images);
    await mkdir(join(root, 'docs'));
    await writeFile(join(images, 'home.png'), 'png');
    await writeFile(join(root, 'docs', 'guide.md'), 'Before\n<!-- preview:start -->\nold\n<!-- preview:end -->\nAfter\n');
    const config = { publish: { directory: 'assets/screenshots', file: 'docs/guide.md', marker: 'preview' }, pages: [{ name: 'home', path: '/' }] };
    await publish(config, root, images, join(root, 'manifest'));
    assert.equal(await readFile(join(root, 'docs', 'guide.md'), 'utf8'), 'Before\n<!-- preview:start -->\n![home](../assets/screenshots/home.png)\n<!-- preview:end -->\nAfter\n');
    assert.equal(await readFile(join(root, 'assets', 'screenshots', 'home.png'), 'utf8'), 'png');
    await writeFile(join(root, 'docs', 'guide.md'), 'No markers');
    await assert.rejects(publish(config, root, images), /markers/);
    assert.equal(await readFile(join(root, 'docs', 'guide.md'), 'utf8'), 'No markers');
    config.publish.directory = '../outside';
    await assert.rejects(publish(config, root, images), /Invalid repository path/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
