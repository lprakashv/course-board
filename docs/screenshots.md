# Capture screenshots in CI

The screenshot workflow builds a site, starts its server, and uploads PNG files as a GitHub Actions artifact. It uses Chromium and a JSON configuration. Each page starts in a fresh browser context, so its steps do not share cookies or local storage with other pages.

## Define pages

Save a configuration in the calling repository, for example `screenshots.json`:

```json
{
  "pages": [
    { "name": "home", "path": "/", "waitFor": "main" },
    {
      "name": "lesson",
      "path": "/",
      "viewport": { "width": 1440, "height": 900 },
      "steps": [
        { "action": "click", "selector": "a[href='#lesson']" },
        { "action": "waitFor", "selector": "h1" }
      ],
      "fullPage": true
    }
  ]
}
```

`name` is a unique filename without an extension. `path` is relative to the base URL and can include a fragment. `waitFor` waits for a visible CSS selector after navigation. Steps run in order: `click`, `fill` (with a `value`), `press` (with a `key`), or `waitFor`. Selectors use Playwright selector syntax. The default viewport is 1440 by 900 pixels. `fullPage` defaults to `false`. See the [schema](../tools/screenshots/schema.json) for the complete contract. Use visible elements as readiness markers; a page load alone does not guarantee that application rendering is complete.

## Call the workflow

Add a workflow in the site repository. Replace the configuration and commands with those for the site:

```yaml
name: Screenshots
on: [push, pull_request]
permissions:
  contents: read
jobs:
  screenshots:
    uses: lprakashv/course-board/.github/workflows/screenshots.yml@main
    with:
      config: screenshots.json
      build-command: npm ci && npm run build
      start-command: npm run preview -- --host 127.0.0.1 --port 4174
      base-url: http://127.0.0.1:4174
      tools-ref: main
```

The workflow checks out the calling repository, runs the commands in its root, and waits for the base URL. It then captures the configured pages and uploads the `screenshots` artifact. `build-command` can be empty. `artifact-name`, `node-version`, and `ready-timeout` are optional inputs. Commands are trusted shell code supplied by the caller. Use a server that stays in the foreground. The workflow stops it after capture.

The called workflow checks out its capture scripts separately. Set `tools-ref` to the same commit SHA as the workflow reference when pinning a version; the default is `main`. The caller must allow this public repository in its Actions settings. [GitHub reusable workflow documentation](https://docs.github.com/en/actions/how-tos/reuse-automations/reuse-workflows)

## Run locally

From this repository, install the site and screenshot dependencies, install Chromium, start the site, then capture:

```sh
npm ci
npm ci --prefix tools/screenshots
npm --prefix tools/screenshots exec -- playwright install --only-shell chromium
npm run build
npm run run
```

In a second terminal:

```sh
node tools/screenshots/capture.js example/screenshots.json http://127.0.0.1:4174 /tmp/course-board-screenshots
```

Stop the preview with Ctrl+C. The output directory is created if needed. Existing PNG files with the same names are replaced.

The capture tools have a separate package and lockfile in `tools/screenshots/`. Their dependencies are installed only for screenshot work. Run `npm test --prefix tools/screenshots` to check the configuration contract.
