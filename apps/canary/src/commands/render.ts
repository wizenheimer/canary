import { formatDurationMs, pad } from "@canary/cli-kit";
import type { StatusSummary } from "@canary/protocol";
import type { SessionRecord } from "../session/registry.js";

export { renderJsonResult } from "@canary/cli-kit";

export function renderStatusResult(
  raw: unknown,
  stdout: NodeJS.WritableStream
): void {
  const status = raw as StatusSummary;
  stdout.write(`PID: ${status.pid}\n`);
  stdout.write(`Uptime: ${formatDurationMs(status.uptimeMs)}\n`);
  stdout.write(`Browsers: ${status.browserCount}\n`);
  stdout.write(`Socket: ${status.socketPath}\n`);
}

export function renderSessionList(
  records: SessionRecord[],
  stdout: NodeJS.WritableStream
): void {
  if (records.length === 0) {
    stdout.write("No sessions.\n");
    return;
  }

  const idWidth = Math.max("ID".length, ...records.map((r) => r.id.length));
  const nameWidth = Math.max(
    "NAME".length,
    ...records.map((r) => (r.name ?? "-").length)
  );
  const statusWidth = Math.max(
    "STATUS".length,
    ...records.map((r) => r.status.length)
  );

  stdout.write(
    `${pad("ID", idWidth)}  ${pad("NAME", nameWidth)}  ${pad("STATUS", statusWidth)}  STEPS  CREATED\n`
  );
  for (const r of records) {
    stdout.write(
      `${pad(r.id, idWidth)}  ${pad(r.name ?? "-", nameWidth)}  ${pad(
        r.status,
        statusWidth
      )}  ${pad(String(r.steps.length), 5)}  ${r.createdAt}\n`
    );
  }
}

export function renderSessionRecord(
  record: SessionRecord,
  stdout: NodeJS.WritableStream
): void {
  stdout.write(`Session: ${record.id}\n`);
  if (record.name) {
    stdout.write(`Name:    ${record.name}\n`);
  }
  stdout.write(`Status:  ${record.status}\n`);
  stdout.write(`Browser: ${record.browser}\n`);
  const enabled = Object.entries(record.capture)
    .filter(([, on]) => on)
    .map(([kind]) => kind)
    .join(", ");
  stdout.write(`Capture: ${enabled || "none"}\n`);
  stdout.write(`Created: ${record.createdAt}\n`);
  if (record.endedAt) {
    stdout.write(`Ended:   ${record.endedAt}\n`);
  }
  stdout.write(`Artifacts: ${record.artifactsDir}\n`);
  if (record.steps.length > 0) {
    stdout.write("Steps:\n");
    for (const step of record.steps) {
      const mark = step.ok ? "✓" : "✗";
      stdout.write(
        `  ${mark} ${step.name} (${formatDurationMs(step.durationMs)})\n`
      );
    }
  }
}
