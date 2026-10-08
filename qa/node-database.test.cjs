/* eslint-disable @typescript-eslint/no-require-imports, @next/next/no-assign-module-variable */
const assert = require('node:assert/strict');
const { mkdtempSync, readFileSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');
const ts = require('typescript');

function loadTypeScriptModule(filePath) {
  const source = readFileSync(filePath, 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
    fileName: filePath,
  }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', compiled)(require, module, module.exports);
  return module.exports;
}

async function main() {
  const temporaryDirectory = mkdtempSync(join(tmpdir(), 'pulse-node-database-'));
  const previousDatabasePath = process.env.PULSE_DATABASE_PATH;
  let database;

  try {
    process.env.PULSE_DATABASE_PATH = join(temporaryDirectory, 'pulse.sqlite');
    delete globalThis.pulseNodeDatabase;

    const { getDatabase } = loadTypeScriptModule(resolve('db/node-database.ts'));
    database = getDatabase();

    await database.prepare('CREATE TABLE students (id TEXT PRIMARY KEY, name TEXT)').run();
    await database
      .prepare('INSERT INTO students (id, name) VALUES (?, ?)')
      .bind('12345', 'Test Student')
      .run();

    const student = await database
      .prepare('SELECT id, name FROM students WHERE id = ?')
      .bind('12345')
      .first();
    assert.deepEqual(student, { id: '12345', name: 'Test Student' });
    assert.equal(Object.getPrototypeOf(student), Object.prototype);

    const result = await database.prepare('SELECT id, name FROM students').all();
    assert.deepEqual(result.results, [{ id: '12345', name: 'Test Student' }]);
    assert.equal(Object.getPrototypeOf(result.results[0]), Object.prototype);

    console.log('Node database adapter checks passed.');
  } finally {
    database?.connection.close();
    delete globalThis.pulseNodeDatabase;
    if (previousDatabasePath === undefined) {
      delete process.env.PULSE_DATABASE_PATH;
    } else {
      process.env.PULSE_DATABASE_PATH = previousDatabasePath;
    }
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
