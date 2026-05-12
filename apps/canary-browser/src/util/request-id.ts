// Mirror of cli/src/main.rs:500-506 — `${prefix}-${unix_millis}-${pid}`.
export function requestId(prefix: string): string {
  return `${prefix}-${Date.now()}-${process.pid}`;
}
