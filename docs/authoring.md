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
- `lessons` contains one object per listed ID. Each lesson has a `title` and `steps`, and can have `summary` and `data`. Each step has a `title` and Markdown `text`, and can have `id`, `diagram`, `snippet`, and `data`. Use `###` or lower for headings inside step text.
- `assets` maps a path in the course's `public/` directory to a file path relative to the bundle. Use the destination path in a diagram, theme, or extension. For an Excalidraw board, map the SVG export as `src` and the optional `.excalidraw` file as `source`.
- `contentFiles` maps a path in `content/` to a file path relative to the bundle. Use it to copy the file referenced by `manifest.dataSchema` or a code file referenced by a step. For example, map `snippets/cache/lookup.py` for a step with `"snippet": { "src": "cache/lookup.py", "language": "python" }`. You can omit the mapping for a file that is already in the course.

The import creates `content/course.json`, `content/lessons/<id>.md`, and any mapped files. Use `.` as the target to import into the current directory. The bundle supplies the full course outline. A repeat import updates listed lessons and mapped files. Unlisted files stay on disk. The compiler checks the result before the import replaces course files.

## Edit a course in the browser

Use [Course Board Studio](studio.md) to edit the outline, lesson steps, themes, and whiteboards. Studio runs from a Course Board source checkout. It saves the same files described in this guide.

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
- Use `content/lessons/<id>.md` for each lesson. Numbered links use `#/<id>/<step-number>`, with step numbers starting at 1. Keep published order stable for readers who use these links.
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

### Show example state on the whiteboard

In a step with a diagram, add `### Example state` and follow it with a Markdown table with two columns. Put a distinct label in the first column and its current value in the second. Use the same label in each step that tracks the same value.

```markdown
### Example state

| Item | Value |
| --- | --- |
| Cache key | `product:42` |
| Cache result | Hit |
```

The default shell shows these values above the diagram. When a reader moves between steps in the same lesson, it marks new or changed values and animates them briefly. The reader's reduced-motion setting turns off the animation.

### Give a step a stable link and a code example

Add an optional ID and snippet to a step block.

```step
id: lookup-key
snippet:
  src: cache/lookup.py
  language: python
```

The ID starts with a lowercase letter and uses lowercase letters, digits, and single hyphens. Use each ID once per lesson. The default shell links to `#/cache-hit/lookup-key` when a step has this ID. The link follows the same step if it moves. Numbered links still use the current step order.

Place the example at `content/snippets/cache/lookup.py`. Use a regular UTF-8 file and a path relative to `content/snippets/`. The compiler adds the escaped code below the step prose and supplies its original text as `step.snippet.text` to custom shells. The browser receives the rendered example through the course model.

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

