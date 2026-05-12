import net from "node:net";
import { createInterface } from "node:readline";
import { daemonEndpoint } from "../paths.js";
import type { Request, Response, BrowserSummary, StatusSummary } from "@canary/protocol";

// 5s write timeout — parity with cli/src/connection.rs:70 set_write_timeout.
const WRITE_TIMEOUT_MS = 5_000;
// Match cli-go's generous frame ceiling so large screenshots / result
// payloads don't truncate.
const MAX_LINE_BYTES = 64 * 1024 * 1024;

export class DaemonConnectionClosed extends Error {
  constructor() {
    super("Daemon connection closed unexpectedly");
    this.name = "DaemonConnectionClosed";
  }
}

export interface DaemonConnection {
  socket: net.Socket;
  reader: AsyncIterableIterator<string>;
}

export async function connectToDaemon(): Promise<DaemonConnection> {
  const endpoint = daemonEndpoint();
  const socket = net.createConnection({ path: endpoint });

  await new Promise<void>((resolve, reject) => {
    const onConnect = () => {
      socket.removeListener("error", onError);
      resolve();
    };
    const onError = (err: Error) => {
      socket.removeListener("connect", onConnect);
      reject(err);
    };
    socket.once("connect", onConnect);
    socket.once("error", onError);
  });

  socket.setNoDelay(true);
  socket.setTimeout(WRITE_TIMEOUT_MS);

  return { socket, reader: readLines(socket) };
}

export async function isDaemonRunning(): Promise<boolean> {
  try {
    const conn = await connectToDaemon();
    conn.socket.destroy();
    return true;
  } catch {
    return false;
  }
}

// Newline-delimited JSON. Mirrors cli/src/connection.rs send_message.
export async function sendMessage(socket: net.Socket, message: Request): Promise<void> {
  const json = JSON.stringify(message);
  await write(socket, json);
  await write(socket, "\n");
}

function write(socket: net.Socket, data: string): Promise<void> {
  return new Promise((resolve, reject) => {
    socket.write(data, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

async function* readLines(socket: net.Socket): AsyncIterableIterator<string> {
  const rl = createInterface({ input: socket, crlfDelay: Infinity });
  let bytes = 0;
  try {
    for await (const line of rl) {
      bytes += line.length;
      if (bytes > MAX_LINE_BYTES) {
        throw new Error(`Daemon message exceeds ${MAX_LINE_BYTES} bytes`);
      }
      yield line;
    }
  } finally {
    rl.close();
  }
}

// Renderer for the daemon's `result` payload — supplied by callers so the
// IPC layer doesn't need to know about result formatting.
export type ResultRenderer = (data: unknown, stdout: NodeJS.WritableStream) => void;

export interface StreamHandlers {
  stdout: NodeJS.WritableStream;
  stderr: NodeJS.WritableStream;
  renderResult?: ResultRenderer;
}

// Stream responses until `complete` or `error`. Returns the process exit
// code (0 for complete, 1 for error). Mirrors cli/src/main.rs stream_responses.
export async function streamResponses(
  conn: DaemonConnection,
  handlers: StreamHandlers
): Promise<number> {
  let sawTerminal = false;
  try {
    for await (const line of conn.reader) {
      let message: Response;
      try {
        message = JSON.parse(line) as Response;
      } catch (err) {
        throw new Error(`malformed response from daemon: ${describe(err)}`);
      }

      switch (message.type) {
        case "stdout":
          handlers.stdout.write(message.data);
          break;
        case "stderr":
          handlers.stderr.write(message.data);
          break;
        case "result":
          handlers.renderResult?.(message.data, handlers.stdout);
          break;
        case "complete":
          sawTerminal = true;
          return 0;
        case "error": {
          sawTerminal = true;
          handlers.stderr.write(`${message.message ?? "Unknown daemon error"}\n`);
          return 1;
        }
        default:
          // Unknown message types are ignored (matches Rust + Go).
          break;
      }
    }
  } finally {
    conn.socket.destroy();
  }

  if (!sawTerminal) {
    throw new DaemonConnectionClosed();
  }
  return 0;
}

// Convenience helper: open, send, stream, return exit code.
export async function sendRequest(
  message: Request,
  renderResult: ResultRenderer | undefined,
  stdout: NodeJS.WritableStream = process.stdout,
  stderr: NodeJS.WritableStream = process.stderr
): Promise<number> {
  const conn = await connectToDaemon();
  try {
    await sendMessage(conn.socket, message);
  } catch (err) {
    conn.socket.destroy();
    throw err;
  }
  return await streamResponses(conn, { stdout, stderr, renderResult });
}

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export type { BrowserSummary, StatusSummary };
