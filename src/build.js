import { copyFile, mkdir, mkdtemp, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { readProject } from './content.js';

export async function copyDiagramRenderer(file) {
  const target = resolve(file);
  await mkdir(dirname(target), { recursive: true });
  await copyFile(new URL('./browser/diagrams.js', import.meta.url), target);
}

export async function copyBrowserShell(directory) {
  const target = resolve(directory);
  await mkdir(target, { recursive: true });
  for (const file of ['app.js', 'shell.js', 'navigation.js', 'diagrams.js']) {
    await copyFile(new URL(`./browser/${file}`, import.meta.url), join(target, file));
  }
}

export async function buildSite(directory = '.', { shell } = {}) {
  const root = resolve(directory);
  const { course, files } = await readProject(root);
  const temporary = await mkdtemp(join(root, '.course-board-'));
  const site = join(temporary, 'site');
  const output = join(root, 'dist');
  const backup = join(temporary, 'previous');
  let discardTemporary = true;
  try {
    await mkdir(site, { recursive: true });
    if (shell) {
      await shell({ root, site, course });
    } else {
      await mkdir(join(site, '_board'), { recursive: true });
      for (const file of ['index.html', 'app.js', 'shell.js', 'navigation.js', 'diagrams.js', 'course.css', 'favicon.svg']) {
        const target = file === 'index.html' ? join(site, file) : join(site, '_board', file);
        await copyFile(new URL(`./browser/${file}`, import.meta.url), target);
      }
      for (const file of files) {
        const target = join(site, 'media', file);
        await mkdir(dirname(target), { recursive: true });
        await copyFile(join(root, 'public', file), target);
      }
      const browserCourse = {
        ...course,
        chapters: course.chapters.map(chapter => ({
          ...chapter,
          lessons: chapter.lessons.map(lesson => ({
            ...lesson,
            steps: lesson.steps.map(({ text, ...step }) => step),
          })),
        })),
      };
      await writeFile(join(site, 'course.json'), JSON.stringify(browserCourse));
      await writeFile(join(site, '.nojekyll'), '');
    }
    let hasBackup = false;
    try {
      await rename(output, backup);
      hasBackup = true;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    try {
      await rename(site, output);
    } catch (error) {
      if (hasBackup) {
        try {
          await rename(backup, output);
        } catch (restoreError) {
          discardTemporary = false;
          throw new Error(`Could not replace dist. Previous build is in ${backup}.`, { cause: restoreError });
        }
      }
      throw error;
    }
  } finally {
    if (discardTemporary) await rm(temporary, { recursive: true, force: true });
  }
  return output;
}
