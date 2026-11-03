import {Router} from 'express';
import {randomUUID,createHmac} from 'node:crypto';
import {config,configuration} from './config.js';
import {query,transaction,audit} from './db.js';
import {randomToken,sha256,encryptToken,decryptToken,httpError} from './security.js';
import {requireAuth,requireRole,csrfGuard,limit} from './auth.js';
function metaConfigured(){if(!configuration().meta||!configuration().encryption)throw httpError(503,'Configure Meta App ID, secret, business login config ID, API version, callback and encryption key.','META_NOT_CONFIGURED');}
export async function graph(path,token,params={},options={}){
 const url=new URL(`https://graph.facebook.com/${config.meta.version}/${path}`);
 if(token)params={...params,appsecret_proof:createHmac('sha256',config.meta.appSecret).update(token).digest('hex')};
 for(const[k,v]of Object.entries(params))url.searchParams.set(k,typeof v==='object'?JSON.stringify(v):String(v));
 const response=await fetch(url,{headers:token?{Authorization:`Bearer ${token}`}:{},signal:options.signal?AbortSignal.any([options.signal,AbortSignal.timeout(18000)]):AbortSignal.timeout(18000)});
 const data=await response.json();
 if(!response.ok||data.error){
  const code=data.error?.code||response.status;
  const e=httpError(502,'Meta request failed. Check permissions, account access, API version or reconnect.','META_'+code);
  const retry=Number(response.headers.get('retry-after'));
  if(Number.isFinite(retry)&&retry>0)e.retryAfterSeconds=Math.min(86400,retry);
  if([4,17,32,613,80004,429].includes(Number(code)))e.retryAfterSeconds=Math.max(300,e.retryAfterSeconds||0);
  throw e;
 }
 return data;
}
async function tokenRequest(params){
 const response=await fetch(`https://graph.facebook.com/${config.meta.version}/oauth/access_token`,{method:'POST',body:new URLSearchParams(params),signal:AbortSignal.timeout(20000)});
 const data=await response.json();if(!response.ok||!data.access_token)throw httpError(502,'Meta token exchange failed. Check the app configuration.','META_TOKEN_EXCHANGE');return data;
}
export async function connectionToken(id){
 const [c]=await query('SELECT * FROM meta_connections WHERE id=?',[id]);if(!c)throw httpError(404,'Meta connection not found.');
 if(c.expires_at&&new Date(c.expires_at+'Z')<=new Date())throw httpError(409,'Reconnect Meta: this token expired.','META_TOKEN_EXPIRED');
 return decryptToken(c.token_cipher,config.tokenKey);
}
export function metaRoutes(){
 const r=Router();
 r.post('/connect',requireRole('super_admin'),csrfGuard,async(req,res)=>{
  metaConfigured();await limit('meta-connect:'+req.user.id,10,30);
  const state=randomToken();await query('DELETE FROM oauth_states WHERE expires_at<UTC_TIMESTAMP()');
  await query('INSERT INTO oauth_states (state_hash,user_id,session_hash,expires_at) VALUES (?,?,?,DATE_ADD(UTC_TIMESTAMP(),INTERVAL 10 MINUTE))',[sha256(state),req.user.id,req.user.token_hash]);
  const url=new URL(`https://www.facebook.com/${config.meta.version}/dialog/oauth`);
  for(const[k,v]of Object.entries({client_id:config.meta.appId,redirect_uri:config.meta.redirect,config_id:config.meta.configId,response_type:'code',override_default_response_type:'true',state}))url.searchParams.set(k,v);
  res.json({url:url.toString()});
 });
 r.get('/callback',requireRole('super_admin'),async(req,res)=>{
  try{
   metaConfigured();const state=String(req.query.state||'');if(!state||state.length>256)throw httpError(400,'Invalid OAuth state.','OAUTH_STATE');
   await transaction(async c=>{
    const [[saved]]=await c.execute('SELECT * FROM oauth_states WHERE state_hash=? AND expires_at>UTC_TIMESTAMP() FOR UPDATE',[sha256(state)]);
    if(!saved||Number(saved.user_id)!==Number(req.user.id)||saved.session_hash!==req.user.token_hash)throw httpError(400,'OAuth state does not match your session.','OAUTH_STATE');
    await c.execute('DELETE FROM oauth_states WHERE state_hash=?',[sha256(state)]);
   });
   if(req.query.error)throw httpError(400,'Permission was not granted.','META_PERMISSION_DENIED');
   const code=String(req.query.code||'');if(!code||code.length>5000)throw httpError(400,'Missing authorization code.','OAUTH_CODE');
   let result=await tokenRequest({client_id:config.meta.appId,client_secret:config.meta.appSecret,redirect_uri:config.meta.redirect,code});
   // Business login may issue different token types. Preserve a valid token if extension is unsupported.
   try{result=await tokenRequest({grant_type:'fb_exchange_token',client_id:config.meta.appId,client_secret:config.meta.appSecret,fb_exchange_token:result.access_token});}catch{}
   const me=await graph('me',result.access_token,{fields:'id'});
   const expires=Number(result.expires_in)>0?new Date(Date.now()+Number(result.expires_in)*1000).toISOString().slice(0,19).replace('T',' '):null;
   await query(`INSERT INTO meta_connections (id,meta_user_id,owner_id,token_cipher,expires_at) VALUES (?,?,?,?,?)
    ON DUPLICATE KEY UPDATE owner_id=VALUES(owner_id),token_cipher=VALUES(token_cipher),expires_at=VALUES(expires_at),connected_at=UTC_TIMESTAMP()`,[randomUUID(),String(me.id),req.user.id,encryptToken(result.access_token,config.tokenKey),expires]);
   await audit(req.user.id,'meta_connected');res.redirect('/?tab=accounts&meta=connected');
  }catch(e){console.error(JSON.stringify({event:'oauth_failed',code:e.code||'META_ERROR'}));res.redirect('/?tab=accounts&meta=failed');}
 });
 r.get('/connections',requireAuth,async(req,res)=>res.json({connections:await query('SELECT id,meta_user_id,expires_at,connected_at FROM meta_connections ORDER BY connected_at DESC')}));
 r.post('/discover',requireRole('super_admin'),csrfGuard,async(req,res)=>{
  metaConfigured();const id=String(req.body.connectionId||'');const token=await connectionToken(id);
  let after,found=0;const started=Date.now();
  do{
   const result=await graph('me/adaccounts',token,{fields:'id,name,currency,timezone_name,account_status',limit:100,...(after?{after}:{})});
   for(const a of result.data||[]){if(!/^act_[0-9]+$/.test(String(a.id)))continue;
    await query(`INSERT INTO ad_accounts (account_id,connection_id,name,currency,timezone_name,account_status) VALUES (?,?,?,?,?,?)
      ON DUPLICATE KEY UPDATE connection_id=VALUES(connection_id),name=VALUES(name),currency=VALUES(currency),timezone_name=VALUES(timezone_name),account_status=VALUES(account_status)`,[a.id,id,String(a.name||a.id).slice(0,255),a.currency||'UNKNOWN',a.timezone_name||'UTC',a.account_status??null]);found++;
   }
   after=result.paging?.next?result.paging?.cursors?.after:null;
   if(after&&(found>=500||Date.now()-started>45000))throw httpError(422,'Discovery reached its safety limit; narrow access or add cursor continuation.','META_DISCOVERY_LIMIT');
  }while(after);
  await audit(req.user.id,'accounts_discovered');res.json({found});
 });
 r.get('/accounts',requireAuth,async(req,res)=>res.json({accounts:await query('SELECT account_id,name,currency,timezone_name,slot,account_status,last_sync,last_error FROM ad_accounts ORDER BY slot IS NULL,slot,name')}));
 r.post('/mapping',requireRole('super_admin'),csrfGuard,async(req,res)=>{
  const rows=req.body.accounts;if(!Array.isArray(rows)||rows.length>12)throw httpError(400,'Choose no more than 12 accounts.');
  const ids=new Set(),slots=new Set();for(const x of rows){if(typeof x.account_id!=='string'||!Number.isInteger(x.slot)||x.slot<1||x.slot>12||ids.has(x.account_id)||slots.has(x.slot))throw httpError(400,'Account slots must be unique, between 1 and 12.');ids.add(x.account_id);slots.add(x.slot);}
  await transaction(async c=>{await c.execute('SELECT id FROM app_locks WHERE id=1 FOR UPDATE');await c.execute('UPDATE ad_accounts SET slot=NULL');for(const x of rows){const[result]=await c.execute('UPDATE ad_accounts SET slot=? WHERE account_id=?',[x.slot,x.account_id]);if(result.affectedRows!==1)throw httpError(400,'Unknown account.');}});
  await audit(req.user.id,'account_mapping_saved');res.json({ok:true});
 });
 r.delete('/connections/:id',requireRole('super_admin'),csrfGuard,async(req,res)=>{
  await query('DELETE FROM meta_connections WHERE id=?',[req.params.id]);await audit(req.user.id,'meta_disconnected');
  res.json({ok:true,message:'Local connection and current insights cache removed. Saved reports and drafts are retained. Revoke app access separately in Meta Business Integrations if needed.'});
 });
 return r;
}
