import { execFile } from "node:child_process";
import { promisify } from "node:util";

const runGit = promisify(execFile);
const MAX_CONCURRENT_LOOKUPS = 4;

/** symbolic-ref reads metadata only and also handles worktrees, nested folders and unborn branches. */
async function readGitBranch(path: string, signal: AbortSignal): Promise<string | null> {
	try {
		const { stdout } = await runGit("git", [
			"--no-optional-locks", "-C", path, "symbolic-ref", "--quiet", "--short", "HEAD",
		], {
			encoding: "utf8", signal, timeout: 2_000, maxBuffer: 16_384, windowsHide: true,
			env: { ...process.env, GIT_DIR: undefined, GIT_WORK_TREE: undefined, GIT_COMMON_DIR: undefined },
		});
		return stdout.trim() || null;
	} catch (error) {
		// symbolic-ref exits 1 for a detached HEAD, 128 for a non-repository.
		return !signal.aborted && error instanceof Error && "code" in error && error.code === 1 ? "detached" : null;
	}
}

/** Popup-scoped cache. Only visible, uncached paths are queued, never during rendering itself. */
export function createBranchCache(onUpdate: () => void) {
	const controller = new AbortController();
	const cache = new Map<string, string | null>();
	const pending = new Set<string>();
	let visible: string[] = [];
	let scheduled = false;

	function pump(): void {
		if (controller.signal.aborted) return;
		while (pending.size < MAX_CONCURRENT_LOOKUPS) {
			const path = visible.find((candidate) => !cache.has(candidate) && !pending.has(candidate));
			if (path === undefined) break;
			pending.add(path);
			void readGitBranch(path, controller.signal).then((branch) => {
				pending.delete(path);
				if (controller.signal.aborted) return;
				cache.set(path, branch);
				onUpdate();
				pump();
			});
		}
	}

	return {
		get(path: string) { return cache.get(path); },
		setVisible(paths: string[]) {
			visible = paths;
			if (scheduled || controller.signal.aborted) return;
			scheduled = true;
			queueMicrotask(() => {
				scheduled = false;
				pump();
			});
		},
		dispose() {
			visible = [];
			controller.abort();
			cache.clear();
		},
	};
}
