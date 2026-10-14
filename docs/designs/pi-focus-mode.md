# pi-focus-mode

## Goal

Keep user prompts and assistant replies visible while Pi runs tools normally. Hide tool calls, tool results, inline tool images, and thinking. Preserve Pi's working indicator. Let the user enable thinking without revealing tools.

Focus mode is a display preference, not a permission system. Approval dialogs, warnings, and agent errors remain usable. The native editor, commands, theme, and footer stay intact. Other extensions keep their own widgets and dialogs.

## Design

Use one independent package in `packages/pi-focus-mode`. Pi loads its TypeScript entrypoint directly. It has no runtime dependencies beyond host-provided Pi packages.

The public tool renderer API cannot hide inline images because Pi renders those separately. An isolated adapter wraps the exported `ToolExecutionComponent.render` method instead. Returning no lines hides the entire tool component without changing execution, arguments, results, or history. It applies to built-in, extension, and MCP tools, including calls reconstructed from a saved session.

The adapter also wraps `AssistantMessageComponent.render`. In supported Pi versions, thinking blocks are `MouseRegion` children of the assistant's content container. During the synchronous render, remove those children and their spacing, then restore the original children in a `finally` block. Assistant text continues through Pi's own renderer, preserving Markdown, themes, and terminal reply markers. No message content is rewritten.

When thinking is allowed, use Pi's normal thinking display. `Ctrl+T` still expands or collapses it. This avoids changing the user's saved thinking preference.

```text
Model and tools -> unchanged session history -> native UI components
                                                  |
                                           focus adapter
                                                  |
                                     prompts and assistant text
```

## Controls and state

- Focus is enabled by default, with thinking hidden.
- `/focus` toggles focus mode.
- `/focus on` and `/focus off` set it explicitly.
- `/focus thinking on` allows Pi's native thinking display.
- `/focus thinking off` hides thinking completely.
- Store changes as custom session entries, excluded from model context.
- Restore preferences from the active branch on start, reload, and tree navigation.
- An invisible widget supplies Pi's TUI handle for invalidation and redraw. It does not replace the editor or footer.
- Non-interactive modes do not install rendering hooks or alter output.

## Compatibility and cleanup

The adapter depends on Pi's component layout, not only its TypeScript API. Limit activation to a verified Pi version range and validate the assistant container shape. Unsupported versions retain the normal UI and show a clear warning.

Restore owned prototype methods on shutdown and reload. If another extension wraps a method afterward, leave its wrapper intact and make this adapter pass through instead. Toggling focus off reveals existing tool components without reconstructing or deleting session entries.

Regular terminal mode cannot erase text already stored in terminal scrollback. Focus affects Pi's current rendered transcript and future output. Fullscreen mode redraws the current transcript without hidden components.

## Alternatives rejected

- Re-register every tool: changes ownership and execution contracts; misses dynamically connected tools.
- Blank tool renderers alone: inline images remain visible.
- Separate chatbot screen: duplicates the editor and complicates approvals, shortcuts, and session navigation.
- Require a custom Pi fork: conflicts with independent installation for public users.

## Verification

Run type checking and inspect the npm tarball. Exercise stock Pi in regular and fullscreen terminal modes with real UI components and real tool execution. Cover streaming, text and image results, thinking visibility, focus toggling, theme changes, terminal resize, reload, saved-session resume, tree navigation, cancellation, and approval dialogs. Confirm raw session entries retain tool calls, results, and thinking.

The repository and package use MIT. Each extension has its own npm name and version; the workspace root stays private. See the [publishing workflow](../publishing.md) before releasing a package.
