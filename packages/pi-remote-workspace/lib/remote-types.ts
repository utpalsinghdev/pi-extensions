export interface RemoteResult {
	stdout: Buffer;
	stderr: Buffer;
	exitCode: number;
}

export interface RunOptions {
	input?: string | Buffer;
	signal?: AbortSignal;
	timeout?: number;
	onData?: (data: Buffer) => void;
}

/** Operations always use the existing SSH master; they must never open another connection. */
export interface RemoteWorkspace {
	readonly cwd: string;
	readonly home: string;
	readonly connected: boolean;
	run(command: string, options?: RunOptions): Promise<RemoteResult>;
	close(): Promise<void>;
}
