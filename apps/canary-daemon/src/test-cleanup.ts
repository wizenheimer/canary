import { rm } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";

type RemoveDirectoryDependencies = {
  rm?: typeof rm;
  sleep?: (milliseconds: number) => Promise<unknown>;
  maxRetries?: number;
  retryDelayMs?: (attempt: number) => number;
};

const TRANSIENT_RM_ERROR_CODES = new Set(["EBUSY", "ENOTEMPTY", "EPERM"]);
const DEFAULT_RETRY_DELAYS_MS = [50, 100, 250, 500, 1_000];

function shouldRetryDirectoryRemoval(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException | undefined)?.code;
  return typeof code === "string" && TRANSIENT_RM_ERROR_CODES.has(code);
}

export async function removeDirectoryWithRetries(
  directoryPath: string,
  dependencies: RemoveDirectoryDependencies = {}
): Promise<void> {
  const remove = dependencies.rm ?? rm;
  const sleep = dependencies.sleep ?? delay;
  const maxRetries = dependencies.maxRetries ?? DEFAULT_RETRY_DELAYS_MS.length;
  const retryDelayMs =
    dependencies.retryDelayMs ??
    ((attempt: number) =>
      DEFAULT_RETRY_DELAYS_MS[attempt] ?? DEFAULT_RETRY_DELAYS_MS.at(-1) ?? 1_000);

  for (let attempt = 0; ; attempt += 1) {
    try {
      await remove(directoryPath, {
        recursive: true,
        force: true,
      });
      return;
    } catch (error) {
      if (!shouldRetryDirectoryRemoval(error) || attempt >= maxRetries) {
        throw error;
      }

      await sleep(retryDelayMs(attempt));
    }
  }
}
