import {randomUUID} from 'node:crypto';
import {query,transaction,parseJSON} from './db.js';
import {config} from './config.js';
import {syncAccount} from './metrics.js';
import {generateReport} from './ai.js';
import {monitorSettings,monitoringSchemaReady} from './settings.js';
import {isDue,retryDelaySeconds,utcTimestamp} from '../shared/monitoring.js';
import {httpError} from './security.js';
const sqlTime=ms=>new Date(ms).toISOString().slice(0,19).replace('T',' ');
// All enqueue paths serialize briefly on app_locks. This prevents concurrent
// scheduler ticks and manual requests from duplicating work for the same account.
async function insertLocked(c,kind,payload,key){
 if(kind==='sync_account'){
  const [[pending]]=await c.execute("SELECT id,status FROM jobs WHERE kind='sync_account' AND status IN ('queued','running') AND JSON_UNQUOTE(JSON_EXTRACT(payload_json,'$.accountId'))=? LIMIT 1",[payload.accountId]);
  if(pending)return{...pending,existing:true};
 }
 const id=randomUUID();await c.execute('INSERT IGNORE INTO jobs (id,kind,dedupe_key,payload_json) VALUES (?,?,?,?)',[id,kind,key,JSON.stringify(payload)]);
 const [[job]]=await c.execute('SELECT id,status FROM jobs WHERE dedupe_key=?',[key]);return job;
}
export async function enqueue(kind,payload,key){
 return transaction(async c=>{await c.execute('SELECT id FROM app_locks WHERE id=1 FOR UPDATE');return insertLocked(c,kind,payload,key);});
}
export async function enqueueAll(){
 const accounts=await query('SELECT account_id FROM ad_accounts WHERE slot IS NOT NULL ORDER BY slot');
 const jobs=[];for(const a of accounts)jobs.push(await enqueue('sync_account',{accountId:a.account_id},`manual:${a.account_id}:${randomUUID()}`));
 return{accounts:accounts.length,jobs};
}
export async function scheduleDue(){
 const s=await monitorSettings();if(!s.schemaReady||!config.monitor||!s.enabled)return{scheduled:0,enabled:false};
 const accounts=await query(`SELECT a.account_id,s.last_success_at,s.next_allowed_at FROM ad_accounts a
  LEFT JOIN account_sync_state s ON a.account_id=s.account_id WHERE a.slot IS NOT NULL ORDER BY a.slot`);
 let scheduled=0;
 await transaction(async c=>{
  await c.execute('SELECT id FROM app_locks WHERE id=1 FOR UPDATE');
  for(const a of accounts)if(isDue(a.last_success_at,a.next_allowed_at,s.intervalMinutes)){
   const result=await insertLocked(c,'sync_account',{accountId:a.account_id},`auto:${a.account_id}:${randomUUID()}`);if(!result.existing)scheduled++;
  }
 });
 // Paid AI work has its own slower cadence and explicit switch. Five-minute
 // Meta syncing NEVER means five-minute OpenAI calls.
 if(s.aiEnabled&&config.ai.key){
  const [recent]=await query('SELECT created_at FROM ai_reports ORDER BY created_at DESC LIMIT 1');
  const due=!recent||Date.now()-utcTimestamp(recent.created_at)>config.reportIntervalHours*3600000;
  if(due)await enqueue('ai_report',{days:7,userId:null},`report:auto:${Math.floor(Date.now()/(config.reportIntervalHours*3600000))}`);
 }
 return{scheduled,enabled:true,intervalMinutes:s.intervalMinutes};
}
async function recoverLeases(){
 await query("UPDATE jobs SET status='failed',error_code='UNKNOWN_AI_OUTCOME',finished_at=UTC_TIMESTAMP() WHERE status='running' AND kind='ai_report' AND lease_until<UTC_TIMESTAMP()");
 await query("UPDATE ai_reports SET status='failed',error_code='INTERRUPTED' WHERE status='running' AND created_at<DATE_SUB(UTC_TIMESTAMP(),INTERVAL 10 MINUTE)");
 await query("UPDATE jobs SET status=IF(attempts<3,'queued','failed'),error_code='LEASE_EXPIRED',lease_until=NULL WHERE status='running' AND kind='sync_account' AND lease_until<UTC_TIMESTAMP()");
}
export async function runOne({schedule=true}={}){
 if(!await monitoringSchemaReady())throw httpError(503,'Import sql/002-media-finance.sql and sql/003-monitoring.sql before syncing.','MONITOR_SCHEMA_REQUIRED');
 if(schedule){await recoverLeases();await scheduleDue();}
 const preferences=await monitorSettings();
 if(!config.monitor||!preferences.enabled)await query("UPDATE jobs SET status='failed',error_code='AUTO_SYNC_PAUSED',finished_at=UTC_TIMESTAMP() WHERE status='queued' AND kind='sync_account' AND dedupe_key LIKE 'auto:%'");
 const job=await transaction(async c=>{
  const [[item]]=await c.execute("SELECT * FROM jobs WHERE status='queued' AND run_after<=UTC_TIMESTAMP() ORDER BY (kind='sync_account') DESC,created_at,id LIMIT 1 FOR UPDATE");
  if(!item)return null;
  await c.execute("UPDATE jobs SET status='running',attempts=attempts+1,lease_until=DATE_ADD(UTC_TIMESTAMP(),INTERVAL 180 SECOND) WHERE id=?",[item.id]);return item;
 });
 if(!job)return{processed:false};
 const payload=parseJSON(job.payload_json,{});const attempt=Number(job.attempts)+1;
 try{
  if(job.kind==='sync_account')await query('INSERT INTO account_sync_state (account_id,last_attempt_at) VALUES (?,UTC_TIMESTAMP()) ON DUPLICATE KEY UPDATE last_attempt_at=UTC_TIMESTAMP()',[payload.accountId]);
  const result=job.kind==='sync_account'?await syncAccount(payload.accountId):await generateReport(payload.userId||null,Number(payload.days)||7);
  await query("UPDATE jobs SET status='completed',finished_at=UTC_TIMESTAMP(),lease_until=NULL,error_code=NULL WHERE id=? AND status='running'",[job.id]);
  if(job.kind==='sync_account')await query('UPDATE account_sync_state SET last_success_at=UTC_TIMESTAMP(),next_allowed_at=NULL,last_error=NULL,details_json=? WHERE account_id=?',[JSON.stringify(result),payload.accountId]);
  return{processed:true,jobId:job.id,kind:job.kind,accountId:payload.accountId||null,status:'completed',partial:!!result.partial,reportId:result.id||null};
 }catch(e){
  const code=String(e.code||'JOB_FAILED').slice(0,100),delay=retryDelaySeconds(attempt,code,e.retryAfterSeconds);
  const retry=job.kind==='sync_account'&&attempt<3&&!/EXPIRED|META_190|META_10$|META_200$/.test(code);
  const after=sqlTime(Date.now()+delay*1000);
  await query("UPDATE jobs SET status=?,error_code=?,run_after=?,lease_until=NULL,finished_at=IF(?='failed',UTC_TIMESTAMP(),NULL) WHERE id=? AND status='running'",[retry?'queued':'failed',code,after,retry?'queued':'failed',job.id]);
  if(job.kind==='sync_account'){
   await query('UPDATE ad_accounts SET last_error=? WHERE account_id=?',[code,payload.accountId]);
   await query('UPDATE account_sync_state SET last_error=?,next_allowed_at=? WHERE account_id=?',[code,after,payload.accountId]);
  }
  return{processed:true,jobId:job.id,kind:job.kind,accountId:payload.accountId||null,status:retry?'retry_scheduled':'failed',code,retryAfterSeconds:delay};
 }
}
export async function runBatch({source='manual',budgetMs=15000,maxJobs=12,concurrency=3}={}){
 const automatic=['cron','https-scheduler'].includes(source);
 if(!await monitoringSchemaReady())throw httpError(503,'Import sql/003-monitoring.sql first.','MONITOR_SCHEMA_REQUIRED');
 if(automatic)await query('UPDATE scheduler_status SET last_tick_at=UTC_TIMESTAMP(),source=? WHERE id=1',[source]);
 const runner=randomUUID(),lease=sqlTime(Date.now()+(source==='cron'?360000:150000));
 const locked=await query('UPDATE scheduler_status SET runner_token=?,runner_until=? WHERE id=1 AND (runner_until IS NULL OR runner_until<UTC_TIMESTAMP())',[runner,lease]);
 if(locked.affectedRows!==1)return{processed:0,pending:null,busy:true,message:'Another runner is processing the queue.'};
 try{
  await recoverLeases();const scheduling=await scheduleDue();const results=[],deadline=Date.now()+Math.min(240000,budgetMs);let claimed=0;
  async function lane(){while(Date.now()<deadline&&claimed<maxJobs){claimed++;const r=await runOne({schedule:false});if(!r.processed)break;results.push(r);}}
  await Promise.all(Array.from({length:Math.min(3,Math.max(1,concurrency))},lane));
  const [pending]=await query("SELECT COUNT(*) AS n FROM jobs WHERE status IN ('queued','running')");
  const result={processed:results.length,pending:Number(pending.n),scheduling,results};
  if(automatic)await query('UPDATE scheduler_status SET last_finished_at=UTC_TIMESTAMP(),last_result=? WHERE id=1',[JSON.stringify({processed:results.length,pending:Number(pending.n),failed:results.filter(r=>r.status!=='completed').length})]);
  return result;
 }finally{await query('UPDATE scheduler_status SET runner_token=NULL,runner_until=NULL WHERE id=1 AND runner_token=?',[runner]);}
}
export async function syncStatus(){
 const s=await monitorSettings();if(!s.schemaReady)return{schemaReady:false,settings:s,accounts:[],scheduler:{healthy:false}};
 const [hb]=await query('SELECT * FROM scheduler_status WHERE id=1');
 const accounts=await query(`SELECT a.account_id,a.name,a.slot,a.currency,s.last_attempt_at,s.last_success_at,s.next_allowed_at,s.last_error,s.hourly_synced_at,s.details_json
  FROM ad_accounts a LEFT JOIN account_sync_state s ON s.account_id=a.account_id WHERE a.slot IS NOT NULL ORDER BY a.slot`);
 const pending=await query("SELECT id,status,run_after,payload_json FROM jobs WHERE kind='sync_account' AND status IN ('queued','running') ORDER BY created_at");
 const heartbeatAt=utcTimestamp(hb?.last_tick_at),healthy=heartbeatAt!==null&&Date.now()-heartbeatAt<(hb?.source==='https-scheduler'?480000:180000);
 return{schemaReady:true,settings:s,hostEnabled:config.monitor,scheduler:{healthy,lastTickAt:hb?.last_tick_at||null,lastFinishedAt:hb?.last_finished_at||null,source:hb?.source||null,result:parseJSON(hb?.last_result)},
  accounts:accounts.map(a=>{const job=pending.find(j=>parseJSON(j.payload_json,{})?.accountId===a.account_id);const next=Math.max((utcTimestamp(a.last_success_at)||Date.now()-s.intervalMinutes*60000)+s.intervalMinutes*60000,utcTimestamp(a.next_allowed_at)||0);
   return{...a,details:parseJSON(a.details_json,{}),details_json:undefined,status:job?.status||(a.last_error?'error':a.last_success_at?'synced':'not_synced'),nextSyncAt:config.monitor&&s.enabled?new Date(next).toISOString():null};})};
}
