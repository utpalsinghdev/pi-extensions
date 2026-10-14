# pi-focus-mode

Keep your prompts and Pi's replies visible while tools run in the background.

Focus mode hides tool calls, tool results, inline tool images, and thinking. Pi's working indicator stays unchanged. Tools still execute normally, and Pi keeps the full session history.

No companion extension or extra runtime software is required. Pi supplies the only runtime dependencies.

## Demo

![Focus mode demo](https://raw.githubusercontent.com/utpalsinghdev/pi-extensions/main/packages/pi-focus-mode/assets/pi-focus-mode-demo.gif)

[Watch the full-resolution video](https://raw.githubusercontent.com/utpalsinghdev/pi-extensions/main/packages/pi-focus-mode/assets/pi-focus-mode-demo.mp4).

The recording uses a customized Pi UI. Focus mode itself only hides tool activity and optional thinking.

## Try it locally

From a clone's repository root, install development dependencies and start the local Pi:

```sh
npm ci --ignore-scripts
npm run focus
```

This loads only pi-focus-mode. No global Pi installation is required.

If Pi is already installed, you can load the source directly:

```sh
pi --no-extensions --extension ./packages/pi-focus-mode
```

Focus mode starts enabled. To keep a local installation:

```sh
pi install ./packages/pi-focus-mode
```

The npm package name is `@utpalsinghdev/pi-focus-mode`. It has not been published yet.

## Controls

- `/focus` toggles focus mode.
- `/focus on` hides tool activity.
- `/focus off` restores Pi's normal transcript, including existing tool output.
- `/focus thinking on` allows thinking while tool activity stays hidden.
- `/focus thinking off` hides thinking completely.
- `/focus thinking` toggles the thinking option.

When thinking is allowed, Pi's native `Ctrl+T` shortcut still expands or collapses it. Focus mode does not change your saved thinking-display preference or the model's reasoning level.

Preferences follow the active session branch and survive reloads and session resume. New sessions start with focus enabled and thinking hidden.

## What stays visible

Assistant text, including progress messages, remains visible. The native editor, footer, approval dialogs, and agent errors stay usable. Other extensions keep their own widgets and notifications. Commands you run yourself with `!` or `!!` retain their normal output.

Focus mode is not a security or redaction feature. Hidden tool output and thinking remain in saved sessions, model context, and exports.

## Compatibility

Requires Node.js 22.19 or newer and Pi 1.0.2 through 1.2.x. Verified with stock Pi 1.0.2, 1.1.0, and 1.2.0.

The extension uses a display adapter around Pi's exported UI components because tool renderers alone cannot hide inline images. Unsupported Pi versions retain the normal UI and show a warning. Support for Pi 1.3 and newer requires another compatibility check.

Both fullscreen and regular terminal modes are supported. In regular mode, text already stored in your terminal's scrollback cannot be erased. Focus mode filters Pi's current transcript and future rendering.

Print, JSON, and RPC modes remain unchanged.

## Development

From the repository root:

```sh
npm ci --ignore-scripts
npm run check
npm test
npm pack --workspace @utpalsinghdev/pi-focus-mode --dry-run
```

Pi loads the TypeScript source directly. No build step is required. Contribution instructions are in `CONTRIBUTING.md` at the repository root.

## License

[MIT](LICENSE).
