const UPSTREAM="https://codex-resets.com/api/resets";

function publicScheduledReset(value){
  if(!value||typeof value!=="object")return null;
  const scheduled={};
  for(const key of ["tweet_id","announced_at","scheduled_for","reset_type","tweet_url","display_text"]){
    if(typeof value[key]==="string")scheduled[key]=value[key];
  }
  return typeof scheduled.scheduled_for==="string"?scheduled:null;
}

export async function onRequestGet(){
  try{
    const response=await fetch(UPSTREAM,{headers:{"accept":"application/json"},cf:{cacheTtl:60,cacheEverything:true}});
    if(!response.ok)throw new Error("upstream_status_"+response.status);
    const data=await response.json();
    if(!data||!Array.isArray(data.events))throw new Error("upstream_schema");
    return new Response(JSON.stringify({scheduled:publicScheduledReset(data.scheduled),events:data.events}),{headers:{"content-type":"application/json; charset=utf-8","cache-control":"public, max-age=30, s-maxage=60","x-content-type-options":"nosniff"}});
  }catch{
    return new Response(JSON.stringify({error:"upstream_unavailable",scheduled:null,events:[]}),{status:503,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}});
  }
}
