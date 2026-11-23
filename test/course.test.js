import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildSite, compileCourse, copyDiagramRenderer, parseLesson } from '../src/index.js';
import { assetUrl, renderDiagram } from '../src/browser/diagrams.js';
import { getRoute, lessonHref } from '../src/browser/navigation.js';

const example = fileURLToPath(new URL('../example/', import.meta.url));

async function fixture(t) {
  const path = await mkdtemp(join(tmpdir(), 'course-board-test-'));
  t.after(() => rm(path, { recursive: true, force: true }));
  for (const name of ['content', 'public']) {
    await cp(join(example, name), join(path, name), { recursive: true });
  }
  return path;
}

test('the sample builds every diagram type into a static site', async t => {
  const path = await fixture(t);
  const course = await compileCourse(path);
  const lessons = course.chapters.flatMap(chapter => chapter.lessons);
  assert.deepEqual(lessons.flatMap(lesson => lesson.steps.map(step => step.diagram?.type).filter(Boolean)),
    ['svg', 'ascii', 'html', 'image', 'custom', 'excalidraw']);
  assert.match(lessons[0].steps[0].text, /product:42/);

  const output = await buildSite(path);
  const index = await readFile(join(output, 'index.html'), 'utf8');
  assert.match(index, /src="\.\/_board\/app.js"/);
  const built = JSON.parse(await readFile(join(output, 'course.json'), 'utf8'));
  assert.match(built.chapters[0].lessons[0].steps[0].html, /<code>product:42<\/code>/);
  assert.equal(built.chapters[0].lessons[0].steps[0].text, undefined);
  assert.equal(await readFile(join(output, '.nojekyll'), 'utf8'), '');
  assert.deepEqual(await readFile(join(output, 'media/diagrams/hit-rate.png')),
    await readFile(join(path, 'public/diagrams/hit-rate.png')));

  const module = join(path, 'vendor/diagrams.mjs');
  await copyDiagramRenderer(module);
  assert.equal(typeof (await import(pathToFileURL(module))).renderDiagram, 'function');
});

