import { describe, expect, it } from "vitest";

import { createKeyedLock, createMutex } from "./lock.js";

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((innerResolve) => {
    resolve = innerResolve;
  });

  return { promise, resolve };
}

describe("createKeyedLock", () => {
  it("serializes actions with the same key", async () => {
    const withLock = createKeyedLock<string>();
    const firstGate = createDeferred<void>();
    const secondGate = createDeferred<void>();
    const events: string[] = [];

    const first = withLock("chromium", async () => {
      events.push("first:start");
      await firstGate.promise;
      events.push("first:end");
    });

    await Promise.resolve();

    const second = withLock("chromium", async () => {
      events.push("second:start");
      secondGate.resolve();
      events.push("second:end");
    });

    await Promise.resolve();
    expect(events).toEqual(["first:start"]);

    firstGate.resolve();
    await first;
    await secondGate.promise;
    await second;

    expect(events).toEqual(["first:start", "first:end", "second:start", "second:end"]);
  });
});

describe("createMutex", () => {
  it("serializes all actions through a single lock", async () => {
    const withMutex = createMutex();
    const firstGate = createDeferred<void>();
    const secondStarted = createDeferred<void>();
    const events: string[] = [];

    const first = withMutex(async () => {
      events.push("first:start");
      await firstGate.promise;
      events.push("first:end");
    });

    await Promise.resolve();

    const second = withMutex(async () => {
      events.push("second:start");
      secondStarted.resolve();
      events.push("second:end");
    });

    await Promise.resolve();
    expect(events).toEqual(["first:start"]);

    firstGate.resolve();
    await first;
    await secondStarted.promise;
    await second;

    expect(events).toEqual(["first:start", "first:end", "second:start", "second:end"]);
  });
});
