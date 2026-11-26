# Publish a package or a site

The npm package provides the compiler, CLI import, renderer, schemas, and sample files. Each course builds a separate static site for its own Pages repository. Publish only the output of `course-board build` in `dist/`. [Run Studio from a source checkout](studio.md#start-studio) for local editing. Its editor dependencies are development dependencies of Course Board.

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

Check the file list from the dry run. Expect source modules, schemas, example sources, and docs. The pack command creates `lprakashv-course-board-0.3.6.tgz`. Install it in a scratch course with the [authoring guide](authoring.md#1-install-course-board). A relative tarball path works while both projects are on the same machine. For CI, use a published GitHub Release URL, an npm release, or an archive committed inside the course repository. Commit the resulting lockfile. [npm pack documentation](https://docs.npmjs.com/cli/v11/commands/npm-pack/)

## 2. Publish a GitHub Release

The [CI and release workflow](../.github/workflows/ci.yml) checks pull requests and pushes to `main` on Node.js 20.19 and 22. After both checks pass on a push to `main`, it reads the stable version from `package.json`. If that version has no tag, the workflow creates the matching tag and GitHub Release for the tested commit. Existing tags are left in place.

1. Choose a new version with no existing tag. Update `package.json`, `package-lock.json`, and the versioned examples in the guides. Run the [local checks](#1-test-the-package-locally).
2. Merge the version change into `main` through a pull request. The workflow creates the tag and release after the checks pass.
3. Check the **Course Board CI and Release** run for the push to `main`. Open **Releases** and check the archive. If publishing fails after the tag is created, check the tag and release before retrying. The workflow can complete a missing release when its tag points to the same commit. If a tag points to an earlier commit or a failed tag has the wrong version, choose a new version and merge it into `main`.

This workflow publishes the archive to [GitHub Releases](https://github.com/lprakashv/course-board/releases). The npm registry and the course sites have their own publishing steps below.

### Protect the source branch

In GitHub settings, protect `main` with a branch ruleset or branch protection rule. Require pull requests and both `check (20.19.0)` and `check (22)` from the CI workflow. Block force pushes and deletion. Apply the rule to administrators where available. Require review when another reviewer is available. Give the release and screenshot publishing jobs permission to write repository contents. [GitHub branch protection](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches)

### Capture CI screenshots

The CI workflow captures the example course on each pull request and push. Download the `screenshots` artifact from the workflow run. On a push to `main`, the workflow also proposes updated images and README links in a pull request. Merge that pull request to publish the updates. Other repositories can call the same workflow with their own pages and navigation steps. See the [screenshot guide](screenshots.md).

### Refresh showcase images

The [showcase workflow](../.github/workflows/showcase.yml) runs after CI passes on a push to `main`. You can also run it manually from **Actions**. It builds the example and the latest `main` of each public course, then writes three screenshots to `showcase-images`. If a course build fails, the previous images stay available. GitHub can cache older images. Use the CI workflow for pull request checks.

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

1. In the course repository, install the package and add the course scripts. Commit the lockfile so the workflow can use `npm ci`. Run the production build and preview it locally. Check a direct step link and its diagram. For a different static host, upload the contents of `dist/`. [Authoring and production preview](authoring.md#7-validate-and-preview-production)
2. Copy the template into the course repository.

   ```sh
   mkdir -p .github/workflows
   cp node_modules/@lprakashv/course-board/docs/github-pages.yml .github/workflows/deploy-pages.yml
   ```

   The [workflow template](github-pages.yml) uses `main`, checks pull requests, and deploys the `dist/` artifact on pushes to `main` or manual runs. Change the branch name if your course uses a different default branch.
3. In GitHub, open **Settings → Pages** and select **GitHub Actions** as the source. Commit the course files, package files, and workflow. Push them to the repository. [GitHub Pages workflow documentation](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)
4. After the workflow succeeds, open the Pages URL shown in the deployment. Open the site with its trailing slash. Copy a step link, open it in a second tab, and confirm the step and its diagram load. The app uses relative assets and fragment routes for project paths such as `/my-course/`.
5. If your account uses an existing custom domain for its user site, check the project URL under that domain. Preserve any existing Pages and domain settings when you adopt the package in an existing course. [GitHub custom domains](https://docs.github.com/en/pages/configuring-a-custom-domain-for-github-pages/managing-a-custom-domain-for-your-github-pages-site)

## Add analytics to the default site

Analytics is off by default. Set environment variables before `course-board build` or `course-board dev` to enable one or more providers. An empty variable disables that provider. Rebuild and deploy the site after a change. The production preview serves the last build.

| Provider | Environment variables | Value |
| --- | --- | --- |
| Google Analytics | `GOOGLE_TAG_ID` | GA4 measurement ID, such as `G-ABC123`, or Google tag container ID, such as `GTM-ABC123` |
| Umami | `UMAMI_WEBSITE_ID`, optional `UMAMI_SCRIPT_URL` | Website UUID and HTTPS tracker URL. The URL defaults to `https://cloud.umami.is/script.js`. |
| Plausible | `PLAUSIBLE_SCRIPT_URL` | HTTPS script URL from the site's Plausible installation snippet. |

For example, run `GOOGLE_TAG_ID=G-ABC123 npm run build` in a shell. The Node API also accepts `buildSite(directory, { analytics })`, where `analytics` is an object with the same variable names. This object replaces the environment settings for that build. The default shell includes the selected scripts before a `customize` callback runs. A custom `shell` owns its HTML and must add its own analytics.

For a `G-` ID, the Google integration sends a page view after the shell sets the title on the initial route and on each fragment change. The manifest title names the home page. The default lesson title is `Lesson title · Course title`; a course extension can set a title for each route with [`pageTitle`](authoring.md#6-customize-the-theme-or-add-a-renderer). If the course fails to load, no initial page view is sent. Disable overlapping Google Analytics enhanced measurement for browser history changes if it also records these views. For a `GTM-` ID, Course Board installs the Google tag container snippet. Configure the container and its Google Analytics destination to record page views. Set up history-change tracking in the container if you need a page view for each step. Avoid enabling a second history tracking method that would count the same page twice. Verify the initial page and step changes with Google Tag Assistant or Analytics DebugView. [Google guide for single-page applications](https://developers.google.com/analytics/devguides/collection/ga4/measure-spa-gtm). Plausible uses hash-based routing. Umami uses its tracker defaults; check your tracker version and dashboard for fragment navigation. Each provider can collect visitor data. Configure consent and privacy notices as needed for your site. IDs and script URLs are visible in the published HTML, even when supplied as GitHub secrets. Do not put private API keys in these settings.

For GitHub Actions, add the values as repository secrets or variables under **Settings → Secrets and variables → Actions**. The supplied workflow maps secrets on the build step. To use a repository variable instead, replace `secrets.NAME` with `vars.NAME` in that mapping. Unset secrets resolve to an empty string. Pull requests from forks do not receive repository secrets, so their builds have analytics disabled. Other CI systems can provide the same environment variables. Check the provider's dashboard and browser network requests after deployment. [Google tag](https://developers.google.com/tag-platform/gtagjs) · [Umami tracker](https://docs.umami.is/docs/collect-data) · [Plausible tracker](https://plausible.io/docs/plausible-script)
