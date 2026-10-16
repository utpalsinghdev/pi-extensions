# pi-context-window

[Dexter Horthy](https://github.com/dexhorthy), founder of Human Layer, says a model gets worse once the context window is about 65% to 70% full. He calls that range the dumb zone, and he describes staying under it as context engineering. [Matt Pocock](https://github.com/mattpocock) keeps sessions around 60% to 70% and hands off past that line. I follow that limit. I stop the session before the window fills past the percent I set.

This extension shows the agent that line while a long task is running. I set the percent with `/context-threshold`. I tell the agent to call `context_window` and watch the used percent. The agent keeps working while the report is under the threshold. When the report says `threshold reached`, the agent stops and writes a handoff for a new session. I pass that handoff into the new session and continue from there. The handoff I use is Matt Pocock's [handoff skill](https://github.com/mattpocock/skills/blob/main/docs/productivity/handoff.md).

`context_window` reports the window size, tokens used, tokens remaining, the threshold percent, and the percent still left under that threshold. It does not compact the session. It does not write the handoff. Pi's compaction settings stay as they are.

## Demo

![Context window demo](https://raw.githubusercontent.com/utpalsinghdev/pi-extensions/main/packages/pi-context-window/assets/pi-context-window-demo.gif)

The recording uses a customized Pi UI.

## Install

```sh
pi install npm:@utpalsinghdev/pi-context-window
```

If you already have a personal context-window extension, disable that copy first. Both register the `context_window` tool.

## Try from source

From the repository root, use Node.js 22.19 or newer:

```sh
npm ci --ignore-scripts
npm run context-window
```

This loads only pi-context-window, without your other extensions, skills, prompt templates, themes, or context files. It does not change your saved Pi package settings.

If Pi is already installed:

```sh
pi --no-extensions --extension ./packages/pi-context-window
```

For a manual check that cannot change your personal threshold, use a temporary agent directory:

```sh
PI_CODING_AGENT_DIR="$(mktemp -d)" npm run context-window
```

## Use

- `/context-threshold` shows the current threshold and the current context report.
- `/context-threshold 70` sets the threshold to 70% of the active context window. `70%` is also accepted.
- `/context-threshold clear` removes the threshold. `/context-threshold off` does the same.
- Percent must be an integer from 1 to 99.

The next `context_window` call reads the saved value. You do not need `/reload`.

On a long task, tell the agent to call `context_window` and to write a handoff when the report says `threshold reached`. I set the threshold in the 60% to 70% range. Until you set one, the report says `threshold not set`. The agent is told not to invent a limit.

## What the agent sees

A normal report looks like this:

```text
Context: 42% used | 84000/200000 tokens | 116000 remaining | threshold 70% | 28% until threshold
```

At or above the threshold, the line ends with `threshold reached`. If Pi does not know usage yet, the line says `unknown used` and does not claim the session is under the threshold. Token counts in the line are exact. The gap to the threshold is a percent, because the threshold is a percent. That gap is rounded to one decimal. If the gap is under 0.1% and the threshold is not reached, the line says `under 0.1% until threshold`. The agent should trust `threshold reached` or the percent until threshold, and should not recompute the limit from the used percent.

The tool also returns those fields as structured data for programmatic callers. The model-facing result is the text line.

## Storage

The threshold is stored in `~/.pi/agent/context-window.json`, or the directory set by `PI_CODING_AGENT_DIR`. It survives `/reload`, `/new`, and process restarts.

An invalid file is reported instead of being treated as unset. `/context-threshold 70` replaces an invalid file. Showing the threshold does not.

A failed save leaves the previous file unchanged.

## Verify

From the repository root:

```sh
npm run check
npm test
npm pack --workspace @utpalsinghdev/pi-context-window --dry-run
```

Manual check, without touching a personal threshold:

```sh
PI_CODING_AGENT_DIR="$(mktemp -d)" npm run context-window
```

1. Run `/context-threshold` and check that the threshold is not set.
2. Run `/context-threshold 70`, then `/context-threshold` again. Check that the report includes `threshold 70%`.
3. Run `/context-threshold clear` and check that the report says `threshold not set`.
4. Ask the agent to call `context_window` and check that the reply includes the window size, tokens used, tokens remaining, and the threshold status.
5. Run `/reload`. Check that a saved threshold is still there.

## Package layout

- `extensions/index.ts` registers the tool and `/context-threshold`.
- `lib/settings.ts` reads and writes the threshold file.
- `lib/report.ts` builds the context report.
- `lib/command.ts` parses and applies the threshold command.

Pi loads the TypeScript source directly. No build step is required.

## License

[MIT](LICENSE).
