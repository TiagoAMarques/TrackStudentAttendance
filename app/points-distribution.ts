export type PointsBin={from:number;to:number;count:number};
export type PointsDistribution={bins:PointsBin[];available:boolean};

// Only aggregate counts leave the server. Preserve empty categories so gaps
// remain visible and every bar represents the same interval width.
export function pointsDistribution(scores:number[]):PointsDistribution{
  const hidden={bins:[],available:false};
  if(!scores.length||scores.some(score=>!Number.isSafeInteger(score)))return hidden;
  let min=Infinity,max=-Infinity;
  for(const score of scores){min=Math.min(min,score);max=Math.max(max,score)}
  const span=max-min+1;
  if(!Number.isSafeInteger(span))return hidden;
  let width=1;
  if(span>11){
    // Square-root rule, bounded for readability, rounded to simple intervals.
    const target=Math.max(2,Math.min(12,Math.ceil(Math.sqrt(scores.length))));
    width=niceWidth(span/target);
    while(Math.floor(max/width)-Math.floor(min/width)+1>12)width=niceWidth(width+1);
  }
  const start=width===1?(min>=0&&max<=10?0:min):Math.floor(min/width)*width;
  const length=Math.floor((max-start)/width)+1;
  const bins:PointsBin[]=Array.from({length},(_,i)=>({from:start+i*width,to:Math.min(Number.MAX_SAFE_INTEGER,start+(i+1)*width-1),count:0}));
  for(const score of scores)bins[Math.floor((score-start)/width)].count++;
  return {bins,available:true};
}
function niceWidth(value:number){
  const scale=10**Math.floor(Math.log10(Math.max(1,value)));
  return [1,2,5,10].map(step=>step*scale).find(width=>width>=value)!;
}
