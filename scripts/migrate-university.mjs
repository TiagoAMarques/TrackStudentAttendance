import { mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const configuredPath = process.env.PULSE_DATABASE_PATH?.trim();
if (!configuredPath) throw new Error('Set PULSE_DATABASE_PATH before running university migrations.');
const databasePath = resolve(configuredPath);
mkdirSync(dirname(databasePath), { recursive: true, mode: 0o750 });
const database = new DatabaseSync(databasePath);
database.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
CREATE TABLE IF NOT EXISTS _pulse_migrations (name TEXT PRIMARY KEY NOT NULL, applied_at INTEGER NOT NULL);`);
const applied = new Set(database.prepare('SELECT name FROM _pulse_migrations').all().map(row => row.name));
const migrations = readdirSync(resolve('drizzle')).filter(name => /^\d+.*\.sql$/.test(name)).sort();
for (const name of migrations) {
  if (applied.has(name)) continue;
  const sql = readFileSync(resolve('drizzle', name), 'utf8').replaceAll('--> statement-breakpoint', '');
  database.exec('BEGIN IMMEDIATE');
  try {
    database.exec(sql);
    database.prepare('INSERT INTO _pulse_migrations(name,applied_at) VALUES (?,?)').run(name, Math.floor(Date.now() / 1000));
    database.exec('COMMIT');
    console.log(`Applied ${name}`);
  } catch (error) { database.exec('ROLLBACK'); throw error; }
}
database.close();
console.log(`University database is current: ${databasePath}`);
