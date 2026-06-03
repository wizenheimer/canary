export interface ConsoleEntry {
  col?: number;
  kind?: string;
  line?: number;
  message?: string;
  text?: string;
  ts?: number;
  type?: string;
  url?: string;
}

// Total function: the daemon writes console.log as newline-delimited JSON (one
// record per console / pageerror event). Unparseable lines are skipped.
export function parseConsole(raw: string): ConsoleEntry[] {
  const entries: ConsoleEntry[] = [];
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    try {
      entries.push(JSON.parse(trimmed) as ConsoleEntry);
    } catch {
      // skip malformed line
    }
  }
  return entries;
}

export function countConsoleErrors(entries: ConsoleEntry[]): number {
  return entries.filter((e) => e.kind === "pageerror" || e.type === "error")
    .length;
}
