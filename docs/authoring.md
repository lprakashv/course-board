# Build a course

## 1. Install Course Board

Use Node.js 20.19 or later. Create a project with `npm init -y` if it has no `package.json`.

For local development, use the [package tarball](publishing.md#1-test-the-package-locally). From a new course directory beside the `course-board` directory, run:

```sh
npm install --save-dev --save-exact ../course-board/lprakashv-course-board-0.1.0.tgz
```

After the GitHub Release is available, a course can install the versioned asset URL. Use this option when the course's CI can access the release.

```sh
npm install --save-dev --save-exact https://github.com/lprakashv/course-board/releases/download/v0.1.0/lprakashv-course-board-0.1.0.tgz
```

After the package is on npm, install the release instead:

```sh
npm install --save-dev --save-exact @lprakashv/course-board@0.1.0
```

## 2. Add the starter content and scripts

In a new directory, copy the starter files. In an existing project, copy the individual files you need to avoid overwriting your course.

```sh
cp -R node_modules/@lprakashv/course-board/example/content .
cp -R node_modules/@lprakashv/course-board/example/public .
npm pkg set 'scripts.dev=course-board dev' 'scripts.lint=course-board check' \
  'scripts.test=course-board check' 'scripts.build=course-board build' 'scripts.run=course-board preview'
```

Change the optional `$schema` in `content/course.json` to `../node_modules/@lprakashv/course-board/schemas/manifest.json` for editor validation, or remove it. Add `dist/` and `node_modules/` to the course's `.gitignore`. The starter `test` script checks the content. Add application tests when you add custom logic.

Run `npm run dev` and open [the development preview](http://127.0.0.1:4173/). Save a file and reload the page to rebuild it. Press Ctrl+C to stop the server.

## 3. Set the course and chapter order

Edit `content/course.json`. The chapter list and its lesson ID lists set the order.

```json
{
  "version": 1,
  "id": "cache-fundamentals",
  "title": "Cache Fundamentals",
  "description": "Follow the data on each request.",
  "chapters": [
    { "title": "Read paths", "lessons": ["cache-hit"] }
  ]
}
```

- Use lowercase letters, digits, and single hyphens in course and lesson IDs. Each lesson ID must be unique within a course.
- Use `content/lessons/<id>.md` for each lesson. Keep IDs and step order stable after publication. Direct links use `#/<id>/<step-number>`, with step numbers starting at 1.
- Use `theme` and `extension` to reference optional files in `public/`. The files are copied to `dist/media/`.

## 4. Write one Markdown file per lesson

Create `content/lessons/cache-hit.md` for the example above. Each lesson starts with YAML front matter. A top-level `##` heading starts a step. Use plain text for step titles, Markdown for the step prose, and `###` for subheadings. A step can have one diagram. Add its optional YAML `step` block immediately after the heading.

````markdown
---
title: Return a Cache Hit
summary: Follow the response when the cache contains the requested value.
---

## Look up the key

```step
diagram:
  type: ascii
  alt: The service asks the cache for product 42.
  caption: The database is idle during a hit.
  text: |
    Service ---> Cache
      key: product:42
```

Use the product ID to form the key. Look up the key in the cache.

## Return the value

If the stored value is valid, send it to the client.
````

Raw HTML in the Markdown is rendered as text. Use ordinary Markdown for links, lists, code and tables. For a local Markdown image, link to its published location, for example `![A request flow](./media/diagrams/request.svg)`. The diagram schema validates assets in step blocks. Check ordinary Markdown links separately.

## 5. Choose a diagram type

Put diagram files in `public/`. Use paths relative to that directory in `src` and `source`. Use forward slashes and file names with letters, digits, hyphens, underscores, periods, or spaces. Start each path part with a letter, digit, hyphen, or underscore. Write an `alt` description for each diagram. Use the optional `caption` for information that all readers need.

| Type | Fields after `type` and `alt` | What the learner sees |
| --- | --- | --- |
| `ascii` | `text`, typically a YAML block with `\|` | A diagram in fixed-width text |
| `image` | `src` pointing to PNG, JPG, JPEG, GIF, WebP, or AVIF | A raster image |
| `svg` | `src` pointing to an SVG file | An SVG in an image element |
| `excalidraw` | `src` pointing to an SVG export and optional `source` pointing to a `.excalidraw` scene | The exported board and an optional scene download |
| `html` | `src` pointing to an HTML document | HTML and CSS in a sandboxed frame with scripts disabled |
| `custom` | `name` and optional `data` | The HTML that a course extension returns |

For Excalidraw, draw the diagram, save the scene, and export an SVG. Store both files together if you want learners to download the source. Re-export the SVG each time you edit the scene. Course Board displays the SVG. It checks the scene's JSON structure and leaves editing to Excalidraw. [Excalidraw export docs](https://docs.excalidraw.com/docs/@excalidraw/excalidraw/api/utils/export)

## 6. Customize the theme or add a renderer

Set `"theme": "theme.css"` in the manifest and create `public/theme.css`. Change the [CSS properties](../src/browser/course.css) for colors and fonts. Set `"extension": "extensions.js"` to add browser code. Use this file for custom HTML elements or diagram markup.

```js
// public/extensions.js
export const diagrams = {
  'queue-depth': ({ alt, data }, { escapeHtml }) => {
    const depth = Number(data?.depth);
    if (!Number.isInteger(depth) || depth < 0) throw new Error('Queue depth must be a non-negative integer.');
    return `<p role="img" aria-label="${escapeHtml(alt)}">Queued items · ${depth}</p>`;
  },
};
```

Use `diagram: { type: custom, name: queue-depth, alt: Four items are queued, data: { depth: 4 } }` in a `step` block. Use JSON-compatible values in `data`. The renderer receives the diagram, plus `asset(path)` and `escapeHtml(value)` helpers. Return an HTML string with an accessible label. Escape author-supplied text. A course can also export `onNavigate({ course, lesson, step })` for analytics or other navigation behavior. The hook receives a zero-based step index.

Extensions run as trusted browser code. Use `textContent` for dynamic text inside a custom element, or use `escapeHtml` when you return markup. The build validates the extension path and renderer name syntax. The browser looks up the exported renderer when the step opens. All files in `public/` become public.

## 7. Validate and preview production

```sh
npm run lint
npm test
npm run build
npm run run
```

Open [the production preview](http://127.0.0.1:4174/). Open a direct step link and reload it. Check screen sizes, diagram alternatives, and custom renderers. The build uses the project root and replaces `dist/` when it succeeds. [Publish the build](publishing.md#4-deploy-a-course-to-github-pages).

## Import parts into an existing app

Import the build APIs from Node.js. The returned course includes each lesson's ID and steps with `title`, `text` (Markdown), `html`, and optional `diagram`.

```js
import { buildSite, compileCourse, parseLesson } from '@lprakashv/course-board';

const course = await compileCourse('.');
console.log(course.title);
```

Use `parseLesson(source, id)` to compile one document. Use `buildSite(projectDirectory)` to build a complete site into that project's `dist/`.

Import `renderDiagram` from `@lprakashv/course-board/diagrams` in a bundler project. Set `assetBase` to the relative URL prefix for diagram files if it differs from `./media/`. For a native module site with no bundler, use `npm exec -- course-board vendor path/to/diagrams.js` and import the copied file with a relative URL. Use `copyDiagramRenderer(file)` for the same operation in a Node build script. [Existing-course examples](migrations.md).

## Extend content and the shell

A chapter, lesson, or step can contain a `data` mapping with JSON-compatible values. Use it for course-specific settings. Course Board validates the JSON values. A course must validate the meaning of its own settings.

For a custom interface, call `buildSite(directory, { shell })` from a Node build script. The async `shell({ root, site, course })` function writes the complete site to `site`. `course` is the validated Course Board model. The function owns the HTML, assets, and course data it writes. If it fails, the previous `dist/` stays in place. Treat the shell as trusted code. The default shell remains unchanged when the option is omitted. For example:

```js
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { buildSite } from '@lprakashv/course-board';

await buildSite('.', {
  shell: async ({ site, course }) => {
    await writeFile(join(site, 'index.html'), '<h1>My course</h1>');
    await writeFile(join(site, 'course.json'), JSON.stringify(course));
  },
});
```

Write any other assets that the interface needs inside `site`. The build publishes that directory as `dist/`.
