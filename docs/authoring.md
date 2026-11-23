# Build a course

## 1. Install Course Board

Use Node.js 20.19 or later. Create a project with `npm init -y` if it has no `package.json`.

For local development, use the [package tarball](publishing.md#1-test-the-package-locally). From a new course directory beside the `course-board` directory, run:

```sh
npm install --save-dev --save-exact ../course-board/lprakashv-course-board-0.1.2.tgz
```

After the GitHub Release is available, a course can install the versioned asset URL. Use this option when the course's CI can access the release.

```sh
npm install --save-dev --save-exact https://github.com/lprakashv/course-board/releases/download/v0.1.2/lprakashv-course-board-0.1.2.tgz
```

After the package is on npm, install the release instead:

```sh
npm install --save-dev --save-exact @lprakashv/course-board@0.1.2
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

## Import a course from the CLI

Put the course outline, lessons, and file mappings in a JSON bundle. See the [import schema](../schemas/ingest.json) and the [example bundle](../example/ingest/course.json).

```sh
npm exec -- course-board ingest course-bundle.json my-course
npm exec -- course-board check my-course
npm exec -- course-board dev my-course
```

- `manifest` uses the same format as `content/course.json`. It lists chapter titles and lesson IDs in order.
- `lessons` contains one object per listed ID. Each lesson has a `title` and `steps`, and can have `summary` and `data`. Each step has a `title` and Markdown `text`, and can have `diagram` and `data`. Use `###` or lower for headings inside step text.
- `assets` maps a path in the course's `public/` directory to a file path relative to the bundle. Use the destination path in a diagram, theme, or extension. For an Excalidraw board, map the SVG export as `src` and the optional `.excalidraw` file as `source`.

The import creates `content/course.json`, `content/lessons/<id>.md`, and any mapped `public/` files. Use `.` as the target to import into the current directory. The bundle supplies the full course outline. A repeat import updates listed lessons and mapped assets. Unlisted files stay on disk. The compiler checks the result before the import replaces course files.

## Edit a course in the browser

Run these commands from a Course Board source checkout. Pass the path to your course directory.

```sh
npm ci
node src/cli.js author /path/to/my-course
```

Open [Course Board Studio](http://127.0.0.1:4175/). You can also open a new directory to start a course. Add at least one chapter, lesson, and step, then select **Save course**. Use the course preview on port 4173 to read the saved course. Set `PORT` before the `author` command to use a different Studio port.

- Use the outline to add and edit chapters and lessons. Use Markdown for step text and the step order controls to set the reading order.
- Attach an image, SVG, or standalone HTML board to a step, or select **Open whiteboard** to draw with Excalidraw. In the editor, select **Import scene** to open a `.excalidraw` file. Use **Apply board** to prepare the scene and its SVG export. Save the course to write both files into `public/diagrams/`.
- Use **Course settings** to select a built-in style or attach a CSS file. Studio saves uploaded files under `public/`. A saved file is available in the static build.

The editor runs on the local machine and saves to the directory you pass to `author`. Keep the browser tab open until you save. If another author or CLI command changes the course while it is open, reload Studio before you save again. The reader preview and production build use the saved files.

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

Studio saves the scene and exports the SVG when you apply a board. If you edit a scene outside Studio, export a new SVG when you save it. Course Board displays the SVG and offers the scene as a download when `source` is set. [Excalidraw export docs](https://docs.excalidraw.com/docs/@excalidraw/excalidraw/api/utils/export)

## 6. Customize the theme or add a renderer

Set `"preset": "slate"` or `"preset": "night"` in the manifest to select a built-in style. The default is `classic`. Set `"theme": "theme.css"` and create `public/theme.css` to apply your own styles on top of the preset. Use `:root` to set the [CSS properties](../src/browser/course.css) for colors and fonts.

```css
:root {
  --accent: #285c4a;
  --heading-font: Georgia, serif;
}
```

Set `"extension": "extensions.js"` to add browser code. Use this file for custom HTML elements or diagram markup.

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

## Adapt the default browser shell

The default shell entry point can start a trusted interface adapter. This lets an existing course keep its HTML, styles, routes, and stored settings while using the same shell lifecycle and storage helpers as the default interface. The adapter owns its interface and event handlers; Course Board does not translate them automatically.

Run `course-board vendor-shell site/src/vendor` to copy the default entry point and its browser modules. Load it with `<script type="module" src="./src/vendor/app.js" data-course-board-adapter="../app.js"></script>`. The adapter path is relative to the copied entry point. In the adapter, import `createCourseShell` from `./vendor/shell.js`. Pass `readRoute` and the existing `storageKey`, then call `readState`, `writeState`, and `start({ render, onNavigate })`. `start` renders once and calls `onNavigate` on a hash change; it returns a cleanup function. State remains at the supplied key and storage failures are ignored. The normal Course Board interface still starts when the adapter attribute is absent. The adapter runs as trusted code.
