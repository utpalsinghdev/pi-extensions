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

## Run prompt stash

```sh
PI_CODING_AGENT_DIR="$(mktemp -d)" npm run stash
```

This uses a temporary agent directory so testing cannot change personal saved prompts. Follow the [manual checklist](packages/pi-prompt-stash/README.md#verify), including shortcut changes, persistence, deletion, and narrow terminals.

## Run context window

```sh
PI_CODING_AGENT_DIR="$(mktemp -d)" npm run context-window
```

This uses a temporary agent directory so testing cannot change your personal context threshold. Follow the [manual checklist](packages/pi-context-window/README.md#verify). The extension reports window size and a percentage or fixed-token threshold you set. Verify `/context-threshold 70`, `/context-threshold-static 200k`, raw token counts, mode switching, clear, and persistence. A static threshold must stay fixed across model-window changes. It does not read or change Pi compaction settings.

## Run custom header

```sh
PI_CODING_AGENT_DIR="$(mktemp -d)" npm run custom-header
```

This loads the dot-art split header without personal extensions. Follow the [manual checklist](packages/pi-custom-header/README.md#verify) in regular and fullscreen modes. The package stays private and source-only. Do not publish it to npm.

## Verify your changes

```sh
npm run check
npm test
npm pack --workspace @utpalsinghdev/pi-focus-mode --dry-run
npm pack --workspace @utpalsinghdev/pi-prompt-stash --dry-run
npm pack --workspace @utpalsinghdev/pi-context-window --dry-run
```

For rendering changes, also check the interactive UI in fullscreen and regular modes. For focus mode, check focus toggling, thinking visibility, and reload. For the custom header, check narrow resizing, blinking, `--header-static`, `/builtin-header`, and reload. If you change the supported Pi range, verify those versions rather than widening the version guard alone.

## Add an extension

Create a separate directory under `packages/` with its own `package.json`, README, and entrypoint. Declare entrypoints under `pi.extensions` using paths relative to that package. Keep runtime helpers inside the package's `files` allowlist.

Keep demo media under each extension's `assets/` directory, using names such as `pi-focus-mode-demo.gif` and `pi-focus-mode-demo.mp4`. Link the preview from that package's README and declare its public URLs in `pi.image` and `pi.video`. Keep demo assets out of the npm `files` allowlist unless the extension needs them at runtime.

Declare imported host-provided Pi packages as peer dependencies, not runtime dependencies. Keep shared development tools at the workspace root. Existing workspace checks include TypeScript files under `packages/` and tests under each package's `test/` directory.

Use repository-relative paths in scripts and examples. Do not depend on a contributor's home directory, personal Pi extensions, or local verification files. `.pi/` and credential files are ignored and are not contributor prerequisites.

New packages remain private until their name, license, and release metadata are approved. See [Publishing extensions](docs/publishing.md) before publishing.
