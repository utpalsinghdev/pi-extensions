# pi-context-window

[Dexter Horthy](https://github.com/dexhorthy), founder of Human Layer, says a model gets worse once the context window is about 65% to 70% full. He calls that range the dumb zone, and he describes staying under it as context engineering. [Matt Pocock](https://github.com/mattpocock) keeps sessions around 60% to 70% and hands off past that line. I follow that limit. I stop the session before the window fills past the percent I set.

This extension shows the agent that line while a long task is running. I set a percent with `/context-threshold` or a fixed token count with `/context-threshold-static`. I tell the agent to call `context_window` and watch the threshold status. The agent keeps working while the report is under the threshold. When the report says `threshold reached`, the agent stops and writes a handoff for a new session. I pass that handoff into the new session and continue from there. The handoff I use is Matt Pocock's [handoff skill](https://github.com/mattpocock/skills/blob/main/docs/productivity/handoff.md).

`context_window` reports the window size, tokens used, tokens remaining, and the active planning threshold. The gap to a percentage threshold is a percent. The gap to a static threshold is a token count. It does not compact the session. It does not write the handoff. Pi's compaction settings stay as they are.

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

- `/context-threshold` or `/context-threshold-static` shows the active threshold and the current context report.
- `/context-threshold 70` sets the threshold to 70% of the active context window. `70%` is also accepted.
- `/context-threshold-static 200k` sets a fixed threshold of 200,000 tokens. `200000` and `200K` are also accepted.
- Either command accepts `clear` or `off` to remove the active threshold.
- Percent must be an integer from 1 to 99. Static input must be a positive integer, optionally followed by `k` or `K` for thousands. The resulting count must be a safe JavaScript integer.

Only one threshold is active. Setting a static threshold replaces the percentage threshold, and setting a percentage replaces the static threshold.

A static threshold stays fixed when you switch models. A 200k threshold remains 200,000 tokens on both 500k and 1M windows. The report still shows the model's actual window size and usage. A static threshold does not enlarge a smaller model's window. The model can run out of context or compact before reaching that threshold.

The next `context_window` call reads the saved value. You do not need `/reload`.

On a long task, tell the agent to call `context_window` and to write a handoff when the report says `threshold reached`. I set the threshold in the 60% to 70% range. Until you set one, the report says `threshold not set`. The agent is told not to invent a limit.

## What the agent sees

A normal report looks like this:

```text
Context: 42% used | 84000/200000 tokens | 116000 remaining | threshold 70% | 28% until threshold
```

At or above the threshold, the line ends with `threshold reached`. If Pi does not know usage yet, the line says `unknown used` and does not claim the session is under the threshold. Token counts in the line are exact. In percentage mode, the gap is rounded to one decimal. If the gap is under 0.1% and the threshold is not reached, the line says `under 0.1% until threshold`. The agent should trust `threshold reached` or the reported gap until threshold, and should not recompute the limit from the used percent.

With `/context-threshold-static 200k` on a 1M window, the report looks like this:

```text
Context: 8.4% used | 84000/1000000 tokens | 916000 remaining | threshold 200000 tokens | 116000 tokens until threshold
```

At 200,000 tokens or more, the report says `threshold reached`, regardless of the model's window size.

The tool also returns those fields as structured data for programmatic callers. `thresholdTokens` holds the configured static limit, or `null` in percentage mode. `thresholdPercent` holds the configured percentage, or `null` in static mode. `tokensUntilThreshold` works in both modes. `percentPointsUntilThreshold` is `null` in static mode. The model-facing result is the text line.

## Storage

The threshold is stored in `~/.pi/agent/context-window.json`, or the directory set by `PI_CODING_AGENT_DIR`. It survives `/reload`, `/new`, and process restarts.

Existing percentage settings remain valid without migration. Static settings store `thresholdPercent` as `null` and `thresholdTokens` as the token count.

An invalid file is reported instead of being treated as unset. Setting a threshold with either command replaces an invalid file. Showing the threshold does not.

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
agent_dir="$(mktemp -d)"
PI_CODING_AGENT_DIR="$agent_dir" npm run context-window
```

1. Run `/context-threshold` and check that the threshold is not set.
2. Run `/context-threshold 70`, then `/context-threshold` again. Check that the report includes `threshold 70%`.
3. Run `/context-threshold-static 200k`, then `/context-threshold`. Check that the report shows `threshold 200000 tokens`, not `threshold 70%`.
4. Try `/context-threshold-static 200000` and `/context-threshold-static 200K`. Both must show the same limit.
5. Ask the agent to call `context_window`. Check that the reply includes the actual window size, usage, and the fixed-token threshold.
6. Switch to a model with a different window size. Check that the threshold remains 200,000 tokens.
7. Run `/reload`, then `/context-threshold-static`. Check that the static threshold survives. Restart with `PI_CODING_AGENT_DIR="$agent_dir" npm run context-window` to check persistence across restarts.
8. Run `/context-threshold 70`. Check that percentage mode replaces static mode.
9. Run `/context-threshold-static clear`. Check that the report says `threshold not set`.
10. Set `/context-threshold-static 1`, then ask the agent to call `context_window` after a response. Check for `threshold reached`.
11. Try `/context-threshold-static 0` and `/context-threshold-static 70%`. Both must report usage help without changing the saved threshold.

## Package layout

- `extensions/index.ts` registers the tool, `/context-threshold`, and `/context-threshold-static`.
- `lib/settings.ts` reads and writes the threshold file.
- `lib/report.ts` builds the context report.
- `lib/command.ts` parses and applies the threshold command.

Pi loads the TypeScript source directly. No build step is required.

## License

[MIT](LICENSE).
