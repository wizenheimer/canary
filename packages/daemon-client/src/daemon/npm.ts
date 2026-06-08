// Spawn `npm` with `shell: true` on Windows (see install.ts). Pass the bare
// command name and let the shell resolve `npm.cmd` via PATHEXT. Resolving the
// `.cmd` path ourselves does NOT avoid the EINVAL that Node's CVE-2024-27980
// patch throws for `.cmd`/`.bat` spawned without a shell — only the shell
// option does — and a resolved path with spaces would then break arg-joining.
export function npmCommand(): string {
  return "npm";
}
