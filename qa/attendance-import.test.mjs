import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

const js=ts.transpileModule(fs.readFileSync('app/attendance-import.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {parseAttendanceImport,validateAttendanceImport}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));

const rows=parseAttendanceImport([
 ['Class ID','ID number'],
 ['T01','000123'],
 ['T01','FC456'],
],'T01');
assert.deepEqual(rows,[{classId:'T01',studentNumber:'000123'},{classId:'T01',studentNumber:'fc456'}]);
assert.throws(()=>parseAttendanceImport([['Class ID'],['T01']],'T01'),/Class ID and ID number/);
assert.throws(()=>parseAttendanceImport([['Class ID','ID number'],['T02','fc1']],'T01'),/Class ID must be T01/);
assert.throws(()=>parseAttendanceImport([['Class ID','ID number'],['T01','fc1'],['T01','FC1']],'T01'),/Duplicate ID number/);
assert.throws(()=>validateAttendanceImport([],'T01'),/1 and 500/);
console.log('attendance CSV parser tests passed');
