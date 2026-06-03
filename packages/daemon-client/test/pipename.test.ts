import { afterEach, describe, expect, it, vi } from "vitest";
import { daemonPipeName, sanitizePipeSegment } from "../src/ipc/pipename.js";

describe("sanitizePipeSegment", () => {
  it("keeps allowed characters", () => {
    expect(sanitizePipeSegment("alice")).toBe("alice");
    expect(sanitizePipeSegment("alice.bob_-1")).toBe("alice.bob_-1");
  });

  it("replaces disallowed characters with -", () => {
    expect(sanitizePipeSegment("alice bob/charlie")).toBe("alice-bob-charlie");
    expect(sanitizePipeSegment("a@b#c")).toBe("a-b-c");
  });

  it("trims leading and trailing dashes", () => {
    expect(sanitizePipeSegment("@alice@")).toBe("alice");
    expect(sanitizePipeSegment("--alice--")).toBe("alice");
  });

  it("lowercases the result", () => {
    expect(sanitizePipeSegment("ALICE")).toBe("alice");
    expect(sanitizePipeSegment("Alice.Bob")).toBe("alice.bob");
  });

  it("returns 'user' for empty input", () => {
    expect(sanitizePipeSegment("")).toBe("user");
    expect(sanitizePipeSegment("@@@")).toBe("user");
  });
});

describe("daemonPipeName", () => {
  const original = {
    USER: process.env.USER,
    USERNAME: process.env.USERNAME,
  };

  afterEach(() => {
    if (original.USER === undefined) {
      delete process.env.USER;
    } else {
      process.env.USER = original.USER;
    }
    if (original.USERNAME === undefined) {
      delete process.env.USERNAME;
    } else {
      process.env.USERNAME = original.USERNAME;
    }
    vi.unstubAllEnvs();
  });

  it("uses USERNAME if set", () => {
    process.env.USERNAME = "Alice";
    expect(daemonPipeName()).toBe("canary-daemon-alice");
  });

  it("falls back to USER if USERNAME missing", () => {
    delete process.env.USERNAME;
    process.env.USER = "Bob";
    expect(daemonPipeName()).toBe("canary-daemon-bob");
  });

  it("falls back to home dir basename if both env vars missing", () => {
    delete process.env.USERNAME;
    delete process.env.USER;
    // pipe name should still be deterministic for the current HOME
    const name = daemonPipeName();
    expect(name).toMatch(/^canary-daemon-[a-z0-9._-]+$/);
  });
});
