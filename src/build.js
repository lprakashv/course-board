import { copyFile, mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { assetUrl, escapeHtml } from './browser/diagrams.js';
import { readProject } from './content.js';
import { acquireProjectLock } from './project-lock.js';

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
    if (!/^(?:G|GTM)-[A-Z0-9]+$/i.test(google)) {
      throw new Error('GOOGLE_TAG_ID must be a GA4 measurement ID or Google tag container ID.');
    }
    const container = /^GTM-/i.test(google);
    scripts.push(`<script async src="https://www.googletagmanager.com/${container ? 'gtm.js' : 'gtag/js'}?id=${google}"></script>
  <script>
    window.dataLayer = window.dataLayer || [];
    function gtag() { dataLayer.push(arguments); }
    gtag('js', new Date());${container ? '' : `
    gtag('config', '${google}');
    window.addEventListener('hashchange', () => gtag('event', 'page_view', { page_location: location.href }));`}
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

function renderIndex(template, course, analytics) {
  const title = escapeHtml(course.title);
  const metadata = [
    `<title>${title}</title>`,
    `<meta property="og:title" content="${title}">`,
    `<meta name="twitter:title" content="${title}">`,
  ];
  if (course.description) {
    const description = escapeHtml(course.description);
    metadata.push(
      `<meta name="description" content="${description}">`,
      `<meta property="og:description" content="${description}">`,
      `<meta name="twitter:description" content="${description}">`,
    );
  }
  const attributes = `data-course-id="${escapeHtml(course.id)}" data-theme="${escapeHtml(course.preset ?? 'classic')}"`;
  const indexParts = {
    'data-course-attributes': `${attributes}${course.theme ? ' data-custom-theme' : ''}`,
    '<!-- Course metadata -->': metadata.join('\n  '),
    '<!-- Custom theme -->': course.theme ? `<link rel="stylesheet" href="${escapeHtml(assetUrl(course.theme))}">` : '',
    '<!-- Analytics -->': analyticsMarkup(analytics),
  };
  // Replace only placeholders from the template and insert values literally.
  return template.replace(/data-course-attributes|<!-- (?:Course metadata|Custom theme|Analytics) -->/g,
    placeholder => indexParts[placeholder]);
}

async function stageDefaultSite({ root, site, course }, files, analytics) {
  const browser = join(site, '_board');
  await copyBrowserShell(browser);
  const template = await readFile(new URL('./browser/index.html', import.meta.url), 'utf8');
  await writeFile(join(site, 'index.html'), renderIndex(template, course, analytics));
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

async function publishSite(root, site, temporary) {
  const output = join(root, 'dist');
  // Keep recovery files outside the staging directory so cleanup cannot remove them.
  const backup = `${temporary}-previous`;
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
        throw new Error(`Could not replace dist. Previous build is in ${backup}.`, { cause: restoreError });
      }
    }
    throw error;
  }
  if (hasBackup) await rm(backup, { recursive: true, force: true });
  return output;
}

export async function buildSite(directory = '.', { shell, customize, analytics = process.env } = {}) {
  if (!analytics || typeof analytics !== 'object' || Array.isArray(analytics)) throw new TypeError('analytics must be an object.');
  if (shell && typeof shell !== 'function') throw new TypeError('shell must be a function.');
  if (customize !== undefined && typeof customize !== 'function') throw new TypeError('customize must be a function.');
  if (shell && customize) throw new Error('Choose either shell or customize.');
  const root = resolve(directory);
  const releaseLock = await acquireProjectLock(root);
  let temporary;
  try {
    const { course, files } = await readProject(root);
    temporary = await mkdtemp(join(root, '.course-board-'));
    const site = join(temporary, 'site');
    await mkdir(site);
    const context = { root, site, course };
    if (shell) {
      await shell(context);
    } else {
      await stageDefaultSite(context, files, analytics);
      if (customize) await customize(context);
    }
    return await publishSite(root, site, temporary);
  } finally {
    try {
      if (temporary) await rm(temporary, { recursive: true, force: true });
    } finally {
      await releaseLock();
    }
  }
}