test('an invalid source preserves the previous build', async t => {
  const path = await fixture(t);
  const output = await buildSite(path);
  const before = await readFile(join(output, 'course.json'));
  const manifestPath = join(path, 'content/course.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  manifest.chapters[1].lessons.push(manifest.chapters[0].lessons[0]);
  await writeFile(manifestPath, JSON.stringify(manifest));
  await assert.rejects(buildSite(path), /duplicate lesson ID "read-through-a-cache"/);
  assert.deepEqual(await readFile(join(output, 'course.json')), before);
});

test('assets must exist and must be regular files inside public', async t => {
  const path = await fixture(t);
  const image = join(path, 'public/diagrams/cache-check.svg');
  await rm(image);
  await assert.rejects(compileCourse(path), /read-through-a-cache\.md, step 1: asset/);
  await symlink(join(example, 'public/diagrams/cache-check.svg'), image);
  await assert.rejects(compileCourse(path), /expected a regular file/);
});

test('a lesson uses top-level headings and treats raw HTML as text', () => {
  const source = [
    '---', 'title: Test lesson', '---', '## First', 'A <node> and **a value**.',
    '', '```text', '## This is code', '```', '', '## Second', 'Some prose.',
  ].join('\r\n');
  const lesson = parseLesson(source, 'test');
  assert.deepEqual(lesson.steps.map(step => step.title), ['First', 'Second']);
  assert.match(lesson.steps[0].html, /&lt;node&gt; and <strong>a value<\/strong>/);
  assert.throws(() => parseLesson(source.replace('## First', 'Content before the first step'), 'test'),
    /start the lesson/);
  assert.throws(() => parseLesson(source.replace('A <node> and **a value**.', 'Lead-in\n\n```step\n{}\n```'), 'test'),
    /directly after/);
});

test('step metadata rejects unknown fields and wrong file types', () => {
  const source = ['---', 'title: Test lesson', '---', '## First', '```step',
    'diagram: {type: svg, alt: Diagram, src: board.png}', '```', 'Some prose.'].join('\n');
  assert.throws(() => parseLesson(source, 'test'), /test\.md, step 1/);
  const withTypo = source.replace('board.png}', 'board.svg, label: Test}');
  assert.throws(() => parseLesson(withTypo, 'test'), /label/);
  assert.equal(parseLesson(source.replace('board.png', 'board.svg'), 'test').steps[0].diagram.src, 'board.svg');
  const withNonJsonData = source.replace('type: svg, alt: Diagram, src: board.png',
    'type: custom, alt: Diagram, name: meter, data: {depth: .inf}');
  assert.throws(() => parseLesson(withNonJsonData, 'test'), /depth/);
});

test('the diagram API escapes text, isolates HTML, and calls custom renderers', () => {
  assert.equal(assetUrl('lesson A/v1.svg'), './media/lesson%20A/v1.svg');
  assert.throws(() => assetUrl('../other.svg'), /Invalid asset path/);
  assert.match(renderDiagram({ type: 'ascii', alt: 'One "node"', text: '<node>' }),
    /aria-label="One &quot;node&quot;">&lt;node&gt;<\/pre>/);
  assert.match(renderDiagram({ type: 'excalidraw', alt: 'Scene', src: 'scene.svg' }), /<img.*scene\.svg/);
  assert.match(renderDiagram({ type: 'html', alt: 'Board', src: 'board.html' }),
    /<iframe.*title="Board" sandbox><\/iframe>/);
  const spec = { type: 'custom', name: 'meter', alt: 'Score', data: { value: 2 } };
  assert.equal(renderDiagram(spec, { renderers: { meter: ({ data }) => `<meter value="${data.value}"></meter>` } }),
    '<meter value="2"></meter>');
  assert.throws(() => renderDiagram(spec), /Missing diagram renderer/);
});

test('direct links resolve steps and clamp numbers to lesson bounds', () => {
  const lessons = [{ id: 'first', steps: ['a'] }, { id: 'second', steps: ['a', 'b'] }];
  assert.equal(lessonHref('second', 1), '#/second/2');
  assert.deepEqual(getRoute('#/second/20', lessons), { lesson: lessons[1], index: 1, step: 1 });
  assert.deepEqual(getRoute('#/unknown/8', lessons), { lesson: lessons[0], index: 0, step: 0 });
});

test('extension data is preserved and rejects non-JSON values', () => {
  const source = ['---', 'title: Test', 'data: {nodes: [one, two]}', '---', '## Step',
    '```step', 'data: {active: [0]}', '```', 'Prose.'].join('\n');
  const lesson = parseLesson(source, 'test');
  assert.deepEqual(lesson.data.nodes, ['one', 'two']);
  assert.deepEqual(lesson.steps[0].data.active, [0]);
  assert.throws(() => parseLesson(source.replace('[one, two]', '[.inf]'), 'test'), /nodes/);
});

test('a custom shell receives validated content and preserves the previous build on failure', async t => {
  const path = await fixture(t);
  const output = await buildSite(path, { shell: async ({ site, course }) => {
    await writeFile(join(site, 'index.html'), course.chapters[0].lessons[0].title);
  } });
  const before = await readFile(join(output, 'index.html'), 'utf8');
  assert.ok(before.length);
  await assert.rejects(buildSite(path, { shell: async () => { throw new Error('shell failed'); } }), /shell failed/);
  assert.equal(await readFile(join(output, 'index.html'), 'utf8'), before);
});

test('chapter extension data is validated and included in the course', async t => {
  const path = await fixture(t);
  const manifestPath = join(path, 'content/course.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  manifest.chapters[0].data = { color: 'green' };
  await writeFile(manifestPath, JSON.stringify(manifest));
  assert.deepEqual((await compileCourse(path)).chapters[0].data, { color: 'green' });
  manifest.chapters[0].data = ['invalid'];
  await writeFile(manifestPath, JSON.stringify(manifest));
  await assert.rejects(compileCourse(path), /data/);
});
