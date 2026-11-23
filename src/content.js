import { lstat, readdir, readFile } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';
import Ajv from 'ajv';
import MarkdownIt from 'markdown-it';
import { parseDocument } from 'yaml';
import { isAssetPath } from './browser/diagrams.js';

export async function loadSchema(name) {
  const url = new URL(`../schemas/${name}.json`, import.meta.url);
  return JSON.parse(await readFile(url, 'utf8'));
}

const ajv = new Ajv({ allErrors: true });
const manifestSchema = ajv.compile(await loadSchema('manifest'));
const lessonSchema = ajv.compile(await loadSchema('lesson'));
const stepSchema = ajv.compile(await loadSchema('step'));
const markdown = new MarkdownIt({ html: false });

export function validate(schema, value, location) {
  if (schema(value)) return;
  const details = schema.errors.map(error => {
    const property = error.params.additionalProperty ?? error.params.propertyName;
    return `${error.instancePath || '/'} ${error.message}${property ? ` (${property})` : ''}`;
  });
  throw new Error(`${location}: ${[...new Set(details)].join('; ')}`);
}

function yaml(source, location) {
  const document = parseDocument(source, { stringKeys: true });
  const problem = document.errors[0] ?? document.warnings[0];
  if (problem) throw new Error(`${location}: ${problem.message}`);
  try {
    return document.toJS({ maxAliasCount: 0 });
  } catch (error) {
    throw new Error(`${location}: ${error.message}`, { cause: error });
  }
}

export function parseLesson(source, id) {
  const file = `content/lessons/${id}.md`;
  const normalized = source.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const front = normalized.match(/^---[ \t]*\n([\s\S]*?)\n---[ \t]*(?:\n|$)/);
  if (!front) throw new Error(`${file}: expected YAML front matter between --- lines`);
  const metadata = yaml(front[1], file);
  validate(lessonSchema, metadata, file);

  const body = normalized.slice(front[0].length);
  const lines = body.split('\n');
  const tokens = markdown.parse(body, {});
  const headings = tokens.flatMap((token, index) =>
    token.type === 'heading_open' && token.tag === 'h2' && token.markup === '##' && token.level === 0
      ? [index] : []);
  if (headings[0] !== 0) throw new Error(`${file}: start the lesson with a ## step heading`);

  const steps = headings.map((index, position) => {
    const location = `${file}, step ${position + 1}`;
    const [heading, titleToken, , fence] = tokens.slice(index, index + 4);
    const title = titleToken.content.trim();
    if (!title) throw new Error(`${location}: add a step title`);
    const end = tokens[headings[position + 1]]?.map[0];
    const hasMetadata = fence?.type === 'fence' && fence.info.trim() === 'step';
    const settings = hasMetadata ? yaml(fence.content, location) : {};
    validate(stepSchema, settings, location);

    const start = hasMetadata ? fence.map[1] : heading.map[1];
    const prose = lines.slice(start, end).join('\n').trim();
    if (!prose) throw new Error(`${location}: add Markdown after the step heading`);
    if (markdown.parse(prose, {}).some(token => token.type === 'fence' && token.info.trim() === 'step')) {
      throw new Error(`${location}: put one step block directly after the heading`);
    }
    return { title, text: prose, html: markdown.render(prose), ...settings };
  });
  return { id, ...metadata, steps };
}

export async function publicFiles(directory) {
  let entries;
  try {
    const info = await lstat(directory);
    if (!info.isDirectory()) throw new Error('public/ must be a directory.');
    entries = await readdir(directory, { recursive: true, withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') return new Set();
    throw error;
  }
  const files = new Set();
  for (const entry of entries) {
    const path = relative(directory, join(entry.parentPath, entry.name)).split(sep).join('/');
    if (entry.isDirectory()) continue;
    if (!entry.isFile() || !isAssetPath(path)) throw new Error(`public/${path}: expected a regular file with a valid asset path`);
    files.add(path);
  }
  return files;
}

function requireAsset(path, files, location) {
  if (!files.has(path)) throw new Error(`${location}: asset "${path}" must be a file in public/`);
}

export async function readProject(directory = '.', { includeSources = false } = {}) {
  const root = resolve(directory);
  const manifestPath = join(root, 'content/course.json');
  const input = await readFile(manifestPath, 'utf8');
  let manifest;
  try {
    manifest = JSON.parse(input.replace(/^\uFEFF/, ''));
  } catch (error) {
    throw new Error(`${manifestPath}: ${error.message}`, { cause: error });
  }
  validate(manifestSchema, manifest, manifestPath);

  const publicRoot = join(root, 'public');
  const files = await publicFiles(publicRoot);
  for (const path of [manifest.theme, manifest.extension].filter(Boolean)) {
    requireAsset(path, files, manifestPath);
  }

  const ids = new Set();
  const sources = includeSources ? new Map() : undefined;
  const chapters = [];
  for (const chapter of manifest.chapters) {
    const lessons = [];
    for (const id of chapter.lessons) {
      if (ids.has(id)) throw new Error(`${manifestPath}: duplicate lesson ID "${id}"`);
      ids.add(id);
      const source = await readFile(join(root, 'content', 'lessons', `${id}.md`), 'utf8');
      sources?.set(id, source);
      const lesson = parseLesson(source, id);
      for (const [index, step] of lesson.steps.entries()) {
        const diagram = step.diagram;
        if (!diagram) continue;
        const location = `${id}.md, step ${index + 1}`;
        if (diagram.type === 'custom' && !manifest.extension) {
          throw new Error(`${location}: set extension in content/course.json for custom diagrams`);
        }
        if (diagram.src) requireAsset(diagram.src, files, location);
        if (diagram.source) {
          requireAsset(diagram.source, files, location);
          const sceneLocation = `${location}: "${diagram.source}"`;
          const rawScene = await readFile(join(publicRoot, diagram.source), 'utf8');
          let scene;
          try {
            scene = JSON.parse(rawScene.replace(/^\uFEFF/, ''));
          } catch (error) {
            throw new Error(`${sceneLocation}: invalid JSON`, { cause: error });
          }
          if (scene?.type !== 'excalidraw' || !Array.isArray(scene.elements)) {
            throw new Error(`${sceneLocation} must be an Excalidraw scene`);
          }
        }
      }
      lessons.push(lesson);
    }
    chapters.push({ ...chapter, lessons });
  }

  const { $schema, ...course } = manifest;
  return { course: { ...course, chapters }, files, manifest, sources };
}

export async function compileCourse(directory = '.') {
  return (await readProject(directory)).course;
}
