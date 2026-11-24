import { lstat, readdir, readFile } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';
import Ajv from 'ajv';
import MarkdownIt from 'markdown-it';
import { parseDocument } from 'yaml';
import { escapeHtml, isAssetPath } from './browser/diagrams.js';

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

function parseYaml(source, location) {
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
  const frontMatter = normalized.match(/^---[ \t]*\n([\s\S]*?)\n---[ \t]*(?:\n|$)/);
  if (!frontMatter) throw new Error(`${file}: expected YAML front matter between --- lines`);
  const metadata = parseYaml(frontMatter[1], file);
  validate(lessonSchema, metadata, file);

  const body = normalized.slice(frontMatter[0].length);
  const lines = body.split('\n');
  const tokens = markdown.parse(body, {});
  const stepHeadings = [];
  for (const [index, token] of tokens.entries()) {
    if (token.type === 'heading_open' && token.tag === 'h2' && token.markup === '##' && token.level === 0) {
      stepHeadings.push(index);
    }
  }
  if (stepHeadings[0] !== 0) throw new Error(`${file}: start the lesson with a ## step heading`);

  const stepIds = new Set();
  const steps = stepHeadings.map((index, position) => {
    const location = `${file}, step ${position + 1}`;
    // Markdown-it emits an opening token, the title, and a closing token for each heading.
    const heading = tokens[index];
    const titleToken = tokens[index + 1];
    const afterHeading = tokens[index + 3];
    const title = titleToken.content.trim();
    if (!title) throw new Error(`${location}: add a step title`);
    const endLine = tokens[stepHeadings[position + 1]]?.map[0];
    const hasMetadata = afterHeading?.type === 'fence' && afterHeading.info.trim() === 'step';
    const settings = hasMetadata ? parseYaml(afterHeading.content, location) : {};
    validate(stepSchema, settings, location);
    if (settings.id) {
      if (stepIds.has(settings.id)) throw new Error(`${location}: duplicate step ID "${settings.id}"`);
      stepIds.add(settings.id);
    }

    const startLine = hasMetadata ? afterHeading.map[1] : heading.map[1];
    const prose = lines.slice(startLine, endLine).join('\n').trim();
    if (!prose) throw new Error(`${location}: add Markdown after the step heading`);
    const env = {};
    const proseTokens = markdown.parse(prose, env);
    if (proseTokens.some(token => token.type === 'fence' && token.info.trim() === 'step')) {
      throw new Error(`${location}: put one step block directly after the heading`);
    }
    if (settings.diagram) {
      // A table can follow the three heading tokens directly.
      const stateTable = proseTokens.find((token, index) => {
        const heading = proseTokens[index - 3];
        return token.type === 'table_open' && token.level === 0 && heading?.type === 'heading_open' &&
          heading.tag === 'h3' && proseTokens[index - 2].content === 'Example state';
      });
      stateTable?.attrSet('data-board-state', '');
    }
    return { title, text: prose, html: markdown.renderer.render(proseTokens, markdown.options, env), ...settings };
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

async function readLocalContent(root, path, location, sources) {
  if (!isAssetPath(path)) throw new Error(`${location}: invalid content path "${path}"`);
  try {
    let target = root;
    const parts = ['content', ...path.split('/')];
    for (const [index, part] of parts.entries()) {
      target = join(target, part);
      const entry = await lstat(target);
      if (!(index === parts.length - 1 ? entry.isFile() : entry.isDirectory())) {
        throw new Error('expected a regular file in a directory without symbolic links');
      }
    }
    const source = new TextDecoder('utf-8', { fatal: true }).decode(await readFile(target));
    sources?.set(path, source);
    return source;
  } catch (error) {
    throw new Error(`${location}: cannot read content/${path}: ${error.message}`, { cause: error });
  }
}

async function dataValidators(root, path, location, sources) {
  if (!path) return {};
  const source = await readLocalContent(root, path, location, sources);
  try {
    const definitions = JSON.parse(source);
    if (!isObject(definitions) || Object.keys(definitions).some(key => !['chapter', 'lesson', 'step', 'diagrams'].includes(key))) {
      throw new Error('expected an object with chapter, lesson, step, or diagrams keys');
    }
    const custom = new Ajv({ allErrors: true, addUsedSchema: false });
    const { diagrams = {}, ...data } = definitions;
    if (!isObject(diagrams)) throw new Error('diagrams must map renderer names to schemas');
    for (const name of Object.keys(diagrams)) {
      if (!/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(name)) throw new Error(`invalid renderer name "${name}"`);
    }
    const compile = entries => Object.fromEntries(Object.entries(entries).map(([key, schema]) => {
      try {
        return [key, custom.compile(schema)];
      } catch (error) {
        throw new Error(`${key}: ${error.message}`, { cause: error });
      }
    }));
    return { ...compile(data), diagrams: compile(diagrams) };
  } catch (error) {
    throw new Error(`content/${path}: ${error.message}`, { cause: error });
  }
}

const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);

function validateData(schema, data, location) {
  if (schema) validate(schema, data === undefined ? {} : data, location);
}

export async function readProject(directory = '.', { includeSources = false } = {}) {
  const root = resolve(directory);
  const sources = includeSources ? new Map() : undefined;
  const manifestPath = join(root, 'content/course.json');
  const input = await readLocalContent(root, 'course.json', root, sources);
  let manifest;
  try {
    manifest = JSON.parse(input);
  } catch (error) {
    throw new Error(`${manifestPath}: ${error.message}`, { cause: error });
  }
  validate(manifestSchema, manifest, manifestPath);
  const validators = await dataValidators(root, manifest.dataSchema, manifestPath, sources);

  const publicRoot = join(root, 'public');
  const files = await publicFiles(publicRoot);
  for (const path of [manifest.theme, manifest.extension].filter(Boolean)) {
    requireAsset(path, files, manifestPath);
  }

  const ids = new Set();
  const chapters = [];
  for (const [chapterIndex, chapter] of manifest.chapters.entries()) {
    validateData(validators.chapter, chapter.data, `${manifestPath}, chapter ${chapterIndex + 1}`);
    const lessons = [];
    for (const id of chapter.lessons) {
      if (ids.has(id)) throw new Error(`${manifestPath}: duplicate lesson ID "${id}"`);
      ids.add(id);
      const source = await readLocalContent(root, `lessons/${id}.md`, manifestPath, sources);
      const lesson = parseLesson(source, id);
      validateData(validators.lesson, lesson.data, `content/lessons/${id}.md`);
      for (const [index, step] of lesson.steps.entries()) {
        const location = `content/lessons/${id}.md, step ${index + 1}`;
        validateData(validators.step, step.data, location);
        if (step.snippet) {
          const { src, language } = step.snippet;
          const code = await readLocalContent(root, `snippets/${src}`, location, sources);
          step.snippet.text = code;
          step.html += `<pre><code class="language-${language}">${escapeHtml(code)}</code></pre>\n`;
        }
        const diagram = step.diagram;
        if (!diagram) continue;
        if (diagram.type === 'custom' && !manifest.extension) {
          throw new Error(`${location}: set extension in content/course.json for custom diagrams`);
        }
        if (diagram.type === 'custom' && validators.diagrams && Object.hasOwn(validators.diagrams, diagram.name)) {
          validateData(validators.diagrams[diagram.name], diagram.data, `${location}, diagram "${diagram.name}"`);
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

  const { $schema, dataSchema, ...course } = manifest;
  return { course: { ...course, chapters }, files, manifest, sources };
}

export async function compileCourse(directory = '.') {
  return (await readProject(directory)).course;
}
