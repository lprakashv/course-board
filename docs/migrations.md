# Adopt Course Board in the two existing courses

DSA Blueprint and Designed to Scale now use Course Board. Their repositories are the source of truth for their current integration. The steps below are an earlier renderer-only migration example; their commands and file names can differ from the current courses.

Both courses pin Course Board in `package.json` and `package-lock.json`. To deploy learner shell changes, update the pin in each course and rebuild it. The shared shell supplies the pane dividers and theme control. It also displays the existing **Example state** tables inside the whiteboard. The course can keep its preset, theme stylesheet, and diagram files.

Start by sharing the diagram renderer. Each course can adopt it inside its current app and publish through its existing GitHub Pages workflow. Use the existing renderer as a Course Board `custom` renderer. Its markup still feeds the course's diagram controls and animations.

The steps below assume the local repositories are named `coding-interview-patterns` and `designed-to-scale`. The DSA Blueprint checkout is named `coding-interview-patterns`, and its remote is `lprakashv/dsa-blueprint`. Use a branch in each repository for the change.

## 1. Install the same version in both courses

[Pack the local release](publishing.md#1-test-the-package-locally). Run the first command from each checkout when the directories sit beside one another. Before merging, use the second command after the package is on npm, or install the [GitHub Release asset](authoring.md#1-install-course-board). A committed archive with a repository-relative path also works in CI. Commit both package files.

```sh
# To test locally
npm install --save-dev --save-exact ../course-board/lprakashv-course-board-0.3.1.tgz

# Before deploying with the public release
npm install --save-dev --save-exact @lprakashv/course-board@0.3.1
```

## 2. DSA Blueprint

1. Run the following commands in `coding-interview-patterns`. Add `site/src/vendor/` to `.gitignore`. The pre-scripts copy the renderer from the installed version for local development, lint, and production builds.

   ```sh
   npm pkg set 'scripts.setup:course-board=course-board vendor site/src/vendor/course-board.js' \
     'scripts.predev=npm run setup:course-board' \
     'scripts.prelint=npm run setup:course-board' \
     'scripts.prebuild=npm run setup:course-board'
   npm run setup:course-board
   ```

2. In `site/src/app.js`, add the import below. In `paintFrame`, replace the assignment `art.innerHTML = diagram(frame.scene)` with the following call. Keep the existing `diagram` and `legend` imports.

   ```js
   import { renderDiagram } from './vendor/course-board.js'
   ```

   ```js
   art.innerHTML = renderDiagram(
     { type: 'custom', name: 'dsa-scene', alt: frame.title, data: frame.scene },
     { renderers: { 'dsa-scene': ({ data }) => diagram(data) } },
   )
   ```

   The Learn view and Playground both call `paintFrame`. The existing renderer supplies the same board markup and accessible labels. Keep the code that updates the legend, note, and motion. To add another diagram type later, supply a file-based definition to `renderDiagram` and set `assetBase` to the published directory. Update the legend and animation behavior for that format as needed.
3. In `.github/workflows/deploy-pages.yml`, add `- run: npm ci` before lint. Keep the JDK 17 setup, `GOOGLE_TAG_ID` build variable, and existing Pages artifact upload for `dist/`. Update the local setup steps in the course README to include `npm ci`.
4. Run the course checks. The preview uses Python 3 and the course tests also use JDK 17.

   ```sh
   npm ci
   npm run lint
   npm test
   npm run coverage
   npm run build
   npm run run
   ```

   Open [the Two Pointers direct link in the preview](http://127.0.0.1:4174/#/learn/two-pointers/2). Move between steps, then open Practice, Playground, and Cheatsheets. In Playground, use custom input and check the updated diagram.
5. Keep **Settings → Pages → Source → GitHub Actions**. Merge when the checks pass. After deployment, reopen [the Two Pointers direct link](https://www.lprakashv.com/dsa-blueprint/#/learn/two-pointers/2) and check that previously completed lessons still appear as complete.

## 3. Designed to Scale

1. Run the following commands in `designed-to-scale`. Add `scripts/vendor/` to `.gitignore`.

   ```sh
   npm pkg set 'scripts.setup:course-board=course-board vendor scripts/vendor/course-board.js' \
     'scripts.predev=npm run setup:course-board' \
     'scripts.prelint=npm run setup:course-board' \
     'scripts.prebuild=npm run setup:course-board'
   npm run setup:course-board
   ```

2. Add `'scripts/vendor/course-board.js'` to `pageAssets` in `scripts/site.js`. The development server and production build share this list.
3. In `app.js`, add the import below. In `render`, add the call after the `animated` declaration and before the assignment to `$('#main').innerHTML`. In that template, replace the expression `${diagram(lesson, step, { animated })}` with `${boardMarkup}`. Keep the existing Rough.js renderer, zoom controls, view state, state cards, and legend.

   ```js
   import { renderDiagram } from './scripts/vendor/course-board.js';
   ```

   ```js
   const boardMarkup = renderDiagram(
     { type: 'custom', name: 'system-scene', alt: section.title },
     { renderers: { 'system-scene': () => diagram(lesson, step, { animated }) } },
   );
   ```

4. Run the course checks. Update the course README to document the shared renderer and the generated module.

   ```sh
   npm ci
   npm run lint
   npm test
   npm run coverage
   npm run build
   npm start
   ```

   Open [the Request Lifecycle direct link in the preview](http://127.0.0.1:4173/#/request-lifecycle/2). Zoom in, move to the next step, and check that the view and state cards update correctly. Check reduced motion and resize the panes.
5. Keep **Settings → Pages → Source → Deploy from a branch**, with `gh-pages` and `/ (root)`. Keep `.github/workflows/main.yml` publishing `dist/` to that branch and keep its existing analytics variable. After deployment, reopen [the Request Lifecycle direct link](https://www.lprakashv.com/designed-to-scale/#/request-lifecycle/2).

## 4. Move lesson authoring later

Pilot one lesson before moving a whole course. Keep lesson IDs and step order. The content contracts differ in these ways:

| Course | Current source | Path to shared authoring |
| --- | --- | --- |
| DSA Blueprint | The module order and lesson objects are in `site/src/lessons.js`. Several steps come from trace generators. | Map module names and lesson IDs to the manifest. Use each selected step's title and body as Markdown. Keep computed trace data in the existing generator and render it by lesson ID and step index. Keep quizzes, code examples, and problem metadata in the existing app while you move lessons. |
| Designed to Scale | `content/index.json` sets the chapter order. Lessons already use Markdown, YAML front matter, and `step` blocks. | Copy chapter titles and lesson IDs into a Course Board manifest. Keep the title, summary, headings, and prose. Use the existing compiler output as renderer data for `nodes`, `layout`, `active`, links, callouts, and status. Use SVG exports for a static pilot, or retain the existing renderer to exercise animation and state cards. |

1. Follow the [authoring guide](authoring.md) in a scratch directory. Try `two-pointers` for DSA Blueprint or `request-lifecycle` for Designed to Scale. Copy one lesson into the new format. Use the same ID and step order. Add an ASCII diagram or an SVG export as the first whiteboard.
2. Run `npm run lint`, `npm run build`, and `npm run run` in the scratch directory. Open the lesson link and compare each step with the current course. Confirm which course-specific data and interactions need a renderer or a separate view.
3. To integrate the new format in the existing app, use `parseLesson(source, id)` in a Node build and pass the compiled step HTML and optional diagram to the current lesson view. Use `compileCourse(directory)` to build the course model from a full manifest. In Designed to Scale, the current zoom code requires inline SVG. Skip zoom for image and HTML boards and expose keyboard instructions only for zoomable boards. In DSA Blueprint, use a legend that matches the selected board format.
4. If you later replace the app shell, plan a route and storage migration first. DSA Blueprint uses `#/learn/<id>/<step>`, and Course Board uses `#/<id>/<step>`. The default shell uses its own progress keys.

If a first-stage deploy fails, revert the integration commit and rerun that course's existing Pages workflow. Keep the existing URLs and Pages source settings during the rollback.


## 5. Share custom builds and previews

Use the [shared build and preview](authoring.md#share-the-build-and-preview) in a scratch checkout first. Move the full-site callback into a customization module and update it to use the staged files. Keep the existing course HTML, CSS, route parser, and storage keys.

- **DSA Blueprint** can import `_board/diagrams.js` and `_board/shell.js` from its adapter and use the staged `media/`. Its customization function can write the JavaScript model from the supplied `course` and apply its analytics setting. Another option is to read the staged `course.json` if the adapter needs only rendered step HTML.
- **Designed to Scale** can import `_board/diagrams.js` from its app. Its customization function can still produce its own adapted model, copy Rough.js and its license, and apply its analytics setting.

Use the customization module with both `course-board dev` and `course-board build`. Reload after editing a lesson. Then build, run `course-board preview`, and check a direct step link and stored settings. Also check the site under a subdirectory. The `shell` option remains available for a callback that owns all output.

## 6. Validate custom data and name steps

Add step IDs to published lessons in their current order. The default shell uses the IDs in new links. Keep numbered links valid by keeping the published order. Custom shells can read `step.id` and add named links to their own route parser.

Add a `dataSchema` to check the custom fields that your adapter and renderers use. A schema checks the supplied data structure. Keep course checks that compare fields across lessons or check diagram relationships. To reuse a code example, put the file in `content/snippets/` and link it from a step block. Custom shells can render the compiled step HTML or use `step.snippet.text` separately. See the [authoring guide](authoring.md#extend-content-and-the-shell).
