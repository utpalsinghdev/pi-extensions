import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { access, readFile } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { test } from "node:test";
import { sshFixture } from "./ssh-fixture.ts";

const source = new URL("../lib/workspace.ts", import.meta.url).href;

for (const signal of ["SIGHUP", "SIGTERM"] as const) {
	test(`${signal} closes the SSH master and its foreground remote command`, { timeout: 20_000 }, async (t) => {
		const fixture = await sshFixture();
		let temporary: string | undefined;
		const child = spawn(process.execPath, ["--experimental-strip-types", "--input-type=module", "-e", `
			import { SshWorkspace } from ${JSON.stringify(source)};
			const workspace = await SshWorkspace.connect({host:'fixture',directory:'~'}, async prompt =>
				prompt.kind==='confirm'?'yes':process.env.FIXTURE_PASSWORD, AbortSignal.timeout(10000),()=>{},process.env.FIXTURE_CONFIG);
			await workspace.run('printf \\\'%s\\\' "$$" > foreground.pid; printf READY; exec sleep 30', {
				onData: data => { if(data.toString().includes('READY'))console.log('READY:'+Reflect.get(workspace,'remoteTemp')); }
			});
		`], { env: { ...process.env, FIXTURE_PASSWORD: fixture.password, FIXTURE_CONFIG: fixture.config }, stdio: ["ignore", "pipe", "pipe"] });
		t.after(async () => {
			if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
			await fixture.close();
		});
		let diagnostics = "";
		child.stderr.on("data", (data: Buffer) => { diagnostics += data.toString(); });
		const ready = await Promise.race([
			once(child.stdout, "data").then(([data]) => String(data)),
			once(child, "exit").then(() => assert.fail(`Child exited before readiness: ${diagnostics}`)),
		]);
		temporary = ready.match(/READY:(.+\/pi-workspace\.[A-Za-z0-9]{8})/)?.[1];
		assert.ok(temporary, "Readiness includes a remote scratch path");
		assert.ok(temporary.startsWith(fixture.directory + "/"), "Scratch path belongs to this test fixture");
		const pid = await readFile(join(fixture.home, "foreground.pid"), "utf8");
		const exited = once(child, "exit");
		child.kill(signal);
		const [code, exitSignal] = await exited;
		assert.equal(code, null);
		assert.equal(exitSignal, signal);
		let gone = false;
		for (let attempt = 0; attempt < 50; attempt++) {
			try { await access(`/proc/${pid}`); } catch { gone = true; break; }
			await delay(20);
		}
		assert.ok(gone, "The foreground remote process should not survive a closed SSH master");
		await assert.rejects(access(temporary), "Remote scratch directory should be removed on process exit");
	});
}
