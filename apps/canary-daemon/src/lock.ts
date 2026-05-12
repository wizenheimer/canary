type AsyncAction<T> = () => Promise<T>;

export function createKeyedLock<K>() {
  const locks = new Map<K, Promise<void>>();

  return async function withLock<T>(key: K, action: AsyncAction<T>): Promise<T> {
    const previous = locks.get(key) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    const tail = previous.catch(() => undefined).then(() => current);
    locks.set(key, tail);

    await previous.catch(() => undefined);

    try {
      return await action();
    } finally {
      release();
      if (locks.get(key) === tail) {
        locks.delete(key);
      }
    }
  };
}

export function createMutex() {
  const withLock = createKeyedLock<symbol>();
  const lockKey = Symbol("mutex");

  return function withMutex<T>(action: AsyncAction<T>): Promise<T> {
    return withLock(lockKey, action);
  };
}
