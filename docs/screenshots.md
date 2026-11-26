# Capture screenshots in CI

The screenshot workflow builds a site, starts its server, and uploads PNG files as a GitHub Actions artifact. It uses Chromium and a JSON configuration. Each page starts in a fresh browser context, so its steps do not share cookies or local storage with other pages.

## Define pages

Save a configuration in the calling repository, for example `screenshots.json`:

```json
{
  "publish": { "directory": "docs/screenshots", "file": "README.md", "marker": "course-screenshots" },
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

## Select where images are published

The optional `publish` object selects a repository-relative image `directory`, a UTF-8 Markdown `file`, and a `marker` name. Add one pair of markers at the desired location in that file:

```markdown
<!-- course-screenshots:start -->
<!-- course-screenshots:end -->
```

The workflow copies each captured PNG to the directory and replaces only the text between the markers with Markdown images. Links are relative to the Markdown file. Both markers must occur exactly once. Paths must stay inside the repository. Existing images with matching names are replaced; images removed from the configuration are not deleted. Without `publish`, capture is artifact-only.

To publish, set the workflow `publish` input to `true` on pushes to the target branch and give the job `contents: write` and `pull-requests: write`. The workflow commits changes to a dedicated branch and opens a pull request to the target branch. Merge that pull request to update the target file and images. Enable **Allow GitHub Actions to create and approve pull requests** in repository Actions settings if needed. GitHub may not start checks for a pull request created with `GITHUB_TOKEN`; run required checks by an approved method before merging. If the target branch has moved since capture, publishing fails rather than proposing stale images. The `publish-base` and `publish-branch` inputs select the target and update branches.

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
    permissions:
      contents: write
      pull-requests: write
    with:
      publish: ${{ github.event_name == 'push' && github.ref == 'refs/heads/main' }}
      config: screenshots.json
      build-command: npm ci && npm run build
      start-command: npm run preview -- --host 127.0.0.1 --port 4174
      base-url: http://127.0.0.1:4174
      tools-ref: main
```

The workflow checks out the calling repository, runs the commands in its root, and waits for the base URL. It then captures the configured pages and uploads the `screenshots` artifact. `build-command` can be empty. `artifact-name`, `node-version`, and `ready-timeout` are optional inputs. Publishing is off by default. Commands are trusted shell code supplied by the caller. Use a server that stays in the foreground. The workflow stops it after capture.

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
