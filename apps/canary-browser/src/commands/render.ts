import { pad } from "@usecanary/cli-kit";
import type { BrowserSummary, StatusSummary } from "@usecanary/protocol";
import { formatDurationMs } from "../util/format.js";

export { renderJsonResult } from "@usecanary/cli-kit";

// Renders `browsers` result data to the given writer.
export function renderBrowsersResult(
  raw: unknown,
  stdout: NodeJS.WritableStream
): void {
  const browsers = raw as BrowserSummary[];
  if (!Array.isArray(browsers) || browsers.length === 0) {
    stdout.write("No browsers.\n");
    return;
  }

  const pageValues = browsers.map((b) =>
    b.pages.length === 0 ? "-" : b.pages.join(", ")
  );

  const nameWidth = Math.max(
    "NAME".length,
    ...browsers.map((b) => b.name.length)
  );
  const typeWidth = Math.max(
    "TYPE".length,
    ...browsers.map((b) => b.type.length)
  );
  const statusWidth = Math.max(
    "STATUS".length,
    ...browsers.map((b) => b.status.length)
  );

  stdout.write(
    `${pad("NAME", nameWidth)}  ${pad("TYPE", typeWidth)}  ${pad("STATUS", statusWidth)}  PAGES\n`
  );

  for (let i = 0; i < browsers.length; i += 1) {
    const b = browsers[i];
    if (!b) {
      continue;
    }
    stdout.write(
      `${pad(b.name, nameWidth)}  ${pad(b.type, typeWidth)}  ${pad(
        b.status,
        statusWidth
      )}  ${pageValues[i]}\n`
    );
  }
}

// Renders `status` result data.
export function renderStatusResult(
  raw: unknown,
  stdout: NodeJS.WritableStream
): void {
  const status = raw as StatusSummary;
  stdout.write(`PID: ${status.pid}\n`);
  stdout.write(`Uptime: ${formatDurationMs(status.uptimeMs)}\n`);
  stdout.write(`Browsers: ${status.browserCount}\n`);
  stdout.write(`Socket: ${status.socketPath}\n`);
  if (status.browsers.length > 0) {
    const managed = status.browsers
      .map((b) => `${b.name} (${b.type}, ${b.status})`)
      .join(", ");
    stdout.write(`Managed: ${managed}\n`);
  }
}
