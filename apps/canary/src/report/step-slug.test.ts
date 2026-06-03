import { sessionStepSlug } from "@canary/protocol";
import { describe, expect, it } from "vitest";

describe("sessionStepSlug", () => {
  it("sanitizes to a filesystem-safe stem (with a hash suffix) and a 'step' fallback", () => {
    // Stem is the sanitized name; a short content hash is appended for injectivity.
    expect(sessionStepSlug("login")).toMatch(/^login-[a-z0-9]+$/);
    expect(sessionStepSlug("Log in!")).toMatch(/^Log-in-[a-z0-9]+$/);
    expect(sessionStepSlug("a/b c")).toMatch(/^a-b-c-[a-z0-9]+$/);
    expect(sessionStepSlug("###")).toMatch(/^step-[a-z0-9]+$/);
    expect(sessionStepSlug("--x--")).toMatch(/^x-[a-z0-9]+$/);
  });

  it("is deterministic for the same input", () => {
    expect(sessionStepSlug("login")).toBe(sessionStepSlug("login"));
  });

  it("does not collide for distinct names that share a sanitized stem", () => {
    // The bug this guards: "login/admin" and "login-admin" both sanitize to
    // "login-admin"; the hash suffix keeps their slugs distinct.
    expect(sessionStepSlug("login/admin")).not.toBe(
      sessionStepSlug("login-admin")
    );
    // Names differing only past the 200-char cap must also stay distinct.
    const a = `${"x".repeat(250)}-A`;
    const b = `${"x".repeat(250)}-B`;
    expect(sessionStepSlug(a)).not.toBe(sessionStepSlug(b));
  });
});
