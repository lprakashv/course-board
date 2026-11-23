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

test('the sample builds its diagrams and snippets into a static site', async t => {
  const path = await fixture(t);
  const course = await compileCourse(path);
  const lessons = course.chapters.flatMap(chapter => chapter.lessons);
  assert.deepEqual(lessons.flatMap(lesson => lesson.steps.map(step => step.diagram?.type).filter(Boolean)),
    ['excalidraw', 'ascii', 'html', 'image', 'custom', 'excalidraw']);
  assert.match(lessons[0].steps[0].text, /product:42/);

  const output = await buildSite(path);
  const index = await readFile(join(output, 'index.html'), 'utf8');
  assert.match(index, /src="\.\/_board\/app.js"/);
  assert.match(index, /data-course-id="cache-fundamentals" data-theme="classic" data-custom-theme/);
  assert.match(index, /<link rel="stylesheet" href="\.\/media\/theme\.css">/);
  const built = JSON.parse(await readFile(join(output, 'course.json'), 'utf8'));
  assert.match(built.chapters[0].lessons[0].steps[0].html, /<code>product:42<\/code>/);
  assert.match(built.chapters[0].lessons[0].steps[0].html, /<table data-board-state="">/);
  assert.equal(built.chapters[0].lessons[0].steps[0].text, undefined);
  const snippetStep = built.chapters[0].lessons[1].steps[1];
  assert.equal(snippetStep.id, 'compare-windows');
  assert.match(snippetStep.html, /<pre><code class="language-python">def hit_rate/);
  assert.equal(snippetStep.snippet.text, await readFile(join(path, 'content/snippets/hit-rate.py'), 'utf8'));
  assert.equal(built.dataSchema, undefined);
  assert.equal(await readFile(join(output, '.nojekyll'), 'utf8'), '');
  assert.deepEqual(await readFile(join(output, 'media/diagrams/hit-rate.png')),
    await readFile(join(path, 'public/diagrams/hit-rate.png')));

  const module = join(path, 'vendor/diagrams.mjs');
  await copyDiagramRenderer(module);
  assert.equal(typeof (await import(pathToFileURL(module))).renderDiagram, 'function');
});

test('the built page sets the course preset before the learner loads', async t => {
  const path = await fixture(t);
  const manifestPath = join(path, 'content/course.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  manifest.preset = 'slate';
  delete manifest.theme;
  await writeFile(manifestPath, JSON.stringify(manifest));

  const output = await buildSite(path);
  const index = await readFile(join(output, 'index.html'), 'utf8');
  assert.match(index, /<html lang="en" data-course-id="cache-fundamentals" data-theme="slate">/);
  assert.doesNotMatch(index, /\.\/media\/theme\.css/);
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
  const course = await compileCourse(path);
  const { src } = course.chapters[0].lessons[0].steps[0].diagram;
  const image = join(path, 'public', src);
  await rm(image);
  await assert.rejects(compileCourse(path), /read-through-a-cache\.md, step 1: asset/);
  await symlink(join(example, 'public', src), image);
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

test('only the example state table on a step with a diagram is marked for the whiteboard', () => {
  const table = ['| Label | Value |', '| --- | --- |', '| Result | **Ready** |'].join('\n');
  const source = ['---', 'title: Test lesson', '---', '## First', '```step',
    'diagram: {type: ascii, alt: An arrow, text: "->"}', '```', '### Other values', '', table, '',
    '### Example state', '', table, '', '## Second', '### Example state', '', table].join('\n');
  const { steps } = parseLesson(source, 'test');
  assert.match(steps[0].html, /<h3>Other values<\/h3>\n<table>/);
  assert.match(steps[0].html, /<h3>Example state<\/h3>\n<table data-board-state="">/);
  assert.match(steps[0].text, /\| Result \| \*\*Ready\*\* \|/);
  assert.doesNotMatch(steps[1].html, /data-board-state/);
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

test('named links follow a moved step and numbered links still use its position', () => {
  const named = { id: 'example', title: 'Example' };
  const lesson = { id: 'test', steps: [{ title: 'First' }, named] };
  const link = lessonHref(lesson.id, named.id);
  assert.equal(link, '#/test/example');
  assert.equal(getRoute(link, [lesson]).step, 1);
  lesson.steps.reverse();
  assert.equal(getRoute(link, [lesson]).step, 0);
  assert.equal(getRoute('#/test/2', [lesson]).step, 1);
  assert.equal(getRoute('#/test/missing', [lesson]).step, 0);

  const source = ['---', 'title: Test', '---', '## First', '```step', 'id: example',
    '```', 'Prose.', '## Second', '```step', 'id: example', '```', 'More prose.'].join('\n');
  assert.throws(() => parseLesson(source, 'test'), /test\.md, step 2: duplicate step ID "example"/);
  assert.throws(() => parseLesson(source.replace('id: example', 'id: "2"'), 'test'), /test\.md, step 1: .*id/);
});

test('snippets render as escaped UTF-8 text and must stay inside the snippet directory', async t => {
  const path = await fixture(t);
  const snippet = join(path, 'content/snippets/hit-rate.py');
  const source = 'print("<cache> & things")\n';
  await writeFile(snippet, source);
  const course = await compileCourse(path);
  const step = course.chapters[0].lessons[1].steps[1];
  assert.equal(step.snippet.text, source);
  assert.match(step.html, /&lt;cache&gt; &amp; things/);
  assert.match(step.text, /^Compare windows/);

  await rm(snippet);
  await assert.rejects(compileCourse(path), /measure-the-hit-rate\.md, step 2: cannot read content\/snippets\/hit-rate\.py/);
  await symlink(join(path, 'content/course.json'), snippet);
  await assert.rejects(compileCourse(path), /step 2: .*without symbolic links/);
  const lessonPath = join(path, 'content/lessons/measure-the-hit-rate.md');
  const lesson = await readFile(lessonPath, 'utf8');
  await writeFile(lessonPath, lesson.replace('src: hit-rate.py', 'src: ../course.json'));
  await assert.rejects(compileCourse(path), /step 2: invalid content path/);
});

test('project schemas report invalid chapter, lesson, step, and custom diagram data', async t => {
  const path = await fixture(t);
  const schemaPath = join(path, 'content/data-schema.json');
  const schema = JSON.parse(await readFile(schemaPath, 'utf8'));
  const required = { type: 'object', required: ['label'], properties: { label: { type: 'string' } } };
  for (const [key, location] of [
    ['chapter', /course\.json, chapter 1: .*label/],
    ['lesson', /read-through-a-cache\.md: .*label/],
    ['step', /read-through-a-cache\.md, step 1: .*label/],
  ]) {
    await writeFile(schemaPath, JSON.stringify({ ...schema, [key]: required }));
    await assert.rejects(compileCourse(path), location);
  }
  await writeFile(schemaPath, JSON.stringify(schema));
  const lessonPath = join(path, 'content/lessons/measure-the-hit-rate.md');
  const lesson = await readFile(lessonPath, 'utf8');
  await writeFile(lessonPath, lesson.replace('after: 80', 'after: 120'));
  await assert.rejects(compileCourse(path), /measure-the-hit-rate\.md, step 2, diagram "hit-rate": \/after must be <= 100/);
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
  await assert.rejects(readFile(join(output, 'course.json')), { code: 'ENOENT' });
  await assert.rejects(buildSite(path, { shell() {}, customize() {} }), /Choose either shell or customize/);
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
