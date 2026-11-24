#!/usr/bin/env node
import { readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { compileCourse, buildSite, copyBrowserShell, copyDiagramRenderer } from './index.js';
import { serve } from './serve.js';

const usage = `Usage: course-board <command> [path]

  check [directory]                          Validate a course.
  build [directory] [--customize <module>]  Build static files in dist/.
  ingest <bundle.json> [directory]          Import course content and assets.
  author [directory]                       Edit a course in Studio (PORT defaults to 4175).
  dev [directory] [--customize <module>]    Build on page reload (PORT defaults to 4173).
  preview [directory]                      Serve dist/ (PORT defaults to 4174).
  vendor <file>                             Copy the diagram renderer for a native ES module site.
  vendor-shell <directory>                  Copy the default shell browser modules.`;

function getPort(fallback) {
  const port = Number(process.env.PORT ?? fallback);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('PORT must be an integer from 0 to 65535.');
  return port;
}

async function main(args) {
  const { positionals: [command, pathArgument, ...remaining], values } = parseArgs({
    args, allowPositionals: true,
    options: { help: { type: 'boolean', short: 'h' }, customize: { type: 'string' } },
  });
  if (values.help || !command) {
    console.log(usage);
    return;
  }
  if (remaining.length > (command === 'ingest' ? 1 : 0)) throw new Error(usage);
  const directory = pathArgument ?? '.';
  const options = {};
  if (values.customize !== undefined) {
    if ((command !== 'build' && command !== 'dev') || !values.customize) throw new Error(usage);
    const module = await import(pathToFileURL(resolve(directory, values.customize)));
    if (typeof module.default !== 'function') {
      throw new TypeError(`${values.customize}: export a default customization function.`);
    }
    options.customize = module.default;
  }
  switch (command) {
    case 'check': {
      const course = await compileCourse(directory);
      const lessons = course.chapters.flatMap(chapter => chapter.lessons);
      console.log(`Checked ${lessons.length} lessons in ${course.chapters.length} chapters.`);
      return;
    }
    case 'build':
      console.log(`Built ${await buildSite(directory, options)}`);
      return;
    case 'ingest': {
      if (!pathArgument) throw new Error('Usage: course-board ingest <bundle.json> [directory]');
      const { ingestBundle } = await import('./author/project.js');
      const targetDirectory = remaining[0] ?? '.';
      await ingestBundle(pathArgument, targetDirectory);
      console.log(`Imported ${pathArgument} into ${targetDirectory}`);
      return;
    }
    case 'author': {
      const { serveStudio } = await import('./author/server.js').catch(error => {
        if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error;
        throw new Error('Studio needs the editor dependencies from a Course Board checkout. Run npm ci there, then run node src/cli.js author <course-directory>.', { cause: error });
      });
      await serveStudio(directory, getPort(4175));
      return;
    }
    case 'dev':
    case 'preview': {
      const dev = command === 'dev';
      const port = getPort(dev ? 4173 : 4174);
      if (!dev) {
        try {
          await readdir(join(directory, 'dist'));
        } catch (error) {
          if (error.code !== 'ENOENT') throw error;
          throw new Error('No build to preview. Run course-board build for this directory first.', { cause: error });
        }
      }
      await serve(directory, { dev, port, ...options });
      return;
    }
    case 'vendor-shell':
      if (!pathArgument) throw new Error('Usage: course-board vendor-shell <directory>');
      await copyBrowserShell(pathArgument);
      console.log(`Copied the browser shell to ${pathArgument}`);
      return;
    case 'vendor':
      if (!pathArgument) throw new Error('Usage: course-board vendor <file>');
      await copyDiagramRenderer(pathArgument);
      console.log(`Copied the diagram renderer to ${pathArgument}`);
      return;
    default:
      throw new Error(usage);
  }
}

try {
  await main(process.argv.slice(2));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
