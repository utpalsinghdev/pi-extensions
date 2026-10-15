# pi-prompt-stash

I often start writing my next prompt while Pi is still working. If it goes in the wrong direction or asks a question, I need to respond before that prompt is finished.

I used to copy the half-written prompt somewhere else or delete it to free up the editor. Now I stash it, handle the interruption, then restore it and continue writing.

Press **Ctrl+Shift+S** to stash the current editor text and clear the editor. Run `/stash` to restore it later. Restoring a prompt keeps it in the stash for reuse.

## Demo

![Prompt stash demo](https://raw.githubusercontent.com/utpalsinghdev/pi-extensions/main/packages/pi-prompt-stash/assets/pi-prompt-stash-demo.gif)

The recording uses a customized Pi UI.

## Install

```sh
pi install npm:@utpalsinghdev/pi-prompt-stash
```

If you already have a personal prompt-stash extension, disable that copy first. Both register `/stash` and the stash shortcut.

## Try from source

From the repository root, use Node.js 22.19 or newer:

```sh
npm ci --ignore-scripts
npm run stash
```

This loads only pi-prompt-stash, without your other extensions, skills, prompt templates, themes, or context files. It does not change your saved Pi package settings. Model credentials are not needed for stash commands.

If Pi is already installed:

```sh
pi --no-extensions --extension ./packages/pi-prompt-stash
```


## Use

- **Ctrl+Shift+S** saves the editor text, then clears it.
- **`/stash`** opens saved prompts, newest first. Use **↑↓** to navigate, **Enter** to restore, **d** to delete, and **Esc** or **Ctrl+C** to close.
- **`/stash clear`** deletes every saved prompt and resets prompt numbering. There is no confirmation or undo.
- **`/stash shortcut`** changes the shortcut and reloads Pi to apply it. Finish the current response first.

Both dialogs open as centered popups. The picker shows the prompt list beside a multiline preview, or stacks them on narrow terminals. Shortcut errors appear inline without closing the input.

The widget above the editor shows the stash count and disappears when empty. Loading a prompt replaces the current editor text. Stash any unfinished text before restoring another prompt.

The default shortcut needs a terminal that distinguishes Ctrl+Shift+S from Ctrl+S. If it does not work in your terminal, use `/stash shortcut` to choose another binding, such as `alt+s`. Type the binding's name into the dialog, not the key combination itself.

Shortcut configuration rejects plain typing keys and conflicts with Pi's editor and global actions. Other extensions may register competing shortcuts; Pi reports those conflicts separately.

## Storage

Prompts and the shortcut are stored in `~/.pi/agent/prompt-stash.json`, or the directory set by `PI_CODING_AGENT_DIR`. They survive `/reload`, `/new`, session switches, and process restarts.

The package reads the original personal extension's file format. No migration or copying of saved prompts is needed. Prompts stay on disk as plain text. Do not stash secrets.

A failed save leaves the editor and in-memory stash unchanged. Invalid stash files report an error rather than silently overwriting saved prompts. Back up and repair or remove an invalid file before reloading. Separate Pi processes share the file but do not merge concurrent changes.

## Verify

From the repository root:

```sh
npm run check
npm test
npm pack --workspace @utpalsinghdev/pi-prompt-stash --dry-run
```

For manual testing without touching personal prompts, use a temporary agent directory:

```sh
PI_CODING_AGENT_DIR="$(mktemp -d)" npm run stash
```

1. Write a multiline prompt and stash it. Check that the editor clears and the widget shows one prompt.
2. Stash another prompt. Open `/stash` and check newest-first order, navigation, restore, and cancellation.
3. Open the picker again. Confirm restored prompts remain saved. Delete one with **d**.
4. Run `/reload`, then `/new`. Confirm saved prompts remain available.
5. Change the shortcut with `/stash shortcut`. Try an invalid key and a conflicting key such as `ctrl+c`, then a free binding such as `alt+s`. Check the new shortcut after reload.
6. Resize the terminal while the picker is open. Check long prompts and Unicode text at narrow widths.
7. Run `/stash clear` and check that the picker is empty and the widget disappears.

## Package layout

- `extensions/index.ts` registers commands, the shortcut, and the widget.
- `lib/store.ts` reads and writes saved prompts.
- `lib/picker.ts` renders the responsive prompt list and preview.
- `lib/shortcut-dialog.ts` handles shortcut input and inline validation.
- `lib/dialog.ts` provides the shared popup frame.
- `lib/shortcut.ts` validates shortcuts and checks Pi keybindings.

No personal UI extension or external helper directory is required. Pi loads the TypeScript source directly.

## License

[MIT](LICENSE).
