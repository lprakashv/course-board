import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { ingestBundle, readDraft, saveDraft } from '../src/author/project.js';
import { buildSite, compileCourse } from '../src/index.js';

const example = fileURLToPath(new URL('../example/ingest/course.json', import.meta.url));
const cli = fileURLToPath(new URL('../src/cli.js', import.meta.url));

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'course-board-author-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

test('CLI ingest stores an ordered course and assets for the static reader', async t => {
  const root = await fixture(t);
  const run = spawnSync(process.execPath, [cli, 'ingest', example, root], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  const course = await compileCourse(root);
  assert.equal(course.preset, 'slate');
  assert.equal(course.chapters[0].lessons[0].steps[0].diagram.src, 'diagrams/cache-check.svg');
  const output = await buildSite(root);
  assert.match(await readFile(join(output, 'media/diagrams/cache-check.svg'), 'utf8'), /<svg/);
  await assert.rejects(readFile(join(output, 'studio.css')), { code: 'ENOENT' });
  const bundle = JSON.parse(await readFile(example));
  bundle.assets = { '../outside.svg': '../public/diagrams/cache-check.svg' };
  const file = join(root, 'invalid.json');
  await writeFile(file, JSON.stringify(bundle));
  await assert.rejects(ingestBundle(file, root), /Invalid public asset path/);
});

test('Studio saves a scene and its SVG and rejects invalid or stale edits', async t => {
  const root = await fixture(t);
  const empty = await readDraft(root);
  assert.equal(empty.revision, null);
  const options = { revision: empty.revision };
  const draft = {
    manifest: { version: 1, id: 'course', title: 'Course', chapters: [{ title: 'One', lessons: ['sample'] }] },
    lessons: [{ id: 'sample', title: 'Sample', steps: [{
      title: 'Keep the final #', text: 'Use **Markdown**.',
      diagram: { type: 'excalidraw', alt: 'Diagram', src: 'diagrams/scene.svg', source: 'diagrams/scene.excalidraw' },
    }] }],
  };
  const assets = new Map([
    ['diagrams/scene.svg', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>')],
    ['diagrams/scene.excalidraw', Buffer.from(JSON.stringify({ type: 'excalidraw', elements: [] }))],
  ]);
  await assert.rejects(saveDraft(root, draft, new Map(), options), /must be a file in public/);
  assert.equal((await readDraft(root)).revision, null);
  const saved = await saveDraft(root, draft, assets, options);
  assert.deepEqual(saved.lessons, draft.lessons);
  await assert.rejects(saveDraft(root, draft, new Map(), options), /changed on disk/);
  const lessonPath = join(root, 'content/lessons/sample.md');
  const source = (await readFile(lessonPath, 'utf8')).replace('title: Sample', 'title: Sample # retain this comment');
  await writeFile(lessonPath, source);
  await mkdir(join(root, 'public/other'));
  await writeFile(join(root, 'public/other/keep.txt'), 'Keep');
  const next = await readDraft(root);
  next.manifest.title = 'Updated course';
  await saveDraft(root, { manifest: next.manifest, lessons: next.lessons }, new Map(), { revision: next.revision });
  assert.equal(await readFile(lessonPath, 'utf8'), source);
  assert.equal(await readFile(join(root, 'public/other/keep.txt'), 'utf8'), 'Keep');
});
