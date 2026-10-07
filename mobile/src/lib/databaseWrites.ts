/** SQLite contention is temporary; it must never trigger closing a live handle. */
export function isDatabaseBusy(error: unknown): boolean {
  return /database (?:table )?is locked|database is busy|SQLITE_(?:BUSY|LOCKED)/i.test(
    String(error instanceof Error ? error.message : error),
  );
}
export class DatabaseWriteQueue {
  private tail: Promise<unknown> = Promise.resolve();
  pending = 0;
  run<T>(work: () => Promise<T>): Promise<T> {
    this.pending++;
    const result = this.tail.then(async () => {
      for (let attempt = 0; ; attempt++) {
        try {
          return await work();
        } catch (error) {
          if (!isDatabaseBusy(error) || attempt >= 3) throw error;
          await new Promise((resolve) =>
            setTimeout(resolve, 80 * 2 ** attempt),
          );
        }
      }
    });
    this.tail = result
      .catch(() => {})
      .finally(() => {
        this.pending--;
      });
    return result;
  }
}
export async function databaseTransaction<T>(
  db: { execAsync: (sql: string) => Promise<void> },
  work: () => Promise<T>,
): Promise<T> {
  await db.execAsync("BEGIN IMMEDIATE;");
  try {
    const result = await work();
    await db.execAsync("COMMIT;");
    return result;
  } catch (error) {
    try {
      await db.execAsync("ROLLBACK;");
    } catch {
      /* Preserve the initiating error. */
    }
    throw error;
  }
}
