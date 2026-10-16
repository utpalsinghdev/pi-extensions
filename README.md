# pi-extensions

Hi, I'm Utpal. I use these [Pi Coding Agent](https://pi.dev) extensions in my daily workflow.

I'm making them open source so you can use them or adapt them to your own setup.

## Extension catalog

- [pi-focus-mode](packages/pi-focus-mode/README.md) keeps prompts and assistant replies visible while hiding tool activity and optionally thinking. [View demo](packages/pi-focus-mode/README.md#demo).
- [pi-prompt-stash](packages/pi-prompt-stash/README.md) saves your half-written prompt when Pi goes off track or asks a question. Restore it when you're ready to continue. [View demo](packages/pi-prompt-stash/README.md#demo).
- [pi-context-window](packages/pi-context-window/README.md) shows the agent the context window size, usage, and a planning threshold you set. It does not change auto-compaction. [View demo](packages/pi-context-window/README.md#demo).
- [pi-custom-header](packages/pi-custom-header/README.md) adds a blinking dot-art portrait and split workspace header. Available from a clone only, not npm. [View preview](packages/pi-custom-header/README.md).

Published extensions under `packages/` have separate npm names and versions. pi-custom-header stays private and source-only so you can customize its design for your own setup rather than use an npm release. The workspace root is private and is never published.

## Install

Install pi-focus-mode from npm:

```sh
pi install npm:@utpalsinghdev/pi-focus-mode
```

Install pi-prompt-stash:

```sh
pi install npm:@utpalsinghdev/pi-prompt-stash
```

Install pi-context-window:

```sh
pi install npm:@utpalsinghdev/pi-context-window
```

### Get only custom header

With Git and Pi installed, use sparse checkout to get the header without the other extensions:

```sh
git clone --depth 1 --filter=blob:none --sparse https://github.com/utpalsinghdev/pi-extensions.git pi-custom-header
cd pi-custom-header
git sparse-checkout set packages/pi-custom-header
pi install ./packages/pi-custom-header
```

Repository root files are included. No workspace dependency install or build is needed. Keep the clone at the same location, edit the source to suit your setup, and run `/reload` in Pi. See the [custom header README](packages/pi-custom-header/README.md#get-only-this-extension) for customization paths.

## Run from a clone

Use Node.js 22.19 or newer, npm, and Git:

```sh
git clone https://github.com/utpalsinghdev/pi-extensions.git
cd pi-extensions
npm ci --ignore-scripts
npm run focus
```

This starts the workspace's local Pi with only pi-focus-mode loaded. No global Pi installation or personal extensions are required. Use Pi's normal `/login` command if model credentials are not configured.

If Pi is already installed, you can load the source directly without installing workspace development tools:

```sh
pi --no-extensions --extension ./packages/pi-focus-mode
```

To try prompt stash instead, run `npm run stash`. See its [README](packages/pi-prompt-stash/README.md#verify) for isolated manual testing without touching personal prompts.

To try the context window extension, run `npm run context-window`. Use a temporary agent directory if you do not want that run to change your saved threshold. See its [README](packages/pi-context-window/README.md#verify).

To try the custom header, run `npm run custom-header`. See its [README](packages/pi-custom-header/README.md) for persistent local installation and disabling animation. It is not published to npm.

These commands do not add extensions to your saved Pi package settings. Pi loads the TypeScript source directly; no build is required.

## Contributing

See [Contributing](CONTRIBUTING.md) for setup, checks, and adding an extension.

## Layout

```text
pi-extensions/
├── docs/
│   ├── designs/pi-focus-mode.md
│   └── publishing.md
├── packages/
│   ├── pi-custom-header/
│   │   ├── assets/pi-custom-header-preview.png
│   │   ├── extensions/index.ts
│   │   ├── lib/
│   │   ├── test/
│   │   ├── package.json
│   │   ├── LICENSE
│   │   └── README.md
│   ├── pi-context-window/
│   │   ├── assets/pi-context-window-demo.gif
│   │   ├── extensions/index.ts
│   │   ├── lib/
│   │   ├── test/
│   │   ├── package.json
│   │   ├── LICENSE
│   │   └── README.md
│   ├── pi-prompt-stash/
│   │   ├── assets/pi-prompt-stash-demo.gif
│   │   ├── extensions/index.ts
│   │   ├── lib/
│   │   ├── test/
│   │   ├── package.json
│   │   ├── LICENSE
│   │   └── README.md
│   └── pi-focus-mode/
│       ├── assets/
│       │   ├── pi-focus-mode-demo.gif
│       │   └── pi-focus-mode-demo.mp4
│       ├── extensions/index.ts
│       ├── lib/render-adapter.ts
│       ├── test/render-adapter.test.ts
│       ├── package.json
│       ├── LICENSE
│       └── README.md
├── scripts/
├── CONTRIBUTING.md
├── LICENSE
├── package.json
├── package-lock.json
└── tsconfig.json
```

## Publishing

npm releases are per extension. pi-custom-header is intentionally source-only and must remain private. Public npm packages with the `pi-package` keyword are eligible for the [Pi package catalog](https://pi.dev/packages).

Package manifests stay private until release metadata and publication are approved. See [Publishing extensions](docs/publishing.md) for release steps.

## License

[MIT](LICENSE).
