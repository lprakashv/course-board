import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { copyFile, cp, lstat, mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import Ajv from 'ajv';
import { stringify } from 'yaml';
import { loadSchema, parseLesson, readProject, validate } from '../content.js';
import { isAssetPath } from '../browser/diagrams.js';

const ajv = new Ajv({ allErrors: true });
for (const name of ['manifest', 'lesson', 'step']) ajv.addSchema(await loadSchema(name), `${name}.json`);
const bundleSchema = ajv.compile(await loadSchema('ingest'));

async function info(path) {
  try {
    return await lstat(path);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

async function sourceDirectory(path) {
  const entry = await info(path);
  if (!entry) return false;
  if (!entry.isDirectory()) throw new Error(`${path}: expected a directory`);
  const entries = await readdir(path, { recursive: true, withFileTypes: true });
  for (const item of entries) {
    if (!item.isFile() && !item.isDirectory()) throw new Error(`${join(item.parentPath, item.name)}: expected a regular file or directory`);
  }
  return true;
}

export async function readDraft(root) {
  await sourceDirectory(join(root, 'content'));
  const manifestInfo = await info(join(root, 'content/course.json'));
  if (!manifestInfo) {
    return {
      revision: null,
      manifest: { version: 1, id: '', title: '', chapters: [] },
      lessons: [],
    };
  }
  const { manifest, course, sources } = await readProject(root, { includeSources: true });
  const lessonList = course.chapters.flatMap(chapter => chapter.lessons);
  return {
    revision: createHash('sha256').update(JSON.stringify([manifest, [...sources]])).digest('hex'),
    manifest,
    lessons: lessonList.map(lesson => ({
      ...lesson,
      steps: lesson.steps.map(({ html, snippet, ...step }) => snippet
        ? { ...step, snippet: { src: snippet.src, language: snippet.language } }
        : step),
    })),
  };
}

function lessonMarkdown({ id, steps, ...metadata }) {
  const yaml = value => stringify(value, { lineWidth: 0 });
  const body = steps.map(({ title, text, ...settings }) => {
    const heading = title.trim();
    const suffix = heading.endsWith('#') ? ' ##' : '';
    const block = Object.keys(settings).length ? `\n\n\`\`\`step\n${yaml(settings)}\`\`\`` : '';
    return `## ${heading}${suffix}${block}\n\n${text.trim()}`;
  });
  const source = `---\n${yaml(metadata)}---\n\n${body.join('\n\n')}\n`;
  const compiled = parseLesson(source, id).steps;
  if (compiled.length !== steps.length || compiled.some((step, index) =>
    step.title !== steps[index].title.trim() || step.text !== steps[index].text.replace(/\r\n?/g, '\n').trim())) {
    throw new Error(`Lesson ${id}: use ### or lower for headings inside steps and close fenced code blocks.`);
  }
  return source;
}

function validateBundle(bundle) {
  validate(bundleSchema, bundle, 'Course bundle');
  const listed = bundle.manifest.chapters.flatMap(chapter => chapter.lessons);
  const ids = new Set(listed);
  if (ids.size !== listed.length) throw new Error('A lesson ID can appear only once in the course outline.');
  for (const { id } of bundle.lessons) {
    if (!ids.delete(id)) throw new Error(`Unexpected or duplicate lesson "${id}" in the bundle.`);
  }
  if (ids.size) throw new Error(`Missing lesson content for ${[...ids].join(', ')}.`);
  for (const path of Object.keys(bundle.assets ?? {})) {
    if (!isAssetPath(path)) throw new Error(`Invalid public asset path "${path}".`);
  }
  if (bundle.contentFiles) {
    const references = new Set([bundle.manifest.dataSchema]);
    for (const { steps } of bundle.lessons) {
      for (const { snippet } of steps) {
        if (snippet) references.add(`snippets/${snippet.src}`);
      }
    }
    for (const path of Object.keys(bundle.contentFiles)) {
      if (!isAssetPath(path) || path === 'course.json' || !references.has(path)) {
        throw new Error(`Invalid content file path "${path}". Map only the course data schema and referenced snippets.`);
      }
    }
  }
}

async function readBundleFiles(file, mapping = {}) {
  const files = new Map();
  for (const [target, path] of Object.entries(mapping)) {
    if (isAbsolute(path)) throw new Error(`Use a path relative to the bundle for "${target}".`);
    const source = resolve(dirname(file), path);
    if (!(await lstat(source)).isFile()) throw new Error(`${source}: expected a regular file`);
    files.set(target, await readFile(source));
  }
  return files;
}

export async function ingestBundle(file, directory) {
  const source = await readFile(file, 'utf8');
  let bundle;
  try {
    bundle = JSON.parse(source.replace(/^\uFEFF/, ''));
  } catch (error) {
    throw new Error(`${file}: ${error.message}`, { cause: error });
  }
  validateBundle(bundle);
  const assets = await readBundleFiles(file, bundle.assets);
  const contentFiles = await readBundleFiles(file, bundle.contentFiles);
  await saveDraft(directory, { manifest: bundle.manifest, lessons: bundle.lessons }, assets, { contentFiles });
}

export async function saveDraft(directory, draft, assets, { revision, contentFiles = new Map() } = {}) {
  validateBundle(draft);
  const root = resolve(directory);
  const lock = join(root, '.course-board-author-lock');
  await mkdir(root, { recursive: true });
  try {
    await mkdir(lock);
  } catch (error) {
    if (error.code === 'EEXIST') throw new Error('Another Course Board author is saving. Try again after it finishes.');
    throw error;
  }
  let temporary;
  let keepBackup = false;
  try {
    const previous = revision === undefined ? undefined : await readDraft(root);
    if (previous && revision !== previous.revision) {
      const error = new Error('The course changed on disk. Reload Studio before saving.');
      error.status = 409;
      throw error;
    }
    const originals = new Map(previous?.lessons.map(lesson => [lesson.id, lesson]));
    temporary = await mkdtemp(join(root, '.course-board-'));
    const staged = join(temporary, 'next');
    for (const name of ['content', 'public']) {
      const source = join(root, name);
      if (await sourceDirectory(source)) {
        await cp(source, join(staged, name), { recursive: true, mode: constants.COPYFILE_FICLONE });
      }
    }
    const lessons = join(staged, 'content/lessons');
    await mkdir(lessons, { recursive: true });
    const changes = [];
    for (const [directory, files] of [['public', assets], ['content', contentFiles]]) {
      for (const [path, bytes] of files) {
        if (!isAssetPath(path)) throw new Error(`Invalid ${directory} file path "${path}".`);
        const relative = `${directory}/${path}`;
        const target = join(staged, relative);
        await mkdir(dirname(target), { recursive: true });
        if (await info(target)) {
          if ((await readFile(target)).equals(bytes)) continue;
          if (previous) throw new Error(`File "${relative}" already exists with different content.`);
        }
        await writeFile(target, bytes);
        changes.push(relative);
      }
    }
    for (const lesson of draft.lessons) {
      if (isDeepStrictEqual(lesson, originals.get(lesson.id))) continue;
      await writeFile(join(lessons, `${lesson.id}.md`), lessonMarkdown(lesson));
      changes.push(`content/lessons/${lesson.id}.md`);
    }
    if (!isDeepStrictEqual(draft.manifest, previous?.manifest)) {
      await writeFile(join(staged, 'content/course.json'), `${JSON.stringify(draft.manifest, null, 2)}\n`);
      changes.push('content/course.json');
    }
    const saved = await readDraft(staged);
    if (previous && previous.revision !== (await readDraft(root)).revision) {
      const error = new Error('The course changed during the save. Reload Studio before saving.');
      error.status = 409;
      throw error;
    }
    const moved = [];
    try {
      for (const path of changes) {
        const target = join(root, path);
        const existing = await info(target);
        let backup;
        if (existing) {
          if (!existing.isFile()) throw new Error(`${target}: expected a regular file`);
          backup = join(temporary, 'previous', path);
          await mkdir(dirname(backup), { recursive: true });
          await copyFile(target, backup);
        }
        await mkdir(dirname(target), { recursive: true });
        await rename(join(staged, path), target);
        moved.push({ target, backup });
      }
    } catch (error) {
      try {
        for (const { target, backup } of moved.reverse()) {
          if (backup) await rename(backup, target);
          else await rm(target);
        }
      } catch (restoreError) {
        keepBackup = true;
        throw new Error(`Could not restore course files. Backups are in ${temporary}.`, { cause: restoreError });
      }
      throw error;
    }
    return saved;
  } finally {
    try {
      if (temporary && !keepBackup) await rm(temporary, { recursive: true, force: true });
    } finally {
      await rm(lock, { recursive: true, force: true });
    }
  }
}
