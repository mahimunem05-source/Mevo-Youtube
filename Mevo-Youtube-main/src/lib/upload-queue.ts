/**
 * Minimal concurrency-limited task queue.
 *
 * Batch uploads use this so large audio files are never all pushed to
 * Storage at the same time (browser freeze / rate limit protection).
 */
export async function runWithConcurrency<T>(
  tasks: Array<() => Promise<T>>,
  limit = 2,
): Promise<Array<PromiseSettledResult<T>>> {
  const safeLimit = Math.max(1, Math.min(6, Math.trunc(limit) || 1));
  const results: Array<PromiseSettledResult<T>> = new Array(tasks.length);

  let cursor = 0;

  async function worker(): Promise<void> {
    for (;;) {
      const index = cursor;
      cursor += 1;

      if (index >= tasks.length) {
        return;
      }

      try {
        const value = await tasks[index]!();
        results[index] = { status: "fulfilled", value };
      } catch (reason) {
        results[index] = { status: "rejected", reason };
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(safeLimit, tasks.length) }, () => worker()));

  return results;
}
