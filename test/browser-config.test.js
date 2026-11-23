import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import { loadCourseConfig } from '../src/browser/browser-config.js';
import { renderDiagram } from '../src/browser/diagrams.js';

test('browser configuration resolves the JSON model and media from the document', async () => {
  const urls = [];
  const model = { chapters: [] };
  const target = {
    document: { baseURI: 'https://example.test/project/index.html' },
    async fetch(url) {
      urls.push(url.href);
      return { ok: true, json: async () => model };
    },
  };
  const standard = await loadCourseConfig({ target });
  assert.equal(standard.course, model);
  assert.deepEqual(standard.extension, {});
  assert.equal(standard.asset('my diagrams/flow.svg'), 'https://example.test/project/media/my%20diagrams/flow.svg');
  assert.throws(() => standard.asset('../flow.svg'), /Invalid asset path/);

  const custom = await loadCourseConfig({ target, source: './content/course.json', assetBase: './assets' });
  assert.deepEqual(urls, ['https://example.test/project/course.json', 'https://example.test/project/content/course.json']);
  assert.equal(custom.assetBase, 'https://example.test/project/assets/');
  assert.match(renderDiagram({ type: 'svg', src: 'flow.svg', alt: 'Flow' }, custom),
    /https:\/\/example\.test\/project\/assets\/flow\.svg/);
});

test('preloaded models use the extension and wait for the theme to load or fail', { timeout: 5000 }, async t => {
  const root = await mkdtemp(join(tmpdir(), 'course-board-browser-config-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'media'));
  await writeFile(join(root, 'media', 'course extension.mjs'), 'export const diagrams = { meter: () => "<meter></meter>" };');
  const source = { theme: 'dark mode.css', extension: 'course extension.mjs', chapters: [] };

  for (const event of ['onload', 'onerror']) {
    let appended;
    const stylesheet = new Promise(resolve => { appended = resolve; });
    const target = {
      document: {
        baseURI: pathToFileURL(join(root, 'index.html')).href,
        createElement(tag) { assert.equal(tag, 'link'); return {}; },
        head: { append: appended },
      },
    };
    let ready = false;
    const pending = loadCourseConfig({ target, source }).then(config => {
      ready = true;
      return config;
    });
    const link = await stylesheet;
    assert.equal(ready, false);
    assert.equal(link.rel, 'stylesheet');
    assert.equal(link.href, pathToFileURL(join(root, 'media', 'dark mode.css')).href);
    link[event]();
    const { course, extension } = await pending;
    assert.equal(course, source);
    assert.equal(extension.diagrams.meter(), '<meter></meter>');
  }
});

test('browser configuration reports model failures before loading a theme', async () => {
  const target = {
    document: { baseURI: 'https://example.test/project/' },
    async fetch() { return { ok: false, status: 404 }; },
  };
  await assert.rejects(loadCourseConfig({ target }), /course\.json \(HTTP 404\)/);
  await assert.rejects(loadCourseConfig({ target, source: null }), /Expected a course model object/);
  await assert.rejects(loadCourseConfig({ target, source: { extension: '../unsafe.mjs' } }), /Invalid asset path/);
});
