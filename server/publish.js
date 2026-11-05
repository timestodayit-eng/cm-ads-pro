import {Router} from 'express';
import {randomUUID} from 'node:crypto';
import {query,transaction,parseJSON,audit} from './db.js';
import {httpError} from './security.js';
import {requireAuth,requireRole,csrfGuard,limit} from './auth.js';
import {connectionToken,graph} from './meta.js';
import {metaWrite,uploadMetaMedia,isVideoReady,getMetaVideoThumbnail,metaSetStatus} from './meta-write.js';
import {previewPublishing,normalizePageMap,metaCampaignForm,metaAdsetForm,metaCreativeForm} from '../shared/publishing.js';
import {enqueue} from './jobs.js';
import {configuration,config} from './config.js';
const idRE=/^[a-f0-9-]{36}$/i;
const time=ms=>new Date(ms).toISOString().slice(0,19).replace('T',' ');
const err=(code,msg,status=409)=>httpError(status,msg,code);
function safeId(x){if(!idRE.test(String(x||'')))throw err('INVALID_REFERENCE','Invalid request ID.',400);return x;}
async function draftForPublish(id){
 const [d]=await query('SELECT * FROM campaign_drafts WHERE id=?',[safeId(id)]);
 if(!d)throw err('DRAFT_NOT_FOUND','Saved campaign draft not found.',404);
 const input=parseJSON(d.config_json)?.input;
 if(!input)throw err('DRAFT_FORMAT','Saved draft cannot be parsed.');
 let result;try{result=previewPublishing(input);}catch(e){throw err('PUBLISH_PREFLIGHT',e.message,422);}
 const assetIds=[...new Set(result.plan.contents.map(x=>x.mediaAssetId))];
 for(const assetId of assetIds){const [a]=await query('SELECT id,status,bucket_name FROM media_assets WHERE id=?',[assetId]);if(!a||a.status!=='ready')throw err('MEDIA_NOT_READY','One or more uploaded content items are not ready.',422);}
 for(const allocation of result.plan.allocations){
  const [a]=await query('SELECT account_id,connection_id,currency,account_status FROM ad_accounts WHERE account_id=? AND slot IS NOT NULL',[allocation.accountId]);
  if(!a||a.currency!==result.plan.currency)throw err('ACCOUNT_MISMATCH','Selected account is unmapped or currency does not match.',422);
  if(a.account_status!==null&&Number(a.account_status)!==1)throw err('ACCOUNT_NOT_ACTIVE',`Ad account ${allocation.label} is not active.`,422);
 }
 // Country targeting is now validated by normalizeAdvanced() and Meta will
 // check market eligibility. No untrusted arbitrary targeting objects are forwarded.
 return{...result,input,draft:d};
}
async function validateRequest(body){
 if(!configuration().meta||!configuration().encryption||!configuration().storage)throw err('PUBLISH_NOT_CONFIGURED','Configure Meta OAuth and R2 storage before publishing.',503);
 const p=await draftForPublish(body.draftId);let pageIds;try{pageIds=normalizePageMap(body.pageIds,p.plan.allocations);}catch(e){throw err('PAGE_ID_REQUIRED',e.message,422);}
 const max=Number(body.maxCombinedDailyMinor);
 if(!Number.isSafeInteger(max)||max<p.plan.totals.dailyMinor||max<=0||max>1_000_000_000)throw err('DAILY_CAP_REQUIRED','Explicit combined daily budget approval is missing or below the plan total.',422);
 return{...p,pageIds};
}
async function batchData(id){
 const [b]=await query('SELECT * FROM publish_batches WHERE id=?',[safeId(id)]);
 if(!b)throw err('BATCH_NOT_FOUND','Publishing batch not found.',404);
 const runs=await query('SELECT * FROM publish_account_runs WHERE batch_id=? ORDER BY account_id',[id]);
 const items=await query('SELECT i.* FROM publish_items i JOIN publish_account_runs r ON r.id=i.run_id WHERE r.batch_id=? ORDER BY r.account_id,i.content_index',[id]);
 return{batch:{id:b.id,draftId:b.draft_id,status:b.status,currency:b.currency,combinedDailyMinor:Number(b.combined_daily_minor),createdAt:b.created_at},runs,items};
}
async function updateBatch(batchId){
 const runs=await query('SELECT status FROM publish_account_runs WHERE batch_id=?',[batchId]);
 if(!runs.length)return;
 let status='building';
 if(runs.every(r=>r.status==='ready_for_review'))status='ready_for_review';
 else if(runs.every(r=>r.status==='active'))status='active';
 else if(runs.every(r=>r.status==='paused'))status='paused';
 else if(runs.every(r=>['needs_review','failed'].includes(r.status)))status='failed';
 else if(runs.some(r=>['needs_review','failed'].includes(r.status)))status='partial';
 else if(runs.some(r=>r.status==='activating'))status='activation_queued';
 await query('UPDATE publish_batches SET status=? WHERE id=?',[status,batchId]);
}
export async function publishingSchemaReady(){
 try{await query('SELECT id FROM publish_batches LIMIT 1');await query('SELECT id FROM publish_account_runs LIMIT 1');await query('SELECT id FROM publish_items LIMIT 1');return true;}
 catch(e){if(['ER_NO_SUCH_TABLE','ER_BAD_FIELD_ERROR'].includes(e.code))return false;throw e;}
}
export function publishRoutes(){
 const r=Router();r.use(requireAuth);
 // Read-only diagnostics. Do not expose tokens, app IDs, secret values, or remote account details.
 // This route must remain accessible when the publishing migration is missing.
 r.get('/readiness',async(req,res)=>{
  const schemaReady=await publishingSchemaReady();
  const conf=configuration();
  const [connected]=await query('SELECT COUNT(*) AS total FROM meta_connections');
  const [mapped]=await query('SELECT COUNT(*) AS total FROM ad_accounts WHERE slot IS NOT NULL');
  const issues=[];
  if(!schemaReady)issues.push({code:'PUBLISH_SCHEMA_REQUIRED',message:'Publishing tables are missing. Back up your database, then import sql/004-publishing.sql (only if it was not already imported).'});
  if(!conf.meta)issues.push({code:'META_NOT_CONFIGURED',message:'Meta OAuth settings do not match the current APP_ORIGIN or are incomplete.'});
  if(!conf.encryption)issues.push({code:'ENCRYPTION_NOT_CONFIGURED',message:'TOKEN_ENCRYPTION_KEY is not configured correctly.'});
  if(!conf.storage)issues.push({code:'R2_NOT_CONFIGURED',message:'Cloudflare R2 storage settings are incomplete.'});
  if(!Number(connected?.total||0))issues.push({code:'META_NOT_CONNECTED',message:'Connect Facebook Login for Business in Meta Accounts.'});
  if(!Number(mapped?.total||0))issues.push({code:'ACCOUNTS_NOT_MAPPED',message:'Select and map Meta ad accounts in Meta Accounts.'});
  if(!config.publishEnabled)issues.push({code:'PUBLISH_DISABLED',message:'PUBLISH_ENABLED is false in your Hostinger environment. Only enable after database, Meta and a single-account paused test are ready.'});
  return res.json({schemaReady,metaConfigured:conf.meta,encryptionConfigured:conf.encryption,storageConfigured:conf.storage,connectionPresent:Number(connected?.total||0)>0,mappedAccounts:Number(mapped?.total||0),pausedCreationEnabled:config.publishEnabled,activationEnabled:config.activationEnabled,schedulerSecretConfigured:conf.scheduler||!!(config.jobSecret&&config.jobSecret.length>=32),issues,notice:'Configuration checks are local. They cannot verify Meta publishing permission, Page eligibility, or ad approval. Activation requires a second human approval.'});
 });
 r.use(async(req,res,next)=>{if(!await publishingSchemaReady())throw err('PUBLISH_SCHEMA_REQUIRED','Import sql/004-publishing.sql on your existing v0.3 database, then restart.',503);next();});
 r.get('/batches',async(req,res)=>{
  const rows=await query('SELECT id,draft_id,status,currency,combined_daily_minor,created_at FROM publish_batches ORDER BY created_at DESC LIMIT 60');
  res.json({batches:rows.map(b=>({...b,combined_daily_minor:Number(b.combined_daily_minor)}))});
 });
 r.get('/batches/:id',async(req,res)=>res.json(await batchData(req.params.id)));
 r.post('/preview',requireRole('super_admin','manager'),csrfGuard,async(req,res)=>{
  const check=await validateRequest(req.body);res.json({plan:check.plan,warnings:check.warnings,pageIds:check.pageIds,expected:check.expected,requiresApproval:true,willCreatePaused:true});
 });
 r.post('/launch',requireRole('super_admin','manager'),csrfGuard,async(req,res)=>{
  await limit('publish-approve:'+req.user.id,12,30);
  if(!config.publishEnabled)throw err('PUBLISH_DISABLED','Set PUBLISH_ENABLED=true only after testing Meta permissions and the publishing workflow.',503);
  if(req.body.confirm!=='CREATE PAUSED ADS')throw err('PUBLISH_CONFIRM_REQUIRED','Type CREATE PAUSED ADS to approve creating paused Meta campaigns.',422);
  if(!idRE.test(String(req.body.requestKey||'')))throw err('REQUEST_KEY_REQUIRED','A unique request key is required.',422);
  const {plan,pageIds,expected}=await validateRequest(req.body);let batchId=randomUUID(),created=false;
  await transaction(async c=>{
   await c.execute('SELECT id FROM app_locks WHERE id=1 FOR UPDATE');
   const [[existing]]=await c.execute('SELECT id,draft_id FROM publish_batches WHERE request_key=?',[req.body.requestKey]);
   if(existing){if(existing.draft_id!==req.body.draftId)throw err('REQUEST_KEY_CONFLICT','A request key cannot be reused for another draft.');batchId=existing.id;return;}
   await c.execute('INSERT INTO publish_batches (id,draft_id,request_key,approved_by,config_json,currency,combined_daily_minor) VALUES (?,?,?,?,?,?,?)',
    [batchId,req.body.draftId,req.body.requestKey,req.user.id,JSON.stringify({plan,pageIds}),plan.currency,expected.combinedDailyMinor]);
   for(const allocation of plan.allocations){const runId=randomUUID();await c.execute('INSERT INTO publish_account_runs (id,batch_id,account_id,page_id) VALUES (?,?,?,?)',[runId,batchId,allocation.accountId,pageIds[allocation.accountId]]);
    for(let i=0;i<plan.contents.length;i++)await c.execute('INSERT INTO publish_items (id,run_id,content_index,media_asset_id) VALUES (?,?,?,?)',[randomUUID(),runId,i,plan.contents[i].mediaAssetId]);
   }
   created=true;
  });
  if(created)await audit(req.user.id,'publish_paused_approved',batchId);
  await schedulePublishBatch(batchId);
  res.status(created?202:200).json({...await batchData(batchId),created,notice:'Creation is asynchronous. All Meta objects will be PAUSED until separate activation approval.'});
 });
 r.post('/batches/:id/activate',requireRole('super_admin'),csrfGuard,async(req,res)=>{
  if(!config.activationEnabled)throw err('ACTIVATION_DISABLED','Set ACTIVATION_ENABLED=true only after a verified paused campaign test.',503);
  if(req.body.confirm!=='ACTIVATE ADS')throw err('ACTIVATION_APPROVAL_REQUIRED','Type ACTIVATE ADS to approve potential advertising spend.',422);
  const batch=await batchData(req.params.id);
  const expected=Number(req.body.maxCombinedDailyMinor);
  if(!Number.isSafeInteger(expected)||expected<batch.batch.combinedDailyMinor)throw err('DAILY_CAP_REQUIRED','Confirm the full maximum daily budget before activation.',422);
  if(!batch.runs.length||batch.runs.some(x=>x.status!=='ready_for_review'))throw err('ADS_NOT_READY','Every account must be ready for review before group activation. Resolve failures or use a separate draft.',422);
  await transaction(async c=>{
   await c.execute('SELECT id FROM app_locks WHERE id=1 FOR UPDATE');
   const [[fresh]]=await c.execute('SELECT status FROM publish_batches WHERE id=? FOR UPDATE',[batch.batch.id]);
   if(fresh.status!=='ready_for_review')throw err('ACTIVATION_STATE','Batch status changed; reload before activating.');
   await c.execute("UPDATE publish_account_runs SET status='activating',activation_stage='adset',activation_index=0 WHERE batch_id=?",[batch.batch.id]);
   await c.execute("UPDATE publish_batches SET status='activation_queued' WHERE id=?",[batch.batch.id]);
  });
  await audit(req.user.id,'activation_approved',batch.batch.id);
  for(const run of batch.runs)await enqueue('activate_step',{runId:run.id},`activate:${run.id}:${randomUUID()}`);
  res.status(202).json({ok:true,message:'Activation was explicitly authorized. Accounts are queued; check each account result.'});
 });
 r.post('/batches/:id/pause',requireRole('super_admin','manager'),csrfGuard,async(req,res)=>{
  const batch=await batchData(req.params.id);if(req.body.confirm!=='PAUSE ALL')throw err('PAUSE_CONFIRM_REQUIRED','Type PAUSE ALL to pause the campaigns.',422);
  const target=batch.runs.filter(x=>x.campaign_id&&['active','activating','ready_for_review'].includes(x.status));
  for(const run of target){await query("UPDATE publish_account_runs SET status='pausing' WHERE id=?",[run.id]);await enqueue('pause_step',{runId:run.id},`pause:${run.id}:${randomUUID()}`);}
  await audit(req.user.id,'pause_requested',batch.batch.id);
  res.status(202).json({queued:target.length,message:'Pause requested. Campaigns may keep spending until Meta processes their pause step; process queue promptly.'});
 });
 // Targeted recovery only: Meta explicitly rejected ad creative creation with
 // subcode 1443226 (missing video thumbnail). Never retry ambiguous network writes.
 r.post('/batches/:id/recover-thumbnail',requireRole('super_admin'),csrfGuard,async(req,res)=>{
  const batchId=safeId(req.params.id),runId=safeId(req.body.runId);
  if(req.body.confirm!=='RETRY VERIFIED THUMBNAIL')throw err('REMOTE_VERIFICATION_REQUIRED','First verify that no creative or ad was created remotely, then type RETRY VERIFIED THUMBNAIL.',422);
  await transaction(async c=>{
   await c.execute('SELECT id FROM app_locks WHERE id=1 FOR UPDATE');
   const [[run]]=await c.execute('SELECT * FROM publish_account_runs WHERE id=? AND batch_id=? FOR UPDATE',[runId,batchId]);
   if(!run||run.status!=='needs_review'||run.stage!=='creative'||run.inflight_stage!=='create_creative'||run.error_code!=='META_WRITE_100'||!String(run.error_message||'').includes('1443226'))
    throw err('RECOVERY_NOT_ELIGIBLE','This account cannot be resumed by the video thumbnail recovery. Review Meta resources first.',422);
   const [[item]]=await c.execute('SELECT adset_id,creative_id,ad_id FROM publish_items WHERE run_id=? AND content_index=? FOR UPDATE',[runId,run.content_index]);
   if(!item?.adset_id||item.creative_id||item.ad_id||!run.campaign_id)
    throw err('RECOVERY_REMOTE_STATE','Expected an existing campaign and ad set but no saved creative/ad. Review the Meta IDs.',422);
   const [updated]=await c.execute("UPDATE publish_account_runs SET status='building',inflight=0,inflight_stage=NULL,error_code=NULL,error_message=NULL WHERE id=? AND status='needs_review'",[runId]);
   if(updated.affectedRows!==1)throw err('RECOVERY_CONFLICT','Recovery state changed; refresh and review.',409);
  });
  const [existing]=await query("SELECT id FROM jobs WHERE kind='publish_step' AND status IN ('queued','running') AND JSON_UNQUOTE(JSON_EXTRACT(payload_json,'$.runId'))=? LIMIT 1",[runId]);
  if(!existing)await enqueue('publish_step',{runId},`thumbnail-retry:${runId}:${randomUUID()}`);
  await audit(req.user.id,'thumbnail_recovery_approved',runId);
  await updateBatch(batchId);
  res.status(202).json({ok:true,message:'Existing campaign and ad set preserved. Only creative creation is scheduled for retry after manual verification.'});
 });
 r.post('/batches/:id/process',requireRole('super_admin','manager'),csrfGuard,async(req,res)=>{
  const batch=await batchData(req.params.id);
  if(!batch.runs.length)throw err('BATCH_EMPTY','No accounts in this batch.');
  const {runBatch}=await import('./jobs.js');res.json(await runBatch({source:'manual',maxJobs:12,budgetMs:20000,concurrency:2}));
 });
 return r;
}
export async function schedulePublishBatch(batchId){
 const runs=await query("SELECT id,status FROM publish_account_runs WHERE batch_id=? AND status IN ('queued','building','waiting_media')",[batchId]);
 for(const run of runs){
  const [existing]=await query("SELECT id FROM jobs WHERE kind='publish_step' AND status IN ('queued','running') AND JSON_UNQUOTE(JSON_EXTRACT(payload_json,'$.runId'))=? LIMIT 1",[run.id]);
  if(!existing)await enqueue('publish_step',{runId:run.id},`publish:${run.id}:${randomUUID()}`);
 }
}
export async function recoverPublishQueues(){
 const runs=await query("SELECT id,batch_id FROM publish_account_runs WHERE status IN ('queued','building','waiting_media') AND inflight=0 LIMIT 50");
 for(const run of runs){const [exist]=await query("SELECT id FROM jobs WHERE kind='publish_step' AND status IN ('queued','running') AND JSON_UNQUOTE(JSON_EXTRACT(payload_json,'$.runId'))=? LIMIT 1",[run.id]);if(!exist)await enqueue('publish_step',{runId:run.id},`recover:${run.id}:${randomUUID()}`);}
}
async function runContext(runId){
 const [row]=await query('SELECT r.*,b.config_json,b.id AS publish_batch_id FROM publish_account_runs r JOIN publish_batches b ON b.id=r.batch_id WHERE r.id=?',[safeId(runId)]);
 if(!row)throw err('RUN_NOT_FOUND','Publish run not found.',404);
 const snapshot=parseJSON(row.config_json);const {plan}=snapshot;const allocation=plan.allocations.find(a=>a.accountId===row.account_id);
 if(!allocation)throw err('RUN_PLAN_MISMATCH','The stored batch does not include this account.');
 const [account]=await query('SELECT connection_id,currency FROM ad_accounts WHERE account_id=?',[row.account_id]);if(!account||account.currency!==plan.currency)throw err('ACCOUNT_MISMATCH','The account connection or currency changed.');
 return{row,plan,allocation,account,pageId:row.page_id};
}
async function inflight(run,stage){
 const r=await query("UPDATE publish_account_runs SET inflight=1,inflight_stage=?,status='building' WHERE id=? AND inflight=0 AND status IN ('queued','building','waiting_media')",[stage,run.id]);
 if(r.affectedRows!==1)throw err('PUBLISH_STEP_CONFLICT','A previous publishing operation may have an unknown outcome. Review remotely before continuing.');
}
async function advance(run,{stage,contentIndex=run.content_index,status='building',campaignId=null}){
 await query('UPDATE publish_account_runs SET stage=?,content_index=?,status=?,inflight=0,inflight_stage=NULL,error_code=NULL,error_message=NULL,campaign_id=COALESCE(?,campaign_id) WHERE id=?',
 [stage,contentIndex,status,campaignId,run.id]);
}
async function failure(run,e){
 const code=String(e.code||'META_RESULT_UNCERTAIN').slice(0,100);
 await query("UPDATE publish_account_runs SET status='needs_review',error_code=?,error_message=? WHERE id=?",[code,String(e.message||'Meta step failed').slice(0,350),run.id]);
 await updateBatch(run.batch_id);
 return{done:true,status:'needs_review',code};
}
export async function processPublishStep(runId){
 if(!config.publishEnabled)throw err('PUBLISH_DISABLED','Publishing paused by Hostinger environment flag.',503);
 const {row,plan,allocation,account,pageId}=await runContext(runId);
 if(row.status==='ready_for_review'||row.status==='active'||row.status==='needs_review'||row.status==='paused')return{done:true,status:row.status};
 if(row.inflight)return failure(row,err('UNKNOWN_REMOTE_OUTCOME','Previous Meta write was interrupted. Check Meta Ads Manager before retrying.'));
 const token=await connectionToken(account.connection_id),content=plan.contents[row.content_index];
 if(!content&&row.stage!=='campaign')throw err('CONTENT_CURSOR_INVALID','Stored content index is invalid.');
 const [item]=content?await query('SELECT * FROM publish_items WHERE run_id=? AND content_index=?',[row.id,row.content_index]):[];
 try{
  if(row.stage==='campaign'){
   await inflight(row,'create_campaign');
   const result=await metaWrite(`${row.account_id}/campaigns`,token,metaCampaignForm(plan,row.id.slice(0,8),allocation));
   if(!/^\d+$/.test(String(result.id||'')))throw err('META_CAMPAIGN_ID_MISSING','Meta returned no campaign ID.');
   await advance(row,{stage:'media',campaignId:result.id});
  }else if(row.stage==='media'){
   const [cached]=await query('SELECT * FROM meta_media_cache WHERE account_id=? AND media_asset_id=?',[row.account_id,content.mediaAssetId]);
   if(cached&&cached.status==='ready'&&(cached.meta_media_id||cached.image_hash)){
    await query("UPDATE publish_items SET meta_media_id=?,image_hash=?,status='asset_ready' WHERE id=?",[cached.meta_media_id,cached.image_hash,item.id]);
    await advance(row,{stage:'adset'});
   }else if(cached&&cached.status==='processing'&&cached.meta_media_id){
    await query("UPDATE publish_items SET meta_media_id=?,status='processing' WHERE id=?",[cached.meta_media_id,item.id]);
    await advance(row,{stage:'media_wait',status:'waiting_media'});
   }else{
    const [asset]=await query("SELECT * FROM media_assets WHERE id=? AND status='ready'",[content.mediaAssetId]);
    if(!asset)throw err('MEDIA_NOT_READY','Media file missing or not ready.');
    await inflight(row,'upload_media');
    const uploaded=await uploadMetaMedia({accountId:row.account_id,token,asset});
    await query(`INSERT INTO meta_media_cache (account_id,media_asset_id,meta_media_id,image_hash,status) VALUES (?,?,?,?,?)
      ON DUPLICATE KEY UPDATE meta_media_id=VALUES(meta_media_id),image_hash=VALUES(image_hash),status=VALUES(status)`,[row.account_id,asset.id,uploaded.metaMediaId||null,uploaded.imageHash||null,uploaded.status]);
    await query('UPDATE publish_items SET meta_media_id=?,image_hash=?,status=? WHERE id=?',[uploaded.metaMediaId||null,uploaded.imageHash||null,uploaded.status,item.id]);
    await advance(row,{stage:uploaded.status==='ready'?'adset':'media_wait',status:uploaded.status==='ready'?'building':'waiting_media'});
   }
  }else if(row.stage==='media_wait'){
   const mediaSince=new Date(String(item.updated_at||'').replace(' ','T')+'Z').getTime();
   if(Number.isFinite(mediaSince)&&Date.now()-mediaSince>2*60*60*1000)throw err('META_VIDEO_TIMEOUT','Meta video processing exceeded two hours; review the asset manually.');
   const result=await isVideoReady(item.meta_media_id,token);
   if(!result.ready)return{done:false,delaySeconds:120,status:'waiting_media',videoStatus:result.value};
   await query("UPDATE meta_media_cache SET status='ready' WHERE account_id=? AND media_asset_id=?",[row.account_id,content.mediaAssetId]);
   await query("UPDATE publish_items SET status='asset_ready' WHERE id=?",[item.id]);
   await advance(row,{stage:'adset'});
  }else if(row.stage==='adset'){
   await inflight(row,'create_adset');
   const data=await metaWrite(`${row.account_id}/adsets`,token,metaAdsetForm(plan,allocation,content,row.campaign_id,row.content_index,pageId));
   if(!/^\d+$/.test(String(data.id||'')))throw err('META_ADSET_ID_MISSING','Meta returned no ad-set ID.');
   await query("UPDATE publish_items SET adset_id=?,status='adset_created' WHERE id=?",[data.id,item.id]);
   await advance(row,{stage:'creative'});
  }else if(row.stage==='creative'){
   const [asset]=await query('SELECT kind FROM media_assets WHERE id=?',[content.mediaAssetId]);
   if(!asset)throw err('MEDIA_NOT_READY','Media metadata is missing.');
   // Thumbnail lookup is read-only and must finish before marking a remote write in-flight.
   // The Meta video thumbnail URL is read just-in-time, avoiding a stale stored CDN URL.
   const thumbnailUrl=asset.kind==='video'&&!item.image_hash?await getMetaVideoThumbnail(item.meta_media_id,token):null;
   const payload=metaCreativeForm(plan,allocation,content,{...asset,meta_media_id:item.meta_media_id,image_hash:item.image_hash,thumbnail_url:thumbnailUrl},pageId,row.id.slice(0,8));
   await inflight(row,'create_creative');
   const data=await metaWrite(`${row.account_id}/adcreatives`,token,payload);
   if(!/^\d+$/.test(String(data.id||'')))throw err('META_CREATIVE_ID_MISSING','Meta returned no creative ID.');
   await query("UPDATE publish_items SET creative_id=?,status='creative_created' WHERE id=?",[data.id,item.id]);
   await advance(row,{stage:'ad'});
  }else if(row.stage==='ad'){
   await inflight(row,'create_ad');
   const data=await metaWrite(`${row.account_id}/ads`,token,{name:`${plan.name} / ${content.title}`.slice(0,250),adset_id:item.adset_id,creative:{creative_id:item.creative_id},status:'PAUSED'});
   if(!/^\d+$/.test(String(data.id||'')))throw err('META_AD_ID_MISSING','Meta returned no Ad ID.');
   await query("UPDATE publish_items SET ad_id=?,status='ready_for_review' WHERE id=?",[data.id,item.id]);
   const next=row.content_index+1,done=next>=plan.contents.length;
   await advance(row,{stage:done?'complete':'media',contentIndex:done?row.content_index:next,status:done?'ready_for_review':'building'});
  }else if(row.stage==='complete'){
   await updateBatch(row.batch_id);return{done:true,status:'ready_for_review'};
  }else throw err('PUBLISH_BAD_STAGE','Unknown publishing step.');
  await updateBatch(row.batch_id);
  const [fresh]=await query('SELECT status,stage FROM publish_account_runs WHERE id=?',[row.id]);
  return{done:fresh.status==='ready_for_review',status:fresh.status,stage:fresh.stage};
 }catch(e){return failure(row,e);}
}
export async function processActivationStep(runId){
 if(!config.activationEnabled)throw err('ACTIVATION_DISABLED','Activation paused by Hostinger environment flag.',503);
 const {row,plan,account}=await runContext(runId);
 if(row.status==='active'||row.status==='needs_review')return{done:true,status:row.status};
 if(row.status!=='activating')return{done:true,status:row.status};
 const token=await connectionToken(account.connection_id);
 const items=await query('SELECT adset_id,ad_id FROM publish_items WHERE run_id=? ORDER BY content_index',[row.id]);
 try{
  if(row.activation_stage==='adset'){
   if(!items[row.activation_index]?.adset_id)throw err('ACTIVATION_INCOMPLETE','Missing ad set ID.');
   await metaSetStatus({id:items[row.activation_index].adset_id,token,status:'ACTIVE'});
   const next=row.activation_index+1;await query('UPDATE publish_account_runs SET activation_stage=?,activation_index=? WHERE id=?',[next>=items.length?'ad':'adset',next>=items.length?0:next,row.id]);
  }else if(row.activation_stage==='ad'){
   if(!items[row.activation_index]?.ad_id)throw err('ACTIVATION_INCOMPLETE','Missing Ad ID.');
   await metaSetStatus({id:items[row.activation_index].ad_id,token,status:'ACTIVE'});
   const next=row.activation_index+1;await query('UPDATE publish_account_runs SET activation_stage=?,activation_index=? WHERE id=?',[next>=items.length?'campaign':'ad',next>=items.length?0:next,row.id]);
  }else if(row.activation_stage==='campaign'){
   // Campaign is activated LAST, only when all its children are ready.
   await metaSetStatus({id:row.campaign_id,token,status:'ACTIVE'});
   await query("UPDATE publish_account_runs SET status='active',activation_stage='complete' WHERE id=?",[row.id]);
  }else throw err('ACTIVATION_BAD_STAGE','Unknown activation state.');
  await updateBatch(row.batch_id);
  const [fresh]=await query('SELECT status,activation_stage FROM publish_account_runs WHERE id=?',[row.id]);
  return{done:fresh.status==='active',status:fresh.status,stage:fresh.activation_stage};
 }catch(e){
  // A failed activation may have succeeded remotely before a network/database
  // interruption. Reassert PAUSED on the parent campaign before returning.
  // If even this fails, require urgent manual inspection in Meta Ads Manager.
  let safelyPaused=false;
  try{if(row.campaign_id){await metaSetStatus({id:row.campaign_id,token,status:'PAUSED'});safelyPaused=true;}}catch{}
  if(!safelyPaused)return failure(row,err('ACTIVATION_STATUS_UNVERIFIED',`URGENT: Activation outcome is uncertain. Check and PAUSE campaign ${row.campaign_id||'(ID missing)'} directly in Meta Ads Manager.`,502));
  return failure(row,err('ACTIVATION_HALTED_PAUSED',`Activation failed; campaign ${row.campaign_id} was sent a PAUSE request. Check Meta Ads Manager before retrying.`,502));
 }
}
export async function processPauseStep(runId){
 const {row,account}=await runContext(runId);
 if(row.status==='paused')return{done:true,status:'paused'};
 if(row.status!=='pausing')return{done:true,status:row.status};
 try{
  const token=await connectionToken(account.connection_id);
  await metaSetStatus({id:row.campaign_id,token,status:'PAUSED'});
  await query("UPDATE publish_account_runs SET status='paused' WHERE id=?",[row.id]);
  await updateBatch(row.batch_id);
  return{done:true,status:'paused'};
 }catch(e){return failure(row,e);}
}
