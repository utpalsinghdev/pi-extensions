# pi-extensions

Hi, I'm Utpal. I use these [Pi Coding Agent](https://pi.dev) extensions in my daily workflow.

I'm making them open source so you can use them or adapt them to your own setup.

## Extensions

- [pi-focus-mode](packages/pi-focus-mode/README.md) keeps prompts and assistant replies visible while hiding tool activity and optionally thinking. [View demo](packages/pi-focus-mode/README.md#demo).

Each extension under `packages/` has its own npm name and version and publishes independently. The workspace root is private and is never published.

## Install

Install pi-focus-mode from npm:

```sh
pi install npm:@utpalsinghdev/pi-focus-mode
```

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

Neither command adds the extension to your saved Pi package settings. Pi loads the TypeScript source directly; no build is required.

## Contributing

See [Contributing](CONTRIBUTING.md) for setup, checks, and adding an extension.

## Layout

```text
pi-extensions/
├── docs/
│   ├── designs/pi-focus-mode.md
│   └── publishing.md
├── packages/
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

Each extension publishes separately. Public npm packages with the `pi-package` keyword are eligible for the [Pi package catalog](https://pi.dev/packages).

Package manifests stay private until release metadata and publication are approved. See [Publishing extensions](docs/publishing.md) for release steps.

## License

[MIT](LICENSE).
