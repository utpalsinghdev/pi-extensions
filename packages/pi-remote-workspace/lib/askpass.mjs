// Invoked only by OpenSSH. Credentials travel over an owner-only Unix socket, never argv or files.
import { connect } from "node:net";

const prompt = process.argv[2] || "SSH authentication";
const confirmation = process.env.SSH_ASKPASS_PROMPT === "confirm" ||
	/The authenticity of host|Are you sure you want to continue connecting|Please type 'yes', 'no' or the fingerprint/i.test(prompt);
const socket = connect(process.env.PI_REMOTE_WORKSPACE_ASKPASS_SOCKET || "");
let response = "";
const timer = setTimeout(() => socket.destroy(), 300_000);
const fail = () => { clearTimeout(timer); process.exitCode = 1; };
socket.on("connect", () => socket.write(JSON.stringify({
	text: prompt,
	kind: confirmation ? "confirm" : "secret",
}) + "\n"));
socket.on("data", (data) => {
	response += data.toString();
	if (response.length > 65536) return socket.destroy();
	if (!response.includes("\n")) return;
	try {
		const value = JSON.parse(response);
		response = "";
		if (typeof value.answer !== "string") fail();
		else process.stdout.write(value.answer + "\n");
	} catch { fail(); }
	clearTimeout(timer);
	socket.end();
});
socket.on("error", fail);
socket.on("close", () => { clearTimeout(timer); });
