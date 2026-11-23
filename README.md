# Course Board

Build a static course from Markdown. Put content in chapters, divide each lesson into steps, and add a whiteboard where it helps the learner. Course Board provides lesson search, direct step links, keyboard navigation, and progress saved in the browser.

## Try the example

Install Node.js 20.19 or later and npm. From the Course Board directory, run these commands.

```sh
npm ci
npm run dev
```

Open [the development preview](http://127.0.0.1:4173/). Edit a file in `example/content/` or `example/public/` and reload the page. Press Ctrl+C to stop the server.

## Build and check

```sh
npm run lint
npm test
npm run coverage
npm run build
npm run run
```

Open [the production preview](http://127.0.0.1:4174/). The build writes to `example/dist/`. Upload this directory to a static host for the sample site. Coverage reports the modules loaded by Node tests. Use a browser to check the interface.

## Use Course Board in a project

- [Create, write, and customize a course](docs/authoring.md)
- [Publish a release artifact, publish to npm, or deploy a site to GitHub Pages](docs/publishing.md)
- [Adopt it in DSA Blueprint and Designed to Scale](docs/migrations.md)
- [Browse the example source](example/content/course.json)

A new course can use the full site builder. An existing app can import the content compiler or diagram renderer through the package exports. The existing apps can adopt one part at a time.

## Project map

| Path | Purpose |
| --- | --- |
| [`schemas/`](schemas/) | JSON Schema contracts for the manifest and lesson metadata |
| [`src/content.js`](src/content.js) | Markdown compiler and asset validation |
| [`src/browser/`](src/browser/) | Static site and standalone diagram renderer |
| [`example/`](example/) | Sample course with six diagram formats |
| [`test/`](test/) | Compiler, renderer, navigation, and build tests |
| [`.github/workflows/ci.yml`](.github/workflows/ci.yml) | Build checks and tagged GitHub Releases |
| [`AGENTS.md`](AGENTS.md) | Contributor and coding agent guidance |

Course Board uses native JavaScript modules so the existing courses can import the renderer without a browser bundler. Markdown-it and YAML match the authoring tools in Designed to Scale. Ajv validates the JSON Schema contracts. Eleventy and Astro content collections can build Markdown sites, but shared course steps and whiteboards would still need course-specific code. [Eleventy](https://www.11ty.dev/) · [Astro content collections](https://docs.astro.build/en/guides/content-collections/)

[MIT License](LICENSE).
