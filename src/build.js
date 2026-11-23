import { copyFile, mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { assetUrl, escapeHtml } from './browser/diagrams.js';
import { readProject } from './content.js';

export async function copyDiagramRenderer(file) {
  const target = resolve(file);
  await mkdir(dirname(target), { recursive: true });
  await copyFile(new URL('./browser/diagrams.js', import.meta.url), target);
}

export async function copyBrowserShell(directory) {
  const target = resolve(directory);
  await mkdir(target, { recursive: true });
  for (const file of ['app.js', 'shell.js', 'navigation.js', 'diagrams.js', 'panes.js']) {
    await copyFile(new URL(`./browser/${file}`, import.meta.url), join(target, file));
  }
}

function analyticsMarkup(settings) {
  const { GOOGLE_TAG_ID: google = '', UMAMI_WEBSITE_ID: umami = '',
    UMAMI_SCRIPT_URL: umamiUrl = '', PLAUSIBLE_SCRIPT_URL: plausible = '' } = settings;
  const scripts = [];
  const scriptUrl = (value, name) => {
    let url;
    try { url = new URL(value); } catch { throw new Error(`${name} must be an HTTPS URL.`); }
    if (url.protocol !== 'https:' || url.username || url.password) throw new Error(`${name} must be an HTTPS URL.`);
    return escapeHtml(url.href);
  };
  if (google) {
    if (!/^G-[A-Z0-9]+$/i.test(google)) throw new Error('GOOGLE_TAG_ID must be a GA4 measurement ID.');
    scripts.push(`<script async src="https://www.googletagmanager.com/gtag/js?id=${google}"></script>
  <script>
    window.dataLayer = window.dataLayer || [];
    function gtag() { dataLayer.push(arguments); }
    gtag('js', new Date());
    gtag('config', '${google}');
    window.addEventListener('hashchange', () => gtag('event', 'page_view', { page_location: location.href }));
  </script>`);
  }
  if (umami) {
    if (!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(umami)) {
      throw new Error('UMAMI_WEBSITE_ID must be a UUID.');
    }
    scripts.push(`<script defer src="${scriptUrl(umamiUrl || 'https://cloud.umami.is/script.js', 'UMAMI_SCRIPT_URL')}" data-website-id="${umami}"></script>`);
  } else if (umamiUrl) {
    throw new Error('UMAMI_SCRIPT_URL requires UMAMI_WEBSITE_ID.');
  }
  if (plausible) {
    scripts.push(`<script defer src="${scriptUrl(plausible, 'PLAUSIBLE_SCRIPT_URL')}"></script>
  <script>
    window.plausible = window.plausible || function() { (window.plausible.q = window.plausible.q || []).push(arguments); };
    window.plausible.init = window.plausible.init || function(options) { window.plausible.o = options || {}; };
    window.plausible.init({ hashBasedRouting: true });
  </script>`);
  }
  return scripts.join('\n  ');
}

async function stageDefaultSite({ root, site, course }, files, analytics) {
  const browser = join(site, '_board');
  await copyBrowserShell(browser);
  const template = await readFile(new URL('./browser/index.html', import.meta.url), 'utf8');
  const themeLink = course.theme
    ? `<link rel="stylesheet" href="${escapeHtml(assetUrl(course.theme))}">` : '';
  const attributes = `data-course-id="${escapeHtml(course.id)}" data-theme="${escapeHtml(course.preset ?? 'classic')}"`;
  const index = template.replace('data-course-attributes', `${attributes}${course.theme ? ' data-custom-theme' : ''}`)
    .replace('<!-- Custom theme -->', themeLink)
    .replace('<!-- Analytics -->', analyticsMarkup(analytics));
  await writeFile(join(site, 'index.html'), index);
  for (const file of ['course.css', 'favicon.svg']) {
    await copyFile(new URL(`./browser/${file}`, import.meta.url), join(browser, file));
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

export async function buildSite(directory = '.', { shell, customize, analytics = process.env } = {}) {
  if (!analytics || typeof analytics !== 'object' || Array.isArray(analytics)) throw new TypeError('analytics must be an object.');
  if (customize !== undefined && typeof customize !== 'function') throw new TypeError('customize must be a function.');
  if (shell && customize) throw new Error('Choose either shell or customize.');
  const root = resolve(directory);
  const { course, files } = await readProject(root);
  const temporary = await mkdtemp(join(root, '.course-board-'));
  const site = join(temporary, 'site');
  const output = join(root, 'dist');
  const backup = join(temporary, 'previous');
  let discardTemporary = true;
  try {
    await mkdir(site, { recursive: true });
    const context = { root, site, course };
    if (shell) {
      await shell(context);
    } else {
      await stageDefaultSite(context, files, analytics);
      if (customize) await customize(context);
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
