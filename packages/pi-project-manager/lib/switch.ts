import { accessSync, constants, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import { type ExtensionCommandContext, SessionManager } from "@earendil-works/pi-coding-agent";

/** Replace the entire Pi runtime so tools, instructions and resources use the target cwd. */
export async function openProject(path: string, ctx: ExtensionCommandContext): Promise<void> {
	if (!ctx.isIdle()) throw new Error("Wait for the current response to finish before switching projects.");
	if (!ctx.sessionManager.getSessionFile()) throw new Error("/pm switching requires saved sessions. Restart Pi without --no-session.");
	const cwd = realpathSync(path);
	if (!statSync(cwd).isDirectory()) throw new Error(`Project is not a folder: ${cwd}`);
	accessSync(cwd, constants.R_OK | constants.X_OK);

	// newSession() has no cwd option. Bootstrap an empty session using Pi's own header.
	const manager = SessionManager.create(cwd);
	const file = manager.getSessionFile();
	const header = manager.getHeader();
	if (!file || !header) throw new Error("Pi could not create a project session.");
	writeFileSync(file, JSON.stringify(header) + "\n", { encoding: "utf8", mode: 0o600, flag: "wx" });

	const result = await ctx.switchSession(file, {
		withSession: async (next) => {
			next.ui.notify(`Opened ${next.cwd} in a fresh session.`, "info");
		},
	});
	if (result.cancelled) rmSync(file, { force: true });
}
