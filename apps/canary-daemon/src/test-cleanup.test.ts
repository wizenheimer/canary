import type { rm } from "node:fs/promises";

import { describe, expect, it, vi } from "vitest";

import { removeDirectoryWithRetries } from "./test-cleanup.js";

function createFsError(code: string): NodeJS.ErrnoException {
  const error = new Error(`rm failed with ${code}`) as NodeJS.ErrnoException;
  error.code = code;
  return error;
}

describe("removeDirectoryWithRetries", () => {
  it("retries transient file lock errors before succeeding", async () => {
    const remove = vi
      .fn()
      .mockRejectedValueOnce(createFsError("EBUSY"))
      .mockRejectedValueOnce(createFsError("EPERM"))
      .mockResolvedValue(undefined);
    const sleep = vi.fn().mockResolvedValue(undefined);

    await removeDirectoryWithRetries("/tmp/dev-browser-test", {
      rm: remove as unknown as typeof rm,
      sleep,
      retryDelayMs: (attempt) => [25, 50][attempt] ?? 100,
    });

    expect(remove).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenNthCalledWith(1, 25);
    expect(sleep).toHaveBeenNthCalledWith(2, 50);
  });

  it("does not retry non-transient removal errors", async () => {
    const remove = vi.fn().mockRejectedValue(createFsError("EACCES"));
    const sleep = vi.fn().mockResolvedValue(undefined);

    await expect(
      removeDirectoryWithRetries("/tmp/dev-browser-test", {
        rm: remove as unknown as typeof rm,
        sleep,
      })
    ).rejects.toMatchObject({ code: "EACCES" });

    expect(remove).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("surfaces the last transient error after exhausting retries", async () => {
    const remove = vi.fn().mockRejectedValue(createFsError("EBUSY"));
    const sleep = vi.fn().mockResolvedValue(undefined);

    await expect(
      removeDirectoryWithRetries("/tmp/dev-browser-test", {
        rm: remove as unknown as typeof rm,
        sleep,
        maxRetries: 2,
        retryDelayMs: () => 10,
      })
    ).rejects.toMatchObject({ code: "EBUSY" });

    expect(remove).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
  });
});
