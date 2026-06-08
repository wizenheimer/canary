import { describe, expect, it } from "vitest";
import { npmCommand } from "../src/daemon/npm.js";

describe("npmCommand", () => {
  it("returns the bare `npm` (the shell resolves the .cmd shim on Windows)", () => {
    // Resolving npm.cmd by path does NOT avoid the CVE-2024-27980 EINVAL;
    // install.ts passes shell:true and lets the shell find npm via PATHEXT.
    expect(npmCommand()).toBe("npm");
  });
});
