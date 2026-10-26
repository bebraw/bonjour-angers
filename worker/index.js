/* The build prepends the shared model and embeds the immutable frontend assets. */
const MODEL = globalThis.AngersSyncModel;
const LIMIT = 2 * 1024 * 1024;
const json = (value,status=200) => new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
function account(request) {
  const id=request.headers.get('oai-authenticated-user-id');
  if(!id||id.length>200)return null;
  return {id,email:(request.headers.get('oai-authenticated-user-email')||'').slice(0,200)};
}
async function requestJSON(request) {
  if(!request.headers.get('content-type')?.toLowerCase().startsWith('application/json'))throw Object.assign(new Error('JSON required'),{status:415});
  if(Number(request.headers.get('content-length'))>LIMIT)throw Object.assign(new Error('Request too large'),{status:413});
  const reader=request.body?.getReader();if(!reader)throw Object.assign(new Error('JSON required'),{status:400});
  const chunks=[];let size=0;
  while(true){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>LIMIT){await reader.cancel();throw Object.assign(new Error('Request too large'),{status:413});}chunks.push(value);}
  const bytes=new Uint8Array(size);let position=0;for(const chunk of chunks){bytes.set(chunk,position);position+=chunk.byteLength;}
  try{return JSON.parse(new TextDecoder().decode(bytes));}catch{throw Object.assign(new Error('Invalid JSON'),{status:400});}
}
async function document(db,userId) {
  await db.prepare('INSERT OR IGNORE INTO sync_documents (user_id, revision, state, commit_token, updated_at) VALUES (?, 0, ?, ?, ?)').bind(userId,JSON.stringify(MODEL.emptyState()),'',Date.now()).run();
  const row=await db.prepare('SELECT revision, state FROM sync_documents WHERE user_id = ?').bind(userId).first();
  if(!row)throw new Error('Missing sync document');
  return {revision:row.revision,state:JSON.parse(row.state)};
}
async function commit(db,userId,operations) {
  for(let tries=0;tries<12;tries++) {
    const before=await document(db,userId);
    const ids=operations.map(op=>op.id);
    const known=ids.length?(await db.prepare('SELECT event_id FROM sync_events WHERE user_id = ? AND event_id IN ('+ids.map(()=>'?').join(',')+')').bind(userId,...ids).all()).results:[];
    const seen=new Set(known.map(row=>row.event_id));const pending=[];
    for(const op of operations)if(!seen.has(op.id)){seen.add(op.id);pending.push(op);}
    if(!pending.length)return document(db,userId);
    let next;
    try{next=MODEL.project(before.state,pending);}catch(error){throw Object.assign(new Error(error.message),{status:409,code:'DATA_CONFLICT'});}
    const token=crypto.randomUUID();
    // D1 batches are atomic. A unique commit token gates every ledger insert on CAS success.
    const statements=[db.prepare('UPDATE sync_documents SET revision = revision + 1, state = ?, commit_token = ?, updated_at = ? WHERE user_id = ? AND revision = ?').bind(JSON.stringify(next),token,Date.now(),userId,before.revision),
      ...pending.map(op=>db.prepare('INSERT OR IGNORE INTO sync_events (user_id, event_id, operation, created_at) SELECT ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM sync_documents WHERE user_id = ? AND commit_token = ?)').bind(userId,op.id,JSON.stringify(op),Date.now(),userId,token))];
    const results=await db.batch(statements);
    if(results[0].meta?.changes===1)return {revision:before.revision+1,state:next};
  }
  throw new Error('Sync is busy; retry');
}
async function api(request,env) {
  const url=new URL(request.url);
  if(url.pathname==='/api/health'){
    if(request.method!=='GET')return json({error:'Method not allowed'},405);
    // Site remains owner-private. Health reveals neither identities nor learning records.
    try{if(!env.DB)throw new Error('Missing binding');await env.DB.prepare('SELECT user_id FROM sync_documents LIMIT 1').all();return json({sync:true,database:'ready',schema:1});}catch{return json({sync:false,database:'unavailable'},503);}
  }
  if(url.pathname!=='/api/sync')return json({error:'Not found'},404);
  const user=account(request);if(!user)return json({error:'Sign in to sync',code:'SIGN_IN_REQUIRED'},401);
  if(!env.DB)return json({error:'Sync is not available yet',code:'SYNC_UNAVAILABLE'},503);
  const db=env.DB.withSession?env.DB.withSession('first-primary'):env.DB;
  if(!['GET','POST'].includes(request.method))return json({error:'Method not allowed'},405);
  if(request.method==='POST'){
    const origin=request.headers.get('origin');
    if((origin&&origin!==url.origin)||request.headers.get('x-angers-sync')!=='1')return json({error:'Invalid sync origin'},403);
    let body,operations;
    try{
      body=await requestJSON(request);
      // The client ID is a guard only; trusted dispatch identity selects the database owner.
      if(body.accountId!==user.id)return json({error:'The signed-in account changed',code:'ACCOUNT_MISMATCH',account:user},409);
      if(!Array.isArray(body.operations)||body.operations.length>50)throw Object.assign(new Error('Up to 50 operations are allowed'),{status:400});
      operations=body.operations.map(op=>MODEL.validateOperation(op));
    }catch(error){return json({error:error.status?error.message:'Invalid sync operation'},error.status||400);}
    try{
      const result=await commit(db,user.id,operations);
      return json({account:user,...result,acknowledged:operations.map(op=>op.id)});
    }catch(error){return json({error:error.status?error.message:'Sync unavailable. Changes remain queued on your device.',code:error.code||'SYNC_UNAVAILABLE'},error.status||503);}
  }
  try{return json({account:user,...await document(db,user.id)});}catch{return json({error:'Sync unavailable',code:'SYNC_UNAVAILABLE'},503);}
}
export default {
  async fetch(request,env,ctx){
    const path=new URL(request.url).pathname;
    if(path.startsWith('/api/'))return api(request,env);
    if(!['GET','HEAD'].includes(request.method))return new Response('Method not allowed',{status:405});
    const key=path==='/'||path==='/index.html'?'/index.html':path;
    const asset=ASSETS[key];if(!asset)return new Response('Not found',{status:404});
    const headers={'content-type':asset.type,'cache-control':'private, max-age=0, must-revalidate','x-content-type-options':'nosniff'};
    if(path==='/sw.js'){headers['cache-control']='no-store';headers['service-worker-allowed']='/';}
    if(request.method==='HEAD')return new Response(null,{headers});
    const bytes=Uint8Array.from(atob(asset.body),character=>character.charCodeAt(0));
    return new Response(bytes,{headers});
  }
};
