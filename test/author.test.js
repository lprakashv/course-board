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
  assert.equal(course.chapters[0].lessons[0].steps[0].diagram.type, 'svg');
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

test('import and Studio preserve stable step IDs, snippet references, and data validation', async t => {
  const root = await fixture(t);
  const file = join(root, 'bundle.json');
  const courseRoot = join(root, 'course');
  const snippet = { src: 'example.py', language: 'python' };
  const bundle = {
    manifest: {
      version: 1, id: 'sample', title: 'Sample', preset: 'night', dataSchema: 'data-schema.json',
      chapters: [{ title: 'One', lessons: ['sample'] }],
    },
    lessons: [{ id: 'sample', title: 'Sample', steps: [
      { id: 'run-example', title: 'Run the example', text: 'Read the output.', snippet, data: { count: 1 } },
    ] }],
    contentFiles: { 'data-schema.json': 'schema.json', 'snippets/example.py': 'example.py' },
  };
  await writeFile(file, JSON.stringify(bundle));
  await writeFile(join(root, 'schema.json'), JSON.stringify({
    step: { type: 'object', required: ['count'], properties: { count: { type: 'integer' } } },
  }));
  await writeFile(join(root, 'example.py'), 'print("<example>")\n');
  await ingestBundle(file, courseRoot);

  const { manifest, lessons, revision } = await readDraft(courseRoot);
  const step = lessons[0].steps[0];
  assert.equal(manifest.dataSchema, 'data-schema.json');
  assert.equal(step.id, 'run-example');
  assert.deepEqual(step.snippet, snippet);
  step.text = 'Read the new output.';
  step.data.count = 'one';
  await assert.rejects(saveDraft(courseRoot, { manifest, lessons }, new Map(), { revision }), /count must be integer/);
  step.data.count = 2;
  const saved = await saveDraft(courseRoot, { manifest, lessons }, new Map(), { revision });
  assert.deepEqual(saved.lessons, lessons);
  const compiled = (await compileCourse(courseRoot)).chapters[0].lessons[0].steps[0];
  assert.match(compiled.html, /&lt;example&gt;/);
  assert.equal(compiled.snippet.text, 'print("<example>")\n');

  await writeFile(join(courseRoot, 'content/snippets/example.py'), 'print("updated")\n');
  await assert.rejects(saveDraft(courseRoot, { manifest, lessons }, new Map(), { revision: saved.revision }), /changed on disk/);
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

test('Studio keeps unlisted lesson files and detects manifest edits', async t => {
  const root = await fixture(t);
  await ingestBundle(example, root);
  const opened = await readDraft(root);
  const manifestPath = join(root, 'content/course.json');
  const manifestSource = await readFile(manifestPath, 'utf8');
  await writeFile(manifestPath, manifestSource.trimEnd());
  const { manifest, lessons, revision } = opened;
  await assert.rejects(saveDraft(root, { manifest, lessons }, new Map(), { revision }), /changed on disk/);

  const current = await readDraft(root);
  const lessonId = 'archived-lesson';
  const lessonPath = join(root, 'content/lessons', `${lessonId}.md`);
  const original = '---\ntitle: Archived lesson\n---\n## Keep\nOriginal text.\n';
  await writeFile(lessonPath, original);
  current.manifest.chapters[0].lessons.push(lessonId);
  current.lessons.push({ id: lessonId, title: 'New lesson', steps: [{ title: 'Start', text: 'New text.' }] });
  await assert.rejects(saveDraft(root, { manifest: current.manifest, lessons: current.lessons }, new Map(),
    { revision: current.revision }), /Lesson ID "archived-lesson" already has a source file/);
  assert.equal(await readFile(lessonPath, 'utf8'), original);
  assert.equal((await readDraft(root)).revision, current.revision);
});
