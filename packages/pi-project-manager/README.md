# pi-project-manager

I work on a lot of small projects, including freelance work, personal tools, and extensions. With AI, many take two or three days to finish. Then I might not touch them until a client comes back weeks or months later with a bug or a small change.

I use Herdr as a terminal multiplexer, but I don't want every one of those projects filling its sidebar. The same goes for small tools I build for myself. I only need them occasionally, and I want to find and open them without leaving the terminal or remembering the path.

I built this extension to switch to those projects from inside Pi without keeping them all open. Whenever I open Pi in a folder, it goes into a local list. `/pm` lets me search that list and see each project's location, Git branch, and recent activity.

The agent can use the same list. I can say, "I already implemented this in another project. Use that as a reference," and it can look up the folder and inspect the code instead of searching my whole machine.

Selecting another project starts a fresh session in that folder. Selecting the current project only closes the popup, preserving your conversation.

The package is private and available from this checkout only.

## Demo

![Project manager demo](https://raw.githubusercontent.com/utpalsinghdev/pi-extensions/main/packages/pi-project-manager/assets/pi-project-manager-demo.gif)

The recording uses a customized Pi UI and example activity timestamps.

## Install from a local checkout

With Pi installed, use the package's absolute path:

```sh
pi install /absolute/path/to/pi-extensions/packages/pi-project-manager
```

Restart Pi or run `/reload`. This enables tracking across future launches. Keep the source directory in place.

## Try from source

From the repository root, use Node.js 22.19 or newer:

```sh
npm ci --ignore-scripts
npm run pm
```

This loads only pi-project-manager, without your other extensions, skills, prompt templates, themes, or context files. It does not change your saved Pi package settings. Picker commands do not need model credentials.

If Pi is already installed, load it alongside your usual extensions:

```sh
pi --extension ./packages/pi-project-manager
```

Git must be on your PATH for branch labels. The `` icon needs a Nerd Font in your terminal; the rest of the extension works without one.

## Use the picker

Run `/pm`, or `/pm search terms` to start with a search entered.

- Type to search names and paths. All search words must match the path.
- Use Up and Down to select, or Page Up and Page Down to scroll.
- Press Enter to open another project in a fresh session.
- Press Enter on the current project to close without changing the session.
- Press Escape or Ctrl+C to close.

The popup sits near the top of the terminal and shows up to 12 projects at once, depending on terminal height. Projects sort by last use, newest first. Ages appear as `5d ago`, `1w ago`, or `2mo ago`. The word `current` stays highlighted even when you select another row.

The Git icon and branch name appear in bright cyan beside the folder path, on the second line. Long paths and branches truncate to fit. The picker follows Pi's configured selection keys.

Wait for the current response to finish before switching. Pi reloads tools, project instructions, and resources for the new workspace. Your previous conversation stays in its saved session; no history moves between projects. Missing or inaccessible folders produce an error instead of a switch.

The popup requires interactive terminal mode. With `--no-session`, you can still browse and remove entries, but switching to another folder is disabled.

## Remove a project

Select an entry and press Ctrl+D twice consecutively:

1. The first press shows `Press Ctrl+D again to remove from list.`
2. The second press removes that entry.

Moving selection or typing cancels confirmation. Removal never deletes the folder or its files, and it also works for folders that no longer exist.

Removing the current project does not interrupt its session. Later responses do not recreate the entry. Opening that folder again, or reloading its active session, registers it again.

## Git branches without watchers

Branches load asynchronously for visible rows only. The popup opens before lookups finish, with at most four lookups running at once. Each query reads Git metadata through `git symbolic-ref`; it does not run `git status`, inspect project contents, or contact a remote.

Normal repositories, nested folders, worktrees, and branches without commits are supported. Detached HEAD shows `detached`. Non-Git folders have no branch label.

Results stay cached while the popup is open. Scroll or search to load newly visible rows. Reopen the popup to refresh branches after a checkout.

Lookups stop when the popup closes. A query that fails or exceeds two seconds leaves the branch label blank without blocking the picker. There are no persistent background processes.

## Let the agent find another project

Ask, for example:

> Check how I implemented authentication in my other project and use the same approach here.

The `list_projects` tool accepts optional `query` and `limit` parameters. It returns names, absolute paths, last-used Unix timestamps in milliseconds, and a current-workspace flag. The default limit is 50, with a maximum of 100. Narrow the query if results are truncated.

Lookup is read-only. It does not switch sessions, fetch Git branches, or mark another project as used. The agent can inspect absolute paths or run a command in that directory while keeping your current conversation. Existing permissions still apply.

## Local storage and tracking

Tracking starts when this extension is loaded. There is no import of old sessions or scan of your projects directory. Previously opened folders appear after you open them again with the extension enabled.

Every opened folder counts, whether or not it is a Git repository. Symlinks resolve to the same entry. Nested folders and Git worktrees remain separate entries.

The extension registers the current folder on `session_start`. Completed agent runs update its timestamp only while its entry still exists. Idle time does not advance it. Last-used times approximate activity, not time spent working.

By default, records live in:

```text
~/.pi/agent/project-manager/projects/<path-hash>.json
```

If `PI_CODING_AGENT_DIR` is set, storage uses that agent directory instead. Each file contains only a canonical absolute path and timestamp:

```json
{
  "path": "/home/you/projects/my-app",
  "lastUsed": 1792452188145
}
```

The name is derived from the final folder name, not stored separately. Filenames use a SHA-256 hash of the resolved path. Each write atomically replaces one small record, so different projects do not share a writable list file. Branch names are not saved.

Opening the picker reads a registry snapshot. Typing filters it in memory; removing an entry deletes its record. Reopen the popup to see entries added by another Pi process.

Paths stay local until a tool result exposes them to the active model. Deleted folders remain listed until you remove their entries. A malformed record reports its location rather than being silently discarded.

## Verify

Use a temporary agent directory so checks do not change your personal list:

```sh
agent_dir="$(mktemp -d)"
PI_CODING_AGENT_DIR="$agent_dir" npm run pm
```

Reuse the same agent directory for each launch.

1. Open Pi from two folders with this extension loaded. Check that both appear. Open one through a symlink and check that no duplicate appears.
2. Search by name and parent path. Check arrows, paging, no-match searches, Escape, and narrow resizing in regular and fullscreen modes.
3. Select another folder. Check the footer, `pwd`, relative file reads, and an empty conversation. Select the current folder and check that its conversation stays unchanged.
4. Move selection away from the current folder. Check that only the word `current` keeps its persistent highlight.
5. Press Ctrl+D once. Check that a warning appears without removing anything. Move or type to cancel, then confirm with two consecutive presses. Check that the folder remains intact and the entry stays removed after reopening the popup.
6. Remove the current entry and complete another response. Check that it stays absent until the next session start.
7. Check branch labels in a repository, worktree, detached HEAD, and non-Git folder. Change a branch while the popup is open; check that reopening refreshes its label.
8. Ask the agent to find another known project. Check that `list_projects` returns its path without changing workspace.
9. Delete a registered folder, then try opening it. Check that the current session stays unchanged and its stale entry can still be removed.

## Package layout

- `extensions/index.ts` registers `/pm`, the `list_projects` tool, and activity hooks.
- `lib/picker.ts` renders the project list, search, and removal confirmation.
- `lib/store.ts` reads and writes the local project registry.
- `lib/branches.ts` loads and caches Git branches for visible rows.
- `lib/switch.ts` opens a fresh session in another workspace.

Pi loads the TypeScript source directly. No build step is required.

## License

[MIT](LICENSE).
