from pathlib import Path
p=Path('/mnt/data/coastal-command-center-v04/server/jobs.js')
s=p.read_text()
s=s.replace(" await query(\"UPDATE jobs SET status=IF(attempts<3,'queued','failed'),error_code='LEASE_EXPIRED',lease_until=NULL WHERE status='running' AND kind='sync_account' AND lease_until<UTC_TIMESTAMP()\");", " await query(\"UPDATE publish_account_runs r JOIN jobs j ON JSON_UNQUOTE(JSON_EXTRACT(j.payload_json,'$.runId'))=r.id SET r.status='needs_review',r.error_code='UNKNOWN_REMOTE_OUTCOME' WHERE j.status='running' AND j.kind='publish_step' AND j.lease_until<UTC_TIMESTAMP()\");\n await query(\"UPDATE jobs SET status='failed',error_code='UNKNOWN_REMOTE_OUTCOME',finished_at=UTC_TIMESTAMP() WHERE status='running' AND kind IN ('publish_step','activate_step','pause_step') AND lease_until<UTC_TIMESTAMP()\");\n await query(\"UPDATE jobs SET status=IF(attempts<3,'queued','failed'),error_code='LEASE_EXPIRED',lease_until=NULL WHERE status='running' AND kind='sync_account' AND lease_until<UTC_TIMESTAMP()\");")
s=s.replace(" if(schedule){await recoverLeases();await scheduleDue();}"," if(schedule){await recoverLeases();await scheduleDue();const p=await import('./publish.js');await p.recoverPublishQueues();}")
s=s.replace("ORDER BY (kind='sync_account') DESC,created_at,id LIMIT 1", "ORDER BY CASE kind WHEN 'pause_step' THEN 5 WHEN 'activate_step' THEN 4 WHEN 'publish_step' THEN 3 WHEN 'sync_account' THEN 2 ELSE 1 END DESC,created_at,id LIMIT 1")
needle="  const result=job.kind==='sync_account'?await syncAccount(payload.accountId):await generateReport(payload.userId||null,Number(payload.days)||7);"
replacement="""  let result;
  if(['publish_step','activate_step','pause_step'].includes(job.kind)){
   const pub=await import('./publish.js');
   result=job.kind==='publish_step'?await pub.processPublishStep(payload.runId):job.kind==='activate_step'?await pub.processActivationStep(payload.runId):await pub.processPauseStep(payload.runId);
  }else result=job.kind==='sync_account'?await syncAccount(payload.accountId):await generateReport(payload.userId||null,Number(payload.days)||7);"""
assert needle in s
s=s.replace(needle,replacement)
needle="  if(job.kind==='sync_account')await query('UPDATE account_sync_state SET last_success_at=UTC_TIMESTAMP(),next_allowed_at=NULL,last_error=NULL,details_json=? WHERE account_id=?',[JSON.stringify(result),payload.accountId]);\n  return{processed:true,jobId:job.id,kind:job.kind,accountId:payload.accountId||null,status:'completed',partial:!!result.partial,reportId:result.id||null};"
replacement="""  if(job.kind==='sync_account')await query('UPDATE account_sync_state SET last_success_at=UTC_TIMESTAMP(),next_allowed_at=NULL,last_error=NULL,details_json=? WHERE account_id=?',[JSON.stringify(result),payload.accountId]);
  if(['publish_step','activate_step'].includes(job.kind)&&result.done===false){
   const next=await enqueue(job.kind,{runId:payload.runId},`${job.kind}:${payload.runId}:${randomUUID()}`);
   if(result.delaySeconds)await query('UPDATE jobs SET run_after=? WHERE id=?',[sqlTime(Date.now()+result.delaySeconds*1000),next.id]);
  }
  return{processed:true,jobId:job.id,kind:job.kind,accountId:payload.accountId||null,status:result.status||'completed',partial:!!result.partial,reportId:result.id||null};"""
assert needle in s
s=s.replace(needle,replacement)
needle="  const code=String(e.code||'JOB_FAILED').slice(0,100),delay=retryDelaySeconds(attempt,code,e.retryAfterSeconds);"
replacement="""  const code=String(e.code||'JOB_FAILED').slice(0,100),delay=retryDelaySeconds(attempt,code,e.retryAfterSeconds);
  if(['publish_step','activate_step','pause_step'].includes(job.kind)){
   await query("UPDATE publish_account_runs SET status='needs_review',error_code=?,error_message=? WHERE id=?",[code,String(e.message||'Publishing operation needs review').slice(0,350),payload.runId]);
  }"""
assert needle in s
s=s.replace(needle,replacement)
needle="  await recoverLeases();const scheduling=await scheduleDue();const results=[]"
replacement="  await recoverLeases();const scheduling=await scheduleDue();const publisher=await import('./publish.js');await publisher.recoverPublishQueues();const results=[]"
assert needle in s
s=s.replace(needle,replacement)
p.write_text(s)
