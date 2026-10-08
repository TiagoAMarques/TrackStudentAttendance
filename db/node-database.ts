import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { DatabaseSync, type StatementResultingChanges } from 'node:sqlite';

type BoundValue = string | number | bigint | null | Uint8Array;
type RunResult = { success: true; meta: { changes: number; last_row_id: number | bigint } };

function toPlainRow<T>(row: Record<string, unknown>): T {
  // node:sqlite returns null-prototype rows, which cannot cross a Next.js
  // Server Component boundary. Copy each row into a normal plain object.
  return { ...row } as T;
}

class NodePreparedStatement {
  constructor(private readonly connection: DatabaseSync, readonly sql: string, readonly values: BoundValue[] = []) {}
  bind(...values: unknown[]) { return new NodePreparedStatement(this.connection, this.sql, values as BoundValue[]); }
  async first<T>(): Promise<T | null> {
    const row = this.connection.prepare(this.sql).get(...this.values) as Record<string, unknown> | undefined;
    return row === undefined ? null : toPlainRow<T>(row);
  }
  async all<T>(): Promise<{ success: true; results: T[]; meta: Record<string, never> }> {
    const rows = this.connection.prepare(this.sql).all(...this.values) as Record<string, unknown>[];
    return { success: true, results: rows.map(row => toPlainRow<T>(row)), meta: {} };
  }
  async run(): Promise<RunResult> { return toRunResult(this.connection.prepare(this.sql).run(...this.values)); }
  runSync(): RunResult { return toRunResult(this.connection.prepare(this.sql).run(...this.values)); }
}

class NodeDatabase {
  constructor(private readonly connection: DatabaseSync) {}
  prepare(sql: string) { return new NodePreparedStatement(this.connection, sql); }
  async batch(statements: NodePreparedStatement[]) {
    this.connection.exec('BEGIN IMMEDIATE');
    try {
      const results = statements.map(statement => statement.runSync());
      this.connection.exec('COMMIT');
      return results;
    } catch (error) {
      this.connection.exec('ROLLBACK');
      throw error;
    }
  }
}

function toRunResult(result: StatementResultingChanges): RunResult {
  return { success: true, meta: { changes: Number(result.changes), last_row_id: result.lastInsertRowid } };
}

declare global { var pulseNodeDatabase: NodeDatabase | undefined; }

export function getDatabase(): D1Database {
  if (globalThis.pulseNodeDatabase) return globalThis.pulseNodeDatabase as unknown as D1Database;
  const configuredPath = process.env.PULSE_DATABASE_PATH?.trim();
  if (process.env.NODE_ENV === 'production' && !configuredPath) throw new Error('PULSE_DATABASE_PATH must be set for the university production server.');
  // The production database is runtime state outside the release; it must never be traced into the standalone bundle.
  const databasePath = resolve(/* turbopackIgnore: true */ configuredPath || '.data/pulse.sqlite');
  mkdirSync(dirname(databasePath), { recursive: true, mode: 0o750 });
  const connection = new DatabaseSync(databasePath);
  connection.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;');
  globalThis.pulseNodeDatabase = new NodeDatabase(connection);
  return globalThis.pulseNodeDatabase as unknown as D1Database;
}