In Studio, apply the board and save the course to save the scene and its SVG export. If you edit a scene outside Studio, export a new SVG when you save it. Course Board displays the SVG and offers the scene as a download when `source` is set. [Excalidraw export docs](https://docs.excalidraw.com/docs/@excalidraw/excalidraw/api/utils/export)

## 6. Customize the theme or add a renderer

Set `"preset": "slate"` or `"preset": "night"` in the manifest to select a built-in style. The default is `classic`. Set `"theme": "theme.css"` and create `public/theme.css` to apply your own styles on top of the preset. Use `:root` to set the [CSS properties](../src/browser/course.css) for colors and fonts.

The default shell loads the preset and stylesheet before the first paint. The **Theme** control lets readers select **Default**, **Light**, or **Dark**. The browser saves the choice for this course. An explicit choice uses the built-in colors unless the course stylesheet supplies colors under `:root[data-color-mode="light"]` or `:root[data-color-mode="dark"]`. Use these selectors to customize each choice. Diagram files can supply their own colors.

```css
:root {
  --accent: #285c4a;
  --heading-font: Georgia, serif;
}

:root[data-color-mode="dark"] {
  --accent: #b7cd94;
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

On wide screens, the default shell gives the whiteboard most of the width. Drag the dividers to change the outline or reading width. With a divider in focus, press Left or Right to resize, or Home or End to set its minimum or maximum width. The browser saves these widths. On narrow screens, the board sits above the reading pane. The shell prepares file-based boards for the previous and next steps so that navigation can reuse them.

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

A chapter, lesson, or step can contain a `data` mapping with JSON-compatible values. Use it for course-specific settings. To validate the fields, set `"dataSchema": "data-schema.json"` in the manifest and place this JSON file in `content/`.

```json
{
  "step": {
    "type": "object",
    "properties": { "note": { "type": "string" } },
    "additionalProperties": false
  },
  "diagrams": {
    "queue-depth": {
      "type": "object",
      "required": ["depth"],
      "properties": { "depth": { "type": "integer", "minimum": 0 } }
    }
  }
}
```

Use optional `chapter`, `lesson`, and `step` keys for their `data` mappings and optional `diagrams` entries for custom renderers by name. Each entry is a standalone draft-07 JSON Schema. Use references within that schema. Course Board validates an empty object when the applicable `data` is absent. The compiler, build, and development preview report validation errors with the source location.

### Share the build and preview

Use the same customization module for production and development. Course Board validates the source and stages `index.html`, the browser files under `_board/`, the compiled browser model in `course.json`, assets from `public/` under `media/`, and `.nojekyll`. Then it calls the customization function. The function receives the absolute project path as `root`, the staging directory as `site`, and the validated model as `course`. The staged JSON keeps rendered step HTML. Use the callback model when you need the original step Markdown as well.

Create `scripts/course-shell.mjs` with a default export. This example replaces the index with the course's own HTML.

```js
import { copyFile } from 'node:fs/promises';
import { join } from 'node:path';

export default async function customize({ root, site }) {
  await copyFile(join(root, 'site/index.html'), join(site, 'index.html'));
}
```

Write additional output to `site`. Use paths relative to the published index so the site works at the root and under a project path. For example, a custom index can load `./_board/app.js` with `data-course-board-adapter="../app.js"` if the callback stages an adapter as `app.js` at the site root.

```sh
course-board dev --customize scripts/course-shell.mjs
course-board build --customize scripts/course-shell.mjs
course-board preview
```

Run these as npm scripts or with `npm exec --`. The optional project directory comes after the command. Resolve a relative customization path from that directory. The module is trusted Node.js code and runs when you explicitly select it. In development, reload the page after edits to the course, public assets, or files that the callback reads. Restart the server after edits to the customization module or its Node.js imports. Production preview serves the last build.

The Node API uses the same callback. Import it and call `buildSite(directory, { customize })`. A failure in the compiler or callback preserves the previous `dist/`.

### Own the full build output

For an existing full-site callback, use `buildSite(directory, { shell })`. The callback receives the same context and prepares all site files. Choose one callback for each build. Omitting both uses the default Course Board site.

## Adapt the default browser shell

The default shell entry point can start a trusted interface adapter. This lets an existing course keep its HTML, styles, routes, and stored settings while using the same shell lifecycle and storage helpers as the default interface. The adapter owns its interface and event handlers; Course Board does not translate them automatically.

Run `course-board vendor-shell site/src/vendor` to copy the default entry point and its browser modules. Load it with `<script type="module" src="./src/vendor/app.js" data-course-board-adapter="../app.js"></script>`. The adapter path is relative to the copied entry point. In the adapter, import `createCourseShell` from `./vendor/shell.js`. Pass `readRoute` and the existing `storageKey`, then call `readState`, `writeState`, and `start({ render, onNavigate })`. `start` renders once and calls `onNavigate` on a hash change; it returns a cleanup function. State remains at the supplied key and storage failures are ignored. The normal Course Board interface still starts when the adapter attribute is absent. The adapter runs as trusted code.
