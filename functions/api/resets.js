const UPSTREAM="https://codex-resets.com/api/resets";
export async function onRequestGet(){
  try{
    const response=await fetch(UPSTREAM,{headers:{"accept":"application/json"},cf:{cacheTtl:900,cacheEverything:true}});
    if(!response.ok)throw new Error("upstream_status_"+response.status);
    const data=await response.json();
    if(!data||!Array.isArray(data.events))throw new Error("upstream_schema");
    return new Response(JSON.stringify({events:data.events}),{headers:{"content-type":"application/json; charset=utf-8","cache-control":"public, max-age=300, s-maxage=900","x-content-type-options":"nosniff"}});
  }catch{
    return new Response(JSON.stringify({error:"upstream_unavailable",events:[]}),{status:503,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}});
  }
}