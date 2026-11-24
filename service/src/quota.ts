import { DatabaseSync } from 'node:sqlite';

export function openQuota(path: string, perMinute: number, perDay: number) {
  const db = new DatabaseSync(path);
  db.exec(`PRAGMA busy_timeout = 3000;
    CREATE TABLE IF NOT EXISTS quota (
      key TEXT PRIMARY KEY,
      count INTEGER NOT NULL,
      expires INTEGER NOT NULL
    )`);
  const read = db.prepare('SELECT count FROM quota WHERE key = ?');
  const add = db.prepare('INSERT INTO quota VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET count = count + excluded.count');
  const prune = db.prepare('DELETE FROM quota WHERE expires <= ?');
  return {
    reserve(origin: string, now: Date, calls = 1) {
      const time = now.getTime();
      const minute = Math.floor(time / 60_000);
      const day = Math.floor(time / 86_400_000);
      const minuteKey = `minute:${minute}:${origin}`;
      const dayKey = `day:${day}`;
      db.exec('BEGIN IMMEDIATE');
      try {
        prune.run(time);
        const used = (key: string) => Number(read.get(key)?.count ?? 0);
        const allowed = used(minuteKey) < perMinute && used(dayKey) + calls <= perDay;
        if (allowed) {
          add.run(minuteKey, 1, (minute + 1) * 60_000);
          add.run(dayKey, calls, (day + 1) * 86_400_000);
        }
        db.exec('COMMIT');
        return allowed;
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },
    close: () => db.close(),
  };
}
