# Publish a package or a site

The npm package contains the compiler, renderer, schemas, and sample files. Each course builds a separate static site for its own Pages repository.

## 1. Test the package locally

From the Course Board directory, run:

```sh
npm ci
npm run lint
npm test
npm run coverage
npm run build
npm pack --dry-run
npm pack
```

Check the file list from the dry run. Expect source modules, schemas, example sources, and docs. The pack command creates `lprakashv-course-board-0.1.2.tgz`. Install it in a scratch course with the [authoring guide](authoring.md#1-install-course-board). A relative tarball path works while both projects are on the same machine. For CI, use a published GitHub Release URL, an npm release, or an archive committed inside the course repository. Commit the resulting lockfile. [npm pack documentation](https://docs.npmjs.com/cli/v11/commands/npm-pack/)

## 2. Publish a GitHub Release

The [CI and release workflow](../.github/workflows/ci.yml) checks pull requests and pushes to `main`. A pushed version tag runs the same checks on Node.js 20.19 and 22. If both pass, the workflow packs the tagged source and attaches the `.tgz` to the GitHub Release. The tag must match the stable version in `package.json`.

The [showcase workflow](../.github/workflows/showcase.yml) builds the example and the latest `main` of each public course repository and captures their local builds. After the CI workflow passes on a push to `main`, it publishes only the three images to the `showcase-images` branch. It can also run manually. Its build jobs have read-only permissions; only the image publishing job can write repository contents. The source branch does not need an automation bypass. The showcase screenshots appear in the README after the first successful showcase run. GitHub image caches can delay updates. A failed course build leaves the previous images in place.

## Protect the source branch

In GitHub settings, protect `main` with a branch ruleset or branch protection rule. Require pull requests and both `check (20.19.0)` and `check (22)` status checks from the Course Board CI and Release workflow. Block force pushes and deletion. Apply the rule to administrators where available. Require review when another reviewer is available; a solo maintainer must account for GitHub's review requirements before enabling it. Do not require the showcase workflow as a merge check: it runs after pushes and manual dispatch, not on pull requests. Keep the `showcase-images` branch separate from `main`; it contains generated images only. Review the repository's Actions settings and allow the workflow token to write contents for the release and screenshot jobs. [GitHub branch protection](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches)

1. Set the release version in `package.json` and update `package-lock.json` with `npm install --package-lock-only` when the version changes. Run the [local checks](#1-test-the-package-locally). Commit the version and release changes to `main`.
2. Push the release commit before the tag. In this example, version `0.1.2` is already set. Use the actual release version for both tag commands.

   ```sh
   git push origin main
   git tag -a v0.1.2 -m "Release 0.1.2"
   git push origin v0.1.2
   ```

3. In GitHub, check the **Course Board CI and Release** run for the tag. Then open **Releases** and check that the version has the expected `.tgz`. Download the archive and install it in a scratch project as in step 1. If the workflow stops during publishing, check the release and its assets before you retry the job. [GitHub Release CLI reference](https://cli.github.com/manual/gh_release_create)

This workflow publishes the archive to [GitHub Releases](https://github.com/lprakashv/course-board/releases). The npm registry and the course sites have their own publishing steps below.

## 3. Publish a version to npm

**Assumption.** The package name is `@lprakashv/course-board` and the maintainer controls that npm scope. Confirm the scope before the first release. If you change the package name, update the examples and regenerate the lockfile with `npm install --package-lock-only`.

1. Check that `repository.url` in `package.json` matches the GitHub source repository. Check that the README and MIT license are in the pack output.
2. Run the package checks above. Sign in to the public registry and publish the first public installer version.

   ```sh
   npm login --registry https://registry.npmjs.org/
   npm publish --dry-run --access public --registry https://registry.npmjs.org/
   npm publish --access public --registry https://registry.npmjs.org/
   ```

   Complete npm's authentication prompts. Confirm the release from a clean project with the pinned install command in the authoring guide. [Publishing public scoped packages](https://docs.npmjs.com/creating-and-publishing-scoped-public-packages/)
3. For later registry releases, add an npm workflow and configure **Trusted publishing** in the npm package settings. Match the GitHub owner, repository, and workflow filename. Give the npm publishing job `id-token: write`, use a GitHub-hosted runner and the Node/npm versions in npm's requirements, then run the checks and `npm publish --access public` in that workflow. Use a new version for each release and update a course's pinned dependency when it is ready. [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/)

## 4. Deploy a course to GitHub Pages

1. In the course repository, install the package and add the course scripts from the [authoring guide](authoring.md). Build the site locally and check `dist/index.html`, `dist/course.json` and the assets in `dist/media/` when the course uses media.
2. Copy the template into the course repository.

   ```sh
   mkdir -p .github/workflows
   cp node_modules/@lprakashv/course-board/docs/github-pages.yml .github/workflows/deploy-pages.yml
   ```

   The [workflow template](github-pages.yml) uses `main`, checks pull requests, and deploys the `dist/` artifact on pushes to `main` or manual runs. Change the branch name if your course uses a different default branch.
3. In GitHub, open **Settings → Pages** and select **GitHub Actions** as the source. Commit the course files, package files, and workflow. Push them to the repository. [GitHub Pages workflow documentation](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)
4. After the workflow succeeds, open the Pages URL shown in the deployment. Open the site with its trailing slash. Copy a step link, open it in a second tab, and confirm the step and its diagram load. The app uses relative assets and fragment routes for project paths such as `/my-course/`.
5. If your account uses an existing custom domain for its user site, check the project URL under that domain. Preserve any existing Pages and domain settings when you adopt the package in an existing course. [GitHub custom domains](https://docs.github.com/en/pages/configuring-a-custom-domain-for-github-pages/managing-a-custom-domain-for-your-github-pages-site)
