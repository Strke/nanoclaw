import type Database from 'better-sqlite3';
import type { Migration } from './index.js';

export const migration016: Migration = {
  version: 16,
  name: 'metrics',
  up(db: Database.Database) {
    db.exec(`
      CREATE TABLE metrics (
        name       TEXT PRIMARY KEY,
        kind       TEXT NOT NULL,           -- 'counter' | 'timing'
        value      REAL NOT NULL,           -- counter value, or total ms for timings
        count      INTEGER NOT NULL DEFAULT 1,
        max_value  REAL NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL
      );
    `);
  },
};
