import { assetUrl } from './diagrams.js';

async function fetchCourse(target, url) {
  const response = await target.fetch(url);
  if (!response.ok) throw new Error(`Could not read ${url} (HTTP ${response.status}).`);
  return response.json();
}

function loadTheme(document, href) {
  return new Promise(resolve => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    link.onload = link.onerror = () => resolve();
    document.head.append(link);
  });
}

export async function loadCourseConfig({ source = './course.json', assetBase = './media/', target = window } = {}) {
  const { document } = target;
  const course = typeof source === 'string' || source instanceof URL
    ? await fetchCourse(target, new URL(source, document.baseURI))
    : source;
  if (!course || typeof course !== 'object' || Array.isArray(course)) {
    throw new TypeError('Expected a course model object.');
  }

  const media = new URL(assetBase, document.baseURI);
  media.search = '';
  media.hash = '';
  if (!media.pathname.endsWith('/')) media.pathname += '/';
  const asset = path => assetUrl(path, media.href);

  const extension = course.extension ? await import(asset(course.extension)) : {};
  if (course.theme) await loadTheme(document, asset(course.theme));
  return { course, asset, assetBase: media.href, extension };
}
