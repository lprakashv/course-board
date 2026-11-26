import { readFile, writeFile, mkdir, copyFile, lstat } from 'node:fs/promises';
import { resolve, relative, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateConfig } from './capture.js';

async function repositoryPath(root, path) {
  if (!path || path.startsWith('/') || path.split(/[\\/]/).some(part => part === '..' || part === '.git')) {
    throw new Error(`Invalid repository path: ${path}`);
  }
  const absolute = resolve(root, path);
  if (!relative(root, absolute) || relative(root, absolute).startsWith(`..${sep}`)) throw new Error(`Invalid repository path: ${path}`);
  let current = root;
  for (const part of relative(root, absolute).split(sep)) {
    current = resolve(current, part);
    try {
      if ((await lstat(current)).isSymbolicLink()) throw new Error(`Symbolic links are not allowed: ${path}`);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  return absolute;
}

export async function publish(config, root, screenshots, manifest) {
  validateConfig(config);
  if (!config.publish) throw new Error('A publish configuration is required.');
  root = resolve(root);
  const document = await repositoryPath(root, config.publish.file);
  const directory = await repositoryPath(root, config.publish.directory);
  const original = await readFile(document, 'utf8');
  const start = `<!-- ${config.publish.marker}:start -->`;
  const end = `<!-- ${config.publish.marker}:end -->`;
  const startIndex = original.indexOf(start);
  const endIndex = original.indexOf(end);
  if (startIndex < 0 || endIndex < startIndex || original.indexOf(start, startIndex + start.length) !== -1 || original.indexOf(end, endIndex + end.length) !== -1) {
    throw new Error('The document must contain exactly one ordered pair of screenshot markers.');
  }
  const files = [];
  const lines = [];
  for (const page of config.pages) {
    const filename = `${page.name}.png`;
    const target = await repositoryPath(root, `${config.publish.directory}/${filename}`);
    await readFile(resolve(screenshots, filename));
    files.push(target);
    const link = relative(dirname(document), target).split(sep).map(encodeURIComponent).join('/');
    lines.push(`![${page.name}](${link})`);
  }
  await mkdir(directory, { recursive: true });
  for (const [index, page] of config.pages.entries()) await copyFile(resolve(screenshots, `${page.name}.png`), files[index]);
  await writeFile(document, `${original.slice(0, startIndex + start.length)}\n${lines.join('\n\n')}\n${original.slice(endIndex)}`);
  if (manifest) await writeFile(manifest, [document, ...files].map(file => relative(root, file)).join('\0') + '\0');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [config, root, screenshots, manifest] = process.argv.slice(2);
  if (!config || !root || !screenshots || !manifest) throw new Error('Usage: node publish.js <config.json> <repository> <screenshots> <manifest>');
  await publish(JSON.parse(await readFile(config, 'utf8')), root, screenshots, manifest);
}
