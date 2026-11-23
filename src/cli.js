#!/usr/bin/env node
import { readdir } from 'node:fs/promises';
import { compileCourse, buildSite, copyBrowserShell, copyDiagramRenderer } from './index.js';
import { serve } from './serve.js';

const usage = `Usage: course-board <command> [path]

  check [directory]  Validate a course.
  build [directory]  Build static files in dist/.
  dev [directory]    Build on page reload (PORT defaults to 4173).
  preview [directory]   Serve dist/ (PORT defaults to 4174).
  vendor <file>      Copy the diagram renderer for a native ES module site.
  vendor-shell <directory>  Copy the default shell browser modules.`;

async function main([command, path, ...extra]) {
  if (command === '--help' || command === '-h' || !command) {
    console.log(usage);
    return;
  }
  if (extra.length) throw new Error(usage);
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
    case 'dev':
    case 'preview': {
      const port = Number(process.env.PORT ?? (command === 'dev' ? 4173 : 4174));
      if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('PORT must be an integer from 0 to 65535.');
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
