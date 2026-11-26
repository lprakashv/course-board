# Capture screenshots in CI

Course Board CI uses the [Capture and Update Screenshot action](https://github.com/lprakashv/capture-and-update-screenshot-action). It builds and serves the example course, captures the pages in [example/screenshots.json](../example/screenshots.json), and uploads the PNG files as a workflow artifact. The action installs its own dependencies.

The configuration names each page, its path, and any navigation steps. It also selects `docs/screenshots/` as the image directory and the `course-screenshots` marker pair in the README as the section to update. On a push to `main`, the action proposes the new images and links in a pull request. Merge that pull request to update the README. Pull requests receive artifacts without publishing changes.

The action can also capture a public website. Set `source` to `public`, provide the deployed `base-url`, and omit the build and start commands. It captures the site that is reachable at the time of the run; that site may not yet contain the calling commit.

See the [action guide](https://github.com/lprakashv/capture-and-update-screenshot-action#readme) for configuration, navigation steps, inputs, permissions, and examples for other repositories. The calling workflow pins the action to a commit. Update the pin after reviewing a newer action version.

The update pull request needs `contents: write` and `pull-requests: write`, plus the repository setting **Allow GitHub Actions to create and approve pull requests**. GitHub may not start checks for a pull request created with `GITHUB_TOKEN`; run required checks by an approved method before merging. The action fails if `main` moves after capture, so it does not propose stale images.
