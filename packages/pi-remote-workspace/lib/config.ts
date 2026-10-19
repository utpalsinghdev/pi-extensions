export interface ConnectionSpec {
	host: string;
	user?: string;
	port?: number;
	directory: string;
}

export interface AuthPrompt {
	text: string;
	kind: "secret" | "confirm";
}

export type AskPass = (prompt: AuthPrompt) => Promise<string | undefined>;

/** Quote one POSIX shell argument; JSON escaping is not shell escaping. */
export function shellQuote(value: string): string {
	if (value.includes("\0")) throw new Error("NUL is not allowed in paths or commands.");
	return "'" + value.replaceAll("'", "'\\''") + "'";
}

export function validateConnection(spec: ConnectionSpec): ConnectionSpec {
	const host = spec.host.trim();
	const user = spec.user?.trim() || undefined;
	if (!host || host.startsWith("-") || !/^[a-zA-Z0-9_.:[\]%-]+$/.test(host)) {
		throw new Error("Enter a hostname, SSH config alias, or IP address without spaces.");
	}
	if (user && (!/^[a-zA-Z0-9_.-]+$/.test(user) || user.startsWith("-"))) {
		throw new Error("Enter a valid SSH username, or leave it empty to use SSH config.");
	}
	if (spec.port !== undefined && (!Number.isInteger(spec.port) || spec.port < 1 || spec.port > 65535)) {
		throw new Error("Port must be between 1 and 65535.");
	}
	if (/[\0\r\n]/.test(spec.directory)) throw new Error("Directory must be a single path.");
	return { host, user, port: spec.port, directory: spec.directory.trim() || "~" };
}
