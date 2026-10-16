# Changelog

## 0.2.1

- Include this changelog in the npm package and link it from the README.
- Document how to update the installed extension.
- No runtime changes from 0.2.0.

## 0.2.0

- Add `/context-threshold-static 200k` to set a fixed 200,000-token planning threshold. `200000` and `200K` are also accepted.
- Keep static thresholds fixed when switching models with different context-window sizes.
- Use `/context-threshold 70` to switch back to a percentage threshold. Only one threshold is active at a time.
- Allow either threshold command to show the active limit or clear it with `clear` or `off`.
- Report static thresholds and the remaining token gap in `context_window`. Existing percentage settings remain valid. Compaction behavior is unchanged.

## 0.1.0

- Add the `context_window` tool to report context-window size, usage, remaining capacity, and planning-threshold status.
- Add `/context-threshold` to show, set, or clear a percentage threshold, saved across sessions.
