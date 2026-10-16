# Publishing extensions

## Current state

The workspace contains `packages/pi-focus-mode`, `packages/pi-prompt-stash`, and `packages/pi-context-window`, with npm names `@utpalsinghdev/pi-focus-mode`, `@utpalsinghdev/pi-prompt-stash`, and `@utpalsinghdev/pi-context-window`. Each package releases independently. Release metadata for prompt stash is configured for version `0.1.0`. Context window is configured for version `0.2.0`.

The three packages use MIT and are configured for public npm publication. The workspace root stays private. The public source repository is [utpalsinghdev/pi-extensions](https://github.com/utpalsinghdev/pi-extensions). Release credentials stay outside the repository.

The unscoped npm name `pi-focus-mode` belongs to another publisher. The extension's display name and directory remain pi-focus-mode; its npm name uses the approved account scope.

## How publication works

The private root manages `packages/*` npm workspaces. Each package has its own npm name, version, Pi manifest, and resource files. Users install the individual package rather than the workspace root.

Pi's catalog lists npm packages. The official package documentation says the `pi-package` keyword makes an npm package eligible for gallery discovery. It does not document a separate catalog submission step or guarantee an indexing deadline. A GitHub repository alone is not an npm catalog listing.

## Decisions before the first release

The repository and its packages use MIT. Each package's npm name and source repository are configured. Each package records its directory within the shared repository so its npm listing points to the correct source.

Choose a separate npm name and version for each future extension. Its scope must belong to an npm account or organization that can publish the package. Remove `private: true` only from the selected package when its release is approved. Keep the workspace root private.

## Package manifest

The following is an example for a future package, not an extension included in this repository. Replace every placeholder before use.

```json
{
  "name": "@your-scope/pi-extension-name",
  "version": "0.1.0",
  "description": "Replace with a description of the chosen extension.",
  "type": "module",
  "keywords": ["pi-package", "pi-extension"],
  "repository": {
    "type": "git",
    "url": "git+https://github.com/utpalsinghdev/pi-extensions.git",
    "directory": "packages/pi-extension-name"
  },
  "publishConfig": {
    "access": "public"
  },
  "files": ["extensions", "README.md", "CHANGELOG.md", "LICENSE"],
  "pi": {
    "extensions": ["./extensions"]
  },
  "peerDependencies": {
    "@earendil-works/pi-coding-agent": "*"
  }
}
```

Add the chosen SPDX license identifier to `license` and include the matching license text. If the extension imports internal helpers, add their directory to `files`. Every file required at runtime must be in the tarball.

Pi loads TypeScript extension sources directly. A compilation step is not required just to publish those sources. Add a build only if the extension itself needs one.

## Dependencies

Declare third-party runtime imports in the package's `dependencies`. Keep shared development tools at the workspace root.

Pi currently provides `@earendil-works/pi-ai`, `@earendil-works/pi-agent-core`, `@earendil-works/pi-coding-agent`, `@earendil-works/pi-tui`, and `typebox`. Declare the ones the extension imports in `peerDependencies` with the `"*"` range. Do not put them in runtime `dependencies` or bundle them.

## Validate before publishing

From the workspace root:

```sh
npm ci --ignore-scripts
```

Run the current workspace checks:

```sh
npm run check
npm test
```

Pi loads the extension source directly, so no build is required. Also verify the interactive behavior and inspect the package contents.

Try the package locally without adding it to Pi's saved package settings:

```sh
pi -e ./packages/pi-focus-mode
```

Inspect the package contents before publishing:

```sh
npm pack --workspace @utpalsinghdev/pi-focus-mode --dry-run
```

Confirm that the tarball includes the declared entrypoints and their helpers, and excludes credentials, local configuration, and unnecessary files. Use an explicit `files` allowlist in each package. The root `.gitignore` is not a substitute for checking the tarball.

## Publish one package

Merge the feature branch first, then publish from a clean `main` checkout. Re-run verification on `main` before publishing.

Authenticate with npm through its login flow. Public publishing requires the account's supported authentication and two-factor verification. Do not commit tokens or an authenticated `.npmrc`.

```sh
npm login
npm publish --workspace @utpalsinghdev/pi-focus-mode --access public
```

The root manifest has `private: true` deliberately. Publish the selected workspace only. For prompt stash, use `--workspace @utpalsinghdev/pi-prompt-stash`. For context window, use `--workspace @utpalsinghdev/pi-context-window`. For a future extension, use that package's npm name. Each package releases independently and needs a new version for every subsequent publication.

Automatic publishing through GitHub Actions can be added later. It is not configured in the initial repository.

## Verify after publishing

Read back the published npm metadata:

```sh
npm view @utpalsinghdev/pi-focus-mode version keywords pi --json
```

Test the published package in Pi:

```sh
pi install npm:@utpalsinghdev/pi-focus-mode
```

Confirm that the intended extension loads and behaves correctly. Check [pi.dev/packages](https://pi.dev/packages) for catalog discovery after npm has indexed the package. Catalog eligibility does not guarantee immediate visibility.

## Sources

- [Official Pi package documentation](https://pi.dev/docs/latest/packages)
- [Pi package catalog](https://pi.dev/packages)
- [npm scoped public package publishing](https://docs.npmjs.com/creating-and-publishing-scoped-public-packages/)
