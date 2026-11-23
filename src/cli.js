#!/usr/bin/env node
import { readdir } from 'node:fs/promises';
import { compileCourse, buildSite, copyBrowserShell, copyDiagramRenderer } from './index.js';
import { serve } from './serve.js';

const usage = `Usage: course-board <command> [path]

  check [directory]  Validate a course.
  build [directory]  Build static files in dist/.
  ingest <bundle.json> [directory]  Import course content and assets.
  author [directory]  Edit a course in Studio (PORT defaults to 4175).
  dev [directory]    Build on page reload (PORT defaults to 4173).
  preview [directory]   Serve dist/ (PORT defaults to 4174).
  vendor <file>      Copy the diagram renderer for a native ES module site.
  vendor-shell <directory>  Copy the default shell browser modules.`;

function getPort(fallback) {
  const port = Number(process.env.PORT ?? fallback);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('PORT must be an integer from 0 to 65535.');
  return port;
}

async function main([command, path, ...extra]) {
  if (command === '--help' || command === '-h' || !command) {
    console.log(usage);
    return;
  }
  if (extra.length > (command === 'ingest' ? 1 : 0)) throw new Error(usage);
  const directory = path ?? '.';
  switch (command) {
    case 'check': {
      const course = await compileCourse(directory);
      const lessons = course.chapters.flatMap(chapter => chapter.lessons);
      console.log(`Checked ${lessons.length} lessons in ${course.chapters.length} chapters.`);
      return;
    }
    case 'build':
      console.log(`Built ${await buildSite(directory)}`);
      return;
    case 'ingest': {
      if (!path) throw new Error('Usage: course-board ingest <bundle.json> [directory]');
      const { ingestBundle } = await import('./author/project.js');
      await ingestBundle(path, extra[0] ?? '.');
      console.log(`Imported ${path} into ${extra[0] ?? '.'}`);
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
      const port = getPort(command === 'dev' ? 4173 : 4174);
      if (command === 'preview') await readdir(`${directory}/dist`);
      await serve(directory, { dev: command === 'dev', port });
      return;
    }
    case 'vendor-shell':
      if (!path) throw new Error('Usage: course-board vendor-shell <directory>');
      await copyBrowserShell(path);
      console.log(`Copied the browser shell to ${path}`);
      return;
    case 'vendor':
      if (!path) throw new Error('Usage: course-board vendor <file>');
      await copyDiagramRenderer(path);
      console.log(`Copied the diagram renderer to ${path}`);
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
