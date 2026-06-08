import { spawn } from "node:child_process";

export interface Cmd {
  args: string[];
  file: string;
}

export function runInherit(cmd: Cmd): Promise<number> {
  return new Promise((resolve) => {
    // Windows: npm/npx/canary are .cmd shims; spawning a .cmd without a shell
    // throws EINVAL since Node's CVE-2024-27980 patch. Use the string form
    // (command + args in one string) with shell:true so we also dodge the
    // DEP0190 warning Node prints for shell:true + an args array. Args here
    // are static and space-free, so the join is unambiguous.
    const child =
      process.platform === "win32"
        ? spawn([cmd.file, ...cmd.args].join(" "), {
            stdio: "inherit",
            windowsHide: true,
            shell: true,
          })
        : spawn(cmd.file, cmd.args, { stdio: "inherit", windowsHide: true });
    child.on("error", () => resolve(1));
    child.on("exit", (code) => resolve(code ?? 1));
  });
}
