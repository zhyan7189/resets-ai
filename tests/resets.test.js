import test from "node:test";
import assert from "node:assert/strict";
import {onRequestGet} from "../functions/api/resets.js";
import {onRequestGet as onRequestResetRequestsGet} from "../functions/api/reset-requests.js";
test("代理公开重置记录并过滤其他字段",async()=>{
  const original=globalThis.fetch;
  globalThis.fetch=async()=>new Response(JSON.stringify({events:[{tweet_id:"1",announced_at:"2026-09-12T08:09:00Z"}],private_field:"omit"}),{status:200});
  try{const response=await onRequestGet();assert.equal(response.status,200);assert.deepEqual(await response.json(),{events:[{tweet_id:"1",announced_at:"2026-09-12T08:09:00Z"}]});assert.match(response.headers.get("cache-control"),/max-age=300/)}finally{globalThis.fetch=original}
});
test("上游格式异常时返回明确错误",async()=>{
  const original=globalThis.fetch;
  globalThis.fetch=async()=>new Response(JSON.stringify({changed:true}),{status:200});
  try{const response=await onRequestGet();assert.equal(response.status,503);assert.deepEqual(await response.json(),{error:"upstream_unavailable",events:[]})}finally{globalThis.fetch=original}
});
test("只读代理原站求重置互动次数",async()=>{
  const original=globalThis.fetch;
  globalThis.fetch=async()=>new Response(JSON.stringify({cycle_id:"2098685367058612394",since:"2026-09-12T08:09:17.000Z",count:1202037,private_field:"omit"}),{status:200});
  try{
    const response=await onRequestResetRequestsGet();
    assert.equal(response.status,200);
    assert.deepEqual(await response.json(),{cycle_id:"2098685367058612394",since:"2026-09-12T08:09:17.000Z",count:1202037});
    assert.equal(response.headers.get("cache-control"),"no-store");
  }finally{globalThis.fetch=original}
});
