# pi-remote-workspace

I often need my AI coding tools on a server, but I don't want to paste server IPs or passwords into chat. Those details don't belong in conversation history. I also don't want to install and set up my tools on every new machine.

I built this extension to enter my connection details in a private form and switch my existing Pi session to a remote workspace over SSH. Pi stays on my computer, with my model login and conversation. The coding tools work on the server until I switch back. It's inspired by Warp's remote workflow, but built around the way I use Pi.

I use it every day for my work and startup. I work on a project locally, switch to the server when I need to, and ask Pi to handle the deployment and checks. Once the work is done, I return to my local workspace.

## Demo

![Remote workspace demo](https://raw.githubusercontent.com/utpalsinghdev/pi-extensions/main/packages/pi-remote-workspace/assets/pi-remote-workspace-demo.gif)

The recording uses a customized Pi UI. Server connection details are masked.

## Install

```sh
pi install npm:@utpalsinghdev/pi-remote-workspace
```

## Try from source

From the repository root, use Node.js 22.19 or newer:

```sh
npm ci --ignore-scripts
npm run remote
```

This loads only pi-remote-workspace, without your other extensions, skills, prompt templates, themes, or context files. It does not change your saved Pi package settings.

If Pi is already installed:

```sh
pi --no-extensions --extension ./packages/pi-remote-workspace
```

Your computer needs interactive Pi and OpenSSH 8.7 or newer (`ssh`) on your PATH. Verification covers Linux. The client uses Unix sockets and a POSIX shell; Windows is unsupported.

The server needs SSH access, Bash, and standard Linux utilities (`cat`, `mkdir`, `mktemp`, `find`, `head`, `grep`). `rg` improves search when installed; `file` enables image-type detection. Pi does not need to be installed on the server. tmux is not a runtime dependency.

## Use

- `/remote` opens the SSH connection form. Enter the host or SSH alias, username, optional port, and remote directory. The directory defaults to your remote home (`~`).
- `/remote stop` closes the connection and restores your local tools and working directory. Changes already made on the server are not undone.

Host and username are required. Leave the port empty to use your SSH configuration. Enter advances through the fields, then starts the connection from **Connect**. Tab and Shift+Tab move between fields and buttons. Escape cancels. The form also supports clicking in Pi fullscreen mode.

SSH first tries your configured keys or agent. Passwords, key passphrases, and keyboard-interactive responses use a masked prompt in the connection form. Unknown host keys show a fingerprint and require your confirmation. Verify it through a trusted channel before accepting. Changed host keys are rejected.

Once connected, the popup closes and the **Remote workspace** status shows the server directory. Ask Pi to read files, make changes, run tests, or check a deployment as you normally would. Review its plan before making production changes.

Connecting does not upload your local project. Use your normal Git or deployment process to get code onto the server. Clear queued messages before switching workspaces so old tasks do not run on the wrong machine.

## What switches

Enabled `read`, `write`, `edit`, `bash`, `grep`, `find`, and `ls` tools operate on the server through the authenticated SSH connection. Your `!` and `!!` shell commands use the same remote backend. Tools you disabled locally stay disabled.

Relative paths resolve from the remote directory. `~/` refers to the server's home directory. Each shell call starts a new Bash process, so `cd` and `export` affect only that call. Full-screen programs and interactive `sudo` password prompts are not supported.

Other local, MCP, indexing, browser, and background-shell tools stay listed but are blocked while remote. Conflicting extensions that replace core tools block connection or execution rather than risk running locally. Use the isolated source command above if needed.

The agent receives a workspace update identifying the active backend and directory. Local repository instructions and skill paths remain in context but are marked as client-only. The agent should read the server's `AGENTS.md` before changing files. Your normal footer may still show the local directory; the **Remote workspace** status identifies the active coding backend.

Switching appends a workspace update without replacing the leading system prompt or changing tool declarations. This preserves the extension-controlled prompt prefix for caching. Cache expiry, model changes, compaction, and other extensions can still cause misses. Cache billing remains provider-controlled.

## Privacy and limits

Passwords, passphrases, and challenge responses go directly from the private form to OpenSSH through an owner-only temporary Unix socket. They are not placed in model tool arguments, Pi chat or history, environment variables, command-line arguments, or credential files. Your existing SSH configuration, keys, agent, and `known_hosts` still apply. Accepting a new host key lets OpenSSH record it normally.

Pi, model authentication, and conversation history stay on your computer. No local project files or model credentials are copied to the server. Remote file contents and command output still enter normal model context and may be saved in Pi history. Commands can reveal secrets or server addresses; the private login form does not hide everything the server might print.

Automatic `SendEnv`, SSH agent forwarding, X11 forwarding, port forwarding, configured `RemoteCommand` and `LocalCommand`, and background forking are disabled. Explicit `SetEnv` entries and trusted proxy commands in your SSH configuration remain your responsibility.

Remote routing is not a security sandbox. Pi and loaded extensions still run locally with your OS permissions. Malicious extensions or execution outside the tool-routing hooks are not contained. Remote commands have your SSH account's permissions and can access files outside the selected directory. Use a disposable server or an unprivileged account when testing, not a production root account expecting isolation.

A lost connection blocks remote tools. It never silently falls back to local execution or starts another login. Run `/remote stop`, then `/remote` to reconnect. Stop attempts to terminate tracked remote process groups, but detached processes, daemons, or a network failure can leave work running. Stop is not rollback.

Pi still runs on your computer. It does not keep working independently after your laptop sleeps or shuts down. A deployed service can stay online if it runs under a remote service manager.

Reloading, replacing the session, and orderly Pi exit close the connection. SIGHUP and SIGTERM also close the local SSH master. SIGKILL cannot run cleanup. Saved conversations do not restore connections or credentials.

## Verify

From the repository root:

```sh
npm run check
npm test
npm pack --workspace @utpalsinghdev/pi-remote-workspace --dry-run
```

Tests use a local SSH protocol server and generated disposable credentials, not your SSH settings or credentials. Interactive tests use isolated tmux sessions and are skipped if tmux is unavailable. To check with your installed Pi executable:

```sh
PI_REMOTE_WORKSPACE_TEST_CLI="$(command -v pi)" node --experimental-strip-types --test packages/pi-remote-workspace/test/ui.test.ts
```

The UI tests cover authentication, masked entry, host confirmation, remote file tools, shell commands, blocked local tools, disconnects, and restoration. They check credential exclusion from saved Pi data and unchanged tool declarations and prompt prefixes across workspace switches. They use a deterministic fixture provider rather than a paid model call.

For a manual check:

1. Run `/remote` and connect to a disposable server.
2. Ask Pi to run `pwd`, read a file, and create a scratch file. Confirm they belong to the server.
3. Run `!pwd` yourself and confirm the remote directory.
4. Start a long command, then run `/remote stop`. Confirm the status and `!pwd` return to local.
5. Reconnect, interrupt the network, and confirm commands fail instead of running locally.
6. Cancel a login with Escape and check that normal chat and local tools still work.

Do not include real server addresses, credentials, or private command output in [bug reports](https://github.com/utpalsinghdev/pi-extensions/issues) or recordings. Use `XXX.XXX.XXX.XXX` for IP placeholders.

## Package layout

- `extensions/index.ts` registers `/remote`, tool routing, and lifecycle hooks.
- `lib/login.ts` renders the connection form and private prompts.
- `lib/workspace.ts` manages the SSH connection and remote operations.
- `lib/tools.ts` supplies the remote coding tools.
- `lib/askpass.ts` and `lib/askpass.mjs` connect OpenSSH authentication prompts to the private form.
- `lib/prompt.ts` builds workspace updates for the agent.

Pi loads the TypeScript source directly. No build step is required.

## License

[MIT](LICENSE).
