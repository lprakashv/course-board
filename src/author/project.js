import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { copyFile, cp, link, lstat, mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import Ajv from 'ajv';
import { stringify } from 'yaml';
import { loadSchema, parseLesson, readProject, validate } from '../content.js';
import { isAssetPath } from '../browser/diagrams.js';
import { acquireProjectLock } from '../project-lock.js';

const ajv = new Ajv({ allErrors: true });
for (const name of ['manifest', 'lesson', 'step']) ajv.addSchema(await loadSchema(name), `${name}.json`);
const bundleSchema = ajv.compile(await loadSchema('ingest'));

async function entryInfo(path) {
  try {
    return await lstat(path);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

async function checkSourceDirectory(path) {
  const entry = await entryInfo(path);
  if (!entry) return false;
  if (!entry.isDirectory()) throw new Error(`${path}: expected a directory`);
  const entries = await readdir(path, { recursive: true, withFileTypes: true });
  for (const item of entries) {
    if (!item.isFile() && !item.isDirectory()) throw new Error(`${join(item.parentPath, item.name)}: expected a regular file or directory`);
  }
  return true;
}

export async function readDraft(root) {
  await checkSourceDirectory(join(root, 'content'));
  const manifestInfo = await entryInfo(join(root, 'content/course.json'));
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
    revision: createHash('sha256').update(JSON.stringify([...sources])).digest('hex'),
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
  const serializeYaml = value => stringify(value, { lineWidth: 0 });
  const body = steps.map(({ title, text, ...settings }) => {
    const heading = title.trim();
    // A closing marker tells Markdown to keep any trailing hashes in the title.
    const suffix = heading.endsWith('#') ? ' ##' : '';
    const block = Object.keys(settings).length ? `\n\n\`\`\`step\n${serializeYaml(settings)}\`\`\`` : '';
    return `## ${heading}${suffix}${block}\n\n${text.trim()}`;
  });
  const source = `---\n${serializeYaml(metadata)}---\n\n${body.join('\n\n')}\n`;
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

async function stageDraft(root, staged, draft, previous, assets, contentFiles) {
  for (const name of ['content', 'public']) {
    const source = join(root, name);
    if (await checkSourceDirectory(source)) {
      await cp(source, join(staged, name), { recursive: true, mode: constants.COPYFILE_FICLONE });
    }
  }
  const changes = [];
  for (const [directory, files] of [['public', assets], ['content', contentFiles]]) {
    for (const [path, bytes] of files) {
      if (!isAssetPath(path)) throw new Error(`Invalid ${directory} file path "${path}".`);
      const relativePath = `${directory}/${path}`;
      const target = join(staged, relativePath);
      await mkdir(dirname(target), { recursive: true });
      if (await entryInfo(target)) {
        if ((await readFile(target)).equals(bytes)) continue;
        if (previous) throw new Error(`File "${relativePath}" already exists with different content.`);
      }
      await writeFile(target, bytes);
      changes.push({ path: relativePath, createOnly: Boolean(previous) });
    }
  }

  const originals = new Map(previous?.lessons.map(lesson => [lesson.id, lesson]));
  await mkdir(join(staged, 'content/lessons'), { recursive: true });
  for (const lesson of draft.lessons) {
    const original = originals.get(lesson.id);
    if (isDeepStrictEqual(lesson, original)) continue;
    const path = `content/lessons/${lesson.id}.md`;
    const target = join(staged, path);
    const createOnly = Boolean(previous && !original);
    if (createOnly && await entryInfo(target)) {
      throw new Error(`Lesson ID "${lesson.id}" already has a source file. Choose a different ID in Studio.`);
    }
    await writeFile(target, lessonMarkdown(lesson));
    changes.push({ path, createOnly });
  }
  // Publish the manifest last so it does not refer to files that are absent.
  if (!isDeepStrictEqual(draft.manifest, previous?.manifest)) {
    await writeFile(join(staged, 'content/course.json'), `${JSON.stringify(draft.manifest, null, 2)}\n`);
    changes.push({ path: 'content/course.json', createOnly: previous?.revision === null });
  }
  return changes;
}

async function publishDraftFiles(root, staged, backupDirectory, changes) {
  const publishedFiles = [];
  try {
    for (const { path, createOnly } of changes) {
      const target = join(root, path);
      const source = join(staged, path);
      await mkdir(dirname(target), { recursive: true });
      if (createOnly) {
        // An exclusive link leaves a file that appeared during the save intact.
        await link(source, target);
        publishedFiles.push({ target });
        continue;
      }
      const existing = await entryInfo(target);
      let backup;
      if (existing) {
        if (!existing.isFile()) throw new Error(`${target}: expected a regular file`);
        backup = join(backupDirectory, path);
        await mkdir(dirname(backup), { recursive: true });
        await copyFile(target, backup);
      }
      await rename(source, target);
      publishedFiles.push({ target, backup });
    }
  } catch (error) {
    try {
      for (const { target, backup } of publishedFiles.reverse()) {
        if (backup) await rename(backup, target);
        else await rm(target);
      }
    } catch (restoreError) {
      throw new Error(`Could not restore course files. Backups are in ${backupDirectory}.`, { cause: restoreError });
    }
    await rm(backupDirectory, { recursive: true, force: true });
    throw error;
  }
  await rm(backupDirectory, { recursive: true, force: true });
}

export async function saveDraft(directory, draft, assets, { revision, contentFiles = new Map() } = {}) {
  validateBundle(draft);
  const root = resolve(directory);
  await mkdir(root, { recursive: true });
  const releaseLock = await acquireProjectLock(root);
  let temporary;
  try {
    const previous = revision === undefined ? undefined : await readDraft(root);
    if (previous && revision !== previous.revision) {
      const error = new Error('The course changed on disk. Reload Studio before saving.');
      error.status = 409;
      throw error;
    }
    temporary = await mkdtemp(join(root, '.course-board-'));
    const staged = join(temporary, 'next');
    const changes = await stageDraft(root, staged, draft, previous, assets, contentFiles);
    const saved = await readDraft(staged);
    if (previous && previous.revision !== (await readDraft(root)).revision) {
      const error = new Error('The course changed during the save. Reload Studio before saving.');
      error.status = 409;
      throw error;
    }
    // Store backups beside the staging directory so they survive a rollback failure.
    await publishDraftFiles(root, staged, `${temporary}-previous`, changes);
    return saved;
  } finally {
    try {
      if (temporary) await rm(temporary, { recursive: true, force: true });
    } finally {
      await releaseLock();
    }
  }
}
