# Contribute to Course Board

Course Board accepts changes to the compiler, content contracts, browser shell, documentation, and example course. Start with the [project map](README.md#project-map), the [authoring guide](docs/authoring.md), and the tests for the area you want to change. For release and GitHub settings, see the [publishing guide](docs/publishing.md).

## Make a change

1. Fork the repository or create a branch. Keep existing lesson IDs, step order, package exports, and version 1 content compatible. Describe any necessary migration in [docs/migrations.md](docs/migrations.md).
2. Define a user-visible change in its guide, schema, or example first. Update the implementation and add a focused regression test when existing tests cannot catch a break. Update the README and affected guides.
3. Use Node.js 20.19 or later. Install the locked dependencies and run the checks:

   ```sh
   npm ci
   npm run lint
   npm test
   npm run coverage
   npm run build
   npm pack --dry-run
   ```

4. For browser changes, check narrow and wide screens, keyboard navigation, focus, and a direct step link. Use `npm run dev` for the example. For package changes, inspect the archive and install it in a scratch project.
5. Open a pull request. Explain the problem, the change, the checks, and any limits. Do not commit `node_modules/`, build output, or package archives.

CI runs the checks on Node.js 20.19 and 22. Coverage reports the Node modules loaded by tests; it is not a browser coverage measurement. A green check does not replace a browser review.
