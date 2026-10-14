# Contributing

Thanks for your interest in contributing. To add an extension or improve an existing one, start with the setup below.

## Set up your checkout

Use Node.js 22.19 or newer and npm. Run commands from the cloned repository's root:

```sh
npm ci --ignore-scripts
```

The lockfile installs the development tools and the Pi version used for verification. No global Pi installation, custom fork, or personal extension setup is required.

## Run focus mode

```sh
npm run focus
```

This loads the local source with other extensions, skills, prompt templates, custom themes, and context files disabled. It does not install the extension into your saved Pi settings. Use Pi's normal `/login` command if needed.

After changing source, run `/reload` in that Pi session.

The focus-mode package contains:

- `extensions/index.ts`: commands, session preferences, and lifecycle handling.
- `lib/render-adapter.ts`: native transcript filtering and compatibility checks.
- `test/render-adapter.test.ts`: checks using real Pi UI components.

Keep execution and session history unchanged. Preserve the native working indicator, editor, approval dialogs, and errors.

## Verify your changes

```sh
npm run check
npm test
npm pack --workspace @utpalsinghdev/pi-focus-mode --dry-run
```

For rendering changes, also check the interactive UI in fullscreen and regular modes. Check focus toggling, thinking visibility, and reload. If you change the supported Pi range, verify those versions rather than widening the version guard alone.

## Add an extension

Create a separate directory under `packages/` with its own `package.json`, README, and entrypoint. Declare entrypoints under `pi.extensions` using paths relative to that package. Keep runtime helpers inside the package's `files` allowlist.

Declare imported host-provided Pi packages as peer dependencies, not runtime dependencies. Keep shared development tools at the workspace root. Existing workspace checks include TypeScript files under `packages/` and tests under each package's `test/` directory.

Use repository-relative paths in scripts and examples. Do not depend on a contributor's home directory, personal Pi extensions, or local verification files. `.pi/` and credential files are ignored and are not contributor prerequisites.

New packages remain private until their name, license, and release metadata are approved. See [Publishing extensions](docs/publishing.md) before publishing.
