import {env} from 'cloudflare:workers';
export async function GET(request:Request){
  const query=new URL(request.url).searchParams,id=query.get('id')?.trim(),code=query.get('code')?.trim();
  if((!id&&!code)||(id&&(!/^[\w-]+$/.test(id)||id.length>100))||(code&&code.length>100))return Response.json({error:'Invalid course'},{status:400});
  try{
    const rows=await env.DB.prepare(`SELECT id,code,name FROM courses WHERE archived_at IS NULL AND ${id?'id=?':'lower(code)=lower(?)'} LIMIT 2`).bind(id||code).all<{id:string;code:string;name:string}>();
    if(rows.results.length!==1)return Response.json({error:'Use the exact course league link'},{status:404});
    return Response.json(rows.results[0],{headers:{'Cache-Control':'no-store'}});
  }catch{return Response.json({error:'Course unavailable'},{status:503})}
}
