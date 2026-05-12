import type { BrowserSummary, StatusSummary } from "@canary/protocol";
import { formatDurationMs } from "../util/format.js";

// Pretty-prints a script's `result` payload: null is skipped, strings are
// emitted unquoted, everything else is JSON.stringify with 2-space indent.
// Mirrors cli/src/main.rs render_result JSON branch.
export function renderJsonResult(data: unknown, stdout: NodeJS.WritableStream): void {
  if (data === null || data === undefined) return;
  if (typeof data === "string") {
    stdout.write(`${data}\n`);
    return;
  }
  stdout.write(`${JSON.stringify(data, null, 2)}\n`);
}

// Renders `browsers` result data to the given writer. Mirrors
// cli/src/main.rs print_browsers byte-for-byte.
export function renderBrowsersResult(raw: unknown, stdout: NodeJS.WritableStream): void {
  const browsers = raw as BrowserSummary[];
  if (!Array.isArray(browsers) || browsers.length === 0) {
    stdout.write("No browsers.\n");
    return;
  }

  const pageValues = browsers.map((b) => (b.pages.length === 0 ? "-" : b.pages.join(", ")));

  const nameWidth = Math.max("NAME".length, ...browsers.map((b) => b.name.length));
  const typeWidth = Math.max("TYPE".length, ...browsers.map((b) => b.type.length));
  const statusWidth = Math.max("STATUS".length, ...browsers.map((b) => b.status.length));

  stdout.write(
    `${pad("NAME", nameWidth)}  ${pad("TYPE", typeWidth)}  ${pad("STATUS", statusWidth)}  PAGES\n`
  );

  for (let i = 0; i < browsers.length; i += 1) {
    const b = browsers[i];
    if (!b) continue;
    stdout.write(
      `${pad(b.name, nameWidth)}  ${pad(b.type, typeWidth)}  ${pad(
        b.status,
        statusWidth
      )}  ${pageValues[i]}\n`
    );
  }
}

// Renders `status` result data. Mirrors cli/src/main.rs print_status.
export function renderStatusResult(raw: unknown, stdout: NodeJS.WritableStream): void {
  const status = raw as StatusSummary;
  stdout.write(`PID: ${status.pid}\n`);
  stdout.write(`Uptime: ${formatDurationMs(status.uptimeMs)}\n`);
  stdout.write(`Browsers: ${status.browserCount}\n`);
  stdout.write(`Socket: ${status.socketPath}\n`);
  if (status.browsers.length > 0) {
    const managed = status.browsers.map((b) => `${b.name} (${b.type}, ${b.status})`).join(", ");
    stdout.write(`Managed: ${managed}\n`);
  }
}

function pad(value: string, width: number): string {
  if (value.length >= width) return value;
  return value + " ".repeat(width - value.length);
}
