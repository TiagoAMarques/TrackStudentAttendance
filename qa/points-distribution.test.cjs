const fs=require('fs'),ts=require('typescript'),assert=require('node:assert/strict');
const m={exports:{}};new Function('exports',ts.transpileModule(fs.readFileSync('app/points-distribution.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(m.exports);
const {pointsDistribution:d}=m.exports;
assert.deepEqual(d([]),{bins:[],available:false});
assert.equal(d([NaN,1]).available,false);
assert.equal(d([1.5]).available,false);
assert.deepEqual(d([0]).bins,[{from:0,to:0,count:1}]);
assert.deepEqual(d([0,1,1,4]).bins,[0,1,2,3,4].map((n)=>({from:n,to:n,count:[1,2,0,0,1][n]})));
assert.equal(d([0,10]).bins.length,11);
assert.ok(d([0,10]).bins.every(b=>b.from===b.to));
assert.deepEqual(d([-2,0,2]).bins.map(b=>b.count),[1,0,1,0,1]);
assert.equal(d(Array(20).fill(100)).bins[0].count,20);
const sparse=d([0,100]);const dense=d(Array.from({length:1000},(_,i)=>i%101));
assert.ok(dense.bins.length>sparse.bins.length,'Larger cohorts get finer histograms for the same range');
for(const scores of [[0,11],[-2,12],[0,10000],Array.from({length:1000},(_,i)=>i-500)]){
 const bins=d(scores).bins;assert.ok(bins.length<=12);assert.equal(bins.reduce((n,b)=>n+b.count,0),scores.length);
 for(let i=1;i<bins.length;i++)assert.equal(bins[i].from,bins[i-1].to+1);
 for(const bin of bins)assert.equal(bin.count,scores.filter(s=>s>=bin.from&&s<=bin.to).length);
}
console.log('PASS: exact integer scores, zero-count gaps, negatives, uniform scores, adaptive sample-size bins and count conservation.');
