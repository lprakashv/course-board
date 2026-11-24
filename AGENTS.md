# Course Board agent guide

## Start with the contract

Read the [README](README.md), the relevant guide in [docs/](docs/), and the tests for the part you will change. Check the branch and working tree. Preserve changes from other contributors.

Define user-visible changes in the owning guide, schema, or example before you change the implementation. Use [the authoring guide](docs/authoring.md) for the content format and [the publishing guide](docs/publishing.md) for release and deployment steps. State assumptions that affect the result. Update the README and affected guides when behavior, commands, or public interfaces change. Use ASD-STE100 style for documentation.

## Keep the architecture small

| Path | Responsibility |
| --- | --- |
| [`schemas/`](schemas/) | JSON Schema for the course manifest, lesson front matter, and step metadata |
| [`src/content.js`](src/content.js) | Parse Markdown and YAML, validate input, and compile the course model |
| [`src/build.js`](src/build.js) | Build the static site and copy the standalone renderer for an existing app |
| [`src/project-lock.js`](src/project-lock.js) | Coordinate builds, imports, and Studio saves |
| [`src/cli.js`](src/cli.js), [`src/serve.js`](src/serve.js) | Command entry points and local preview |
| [`src/author/`](src/author/) | Validated source writes, CLI import, and the local Studio server |
| [`src/index.js`](src/index.js), [`package.json`](package.json) | Public Node exports, browser export, and package contents |
| [`src/browser/`](src/browser/) | Browser shell, navigation, styles, and diagram rendering |
| [`example/`](example/), [`test/`](test/) | A working course and regression tests |

- Use native JavaScript modules, simple data structures, and clear names. Keep Node build code out of browser modules. Reuse the compiler, schema, and renderer before adding helpers or abstractions.
- Implement the behavior the request needs. Use platform APIs or existing dependencies first. If a dependency is necessary, check its maintenance and permissive license.
- Keep published lesson IDs, step order, package exports, and the version 1 content contract compatible. Document a migration when a change needs a new contract. Keep assets relative so the built site works at the root and below a GitHub Pages project path.
- Keep the renderer-only adoption path compatible with existing course shells. Custom renderers return plain markup strings. Preserve the markup and controls that callers use unless the request changes that contract. See the [migration guide](docs/migrations.md).
- Validate data at the compiler boundary. Keep raw HTML disabled in Markdown, escape dynamic labels, and keep standalone HTML diagrams sandboxed. Treat browser extensions as trusted code. Files in `public/` are published.
- Keep build output consistent after an error. Keep generated `dist/` directories, `node_modules/`, and package archives out of Git.

## Make flows easy to follow

- Give functions, variables, and state names that explain their purpose. Add a short comment when the reason for an operation is not clear from the code.
- Separate validation, staging, publishing, and recovery where this makes a flow easier to read. Use straightforward control flow and avoid clever shortcuts.
- Handle invalid input, unavailable resources, concurrent operations, and runtime errors at the relevant boundaries. Preserve existing files and the last successful build when an operation fails.
- Keep setup, build, preview, package, and deployment instructions current and repeatable. Validate changed commands and report any checks that could not run.

## Verify the change

Use Node.js 20.19 or later. CI checks Node.js 20.19 and 22.

```sh
npm ci
npm run lint
npm test
npm run coverage
npm run build
npm pack --dry-run
```

Run `npm run dev` to preview edits in the sample course. Run `npm run run` after a build to serve the generated output. See the [README](README.md) for the preview addresses.

Run `npm run author` to edit the sample in Studio. Keep Studio routes, bundles, and editor dependencies out of the static course output.

Add a focused regression test when the current tests cannot catch a break. Cover the normal use case and relevant invalid input. For browser changes, check narrow and wide screens, keyboard navigation, focus, and a direct step link. For package changes, inspect the archive and install it in a scratch project. State the checks that ran and any behavior you could not verify.

## Release changes

[CI](.github/workflows/ci.yml) checks pull requests, pushes to `main`, and version tags. A stable tag that matches `package.json` can publish the npm archive as a GitHub Release asset after both test jobs pass. Follow the [release procedure](docs/publishing.md#2-publish-a-github-release) when the maintainer requests a release.
