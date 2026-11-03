import {DateTime} from 'luxon';
import {query,transaction,parseJSON} from './db.js';
import {connectionToken,graph} from './meta.js';
import {aggregate} from '../shared/reporting.js';
import {syncFinance} from './finance.js';
import {httpError} from './security.js';
import {monitorSettings} from './settings.js';
import {syncHourly} from './hourly.js';
import {sumMetricRows,convertTotals,utcTimestamp} from '../shared/monitoring.js';
import {utcHourWindow} from '../shared/hourly.js';
export async function syncAccount(accountId){
 const [a]=await query('SELECT * FROM ad_accounts WHERE account_id=? AND slot IS NOT NULL',[accountId]);if(!a)throw httpError(404,'Select the account in Account Mapping first.');
 const token=await connectionToken(a.connection_id);
 const now=DateTime.now().setZone(a.timezone_name);if(!now.isValid)throw httpError(422,'Invalid account reporting timezone.');
 const [state]=await query('SELECT history_synced_at FROM account_sync_state WHERE account_id=?',[accountId]);
 const fullHistory=!state?.history_synced_at||Date.now()-utcTimestamp(state.history_synced_at)>24*3600000;
 const until=now.toISODate(),since=now.minus({days:fullHistory?7:1}).toISODate();
 const settings=await monitorSettings();
 const signal=AbortSignal.timeout(70000);let after;const rows=[];
 do{
  const response=await graph(`${a.account_id}/insights`,token,{fields:'account_id,ad_id,ad_name,campaign_id,adset_id,date_start,spend,impressions,clicks,inline_link_clicks,actions',level:'ad',time_range:{since,until},time_increment:1,limit:100,...(after?{after}:{})},{signal});
  rows.push(...(response.data||[]));after=response.paging?.next?response.paging?.cursors?.after:null;
  if(rows.length>1500)throw httpError(422,'This account requires paginated/asynchronous large-report sync. Previous data was kept.','INSIGHTS_SIZE_LIMIT');
 }while(after);
 await transaction(async c=>{
  await c.execute('DELETE FROM insight_daily WHERE account_id=? AND day BETWEEN ? AND ?',[accountId,since,until]);
  for(const v of rows){
   if(!v.ad_id||!/^\d{4}-\d{2}-\d{2}$/.test(v.date_start||'')||v.date_start<since||v.date_start>until)continue;
   await c.execute(`INSERT INTO insight_daily (account_id,ad_id,day,campaign_id,adset_id,ad_name,spend,impressions,clicks,actions_json) VALUES (?,?,?,?,?,?,?,?,?,?)`,[accountId,String(v.ad_id),v.date_start,String(v.campaign_id||''),String(v.adset_id||''),String(v.ad_name||v.ad_id).slice(0,255),Number(v.spend)||0,Number(v.impressions)||0,Number(v.clicks)||0,JSON.stringify(v.actions||[])]);
   await c.execute('INSERT INTO insight_extras (account_id,ad_id,day,link_clicks,raw_actions) VALUES (?,?,?,?,?)',[accountId,String(v.ad_id),v.date_start,v.inline_link_clicks==null?null:Number(v.inline_link_clicks)||0,JSON.stringify(v.actions||[])]);
  }
  await c.execute('UPDATE ad_accounts SET last_sync=UTC_TIMESTAMP(),last_error=NULL WHERE account_id=?',[accountId]);
  if(fullHistory)await c.execute('UPDATE account_sync_state SET history_synced_at=UTC_TIMESTAMP() WHERE account_id=?',[accountId]);
 });
 let finance;try{finance=await syncFinance(accountId,{signal});}catch(e){finance={error:e.code||'FINANCE_SYNC_FAILED'};}
 let hourly={status:'disabled'};if(settings.hourlyEnabled)try{hourly=await syncHourly(a,token,signal);}catch(e){hourly={status:'unavailable',code:e.code||'HOURLY_UNAVAILABLE'};}
 return {finance,hourly,partial:!!finance.error||!!finance.partial||(settings.hourlyEnabled&&hourly.status!=='synced'),accountId,rows:rows.length,since,until,timezone:a.timezone_name};
}
export async function snapshot(days=7){
 if(![1,3,7].includes(Number(days)))throw httpError(400,'Choose 1, 3 or 7 completed reporting days.');
 const accounts=await query('SELECT account_id,name,currency,timezone_name,slot,last_sync,last_error FROM ad_accounts WHERE slot IS NOT NULL ORDER BY slot');
 const windows=[],rows=[];const map={};const settings=await monitorSettings();
 for(const a of accounts){
  map[a.account_id]=a;const now=DateTime.now().setZone(a.timezone_name),until=now.minus({days:1}).toISODate(),since=now.minus({days:Number(days)}).toISODate();
  windows.push({account_ref:`account:${a.account_id}`,slot:a.slot,timezone:a.timezone_name,since,until,last_sync:a.last_sync?String(a.last_sync).replace(' ','T')+'Z':null,last_error:a.last_error});
  rows.push(...await query('SELECT d.account_id,d.ad_id,d.spend,d.impressions,d.clicks,d.actions_json,e.link_clicks AS inline_link_clicks FROM insight_daily d LEFT JOIN insight_extras e ON e.account_id=d.account_id AND e.ad_id=d.ad_id AND e.day=d.day WHERE d.account_id=? AND d.day BETWEEN ? AND ?',[a.account_id,since,until]));
 }
 const result=aggregate(rows,map,settings);
 return {generated_at:new Date().toISOString(),period_days:Number(days),period_kind:'completed_account_local_calendar_days',windows,...result,convertedSpend:convertTotals(result.totals,settings),metricDefinitions:{leadActionType:settings.leadActionType,callActionType:settings.callActionType||null},limitations:['Report covers the dates shown for each account; the dashboard also offers recent hourly spend.','Conversion metrics are separate action types; unreported values are null, not verified zero.','FX totals are estimates using the configured rate and date, not bank settlement values.','Meta may delay or revise attributed data; the latest sync time is included.']};
}
export async function overview(days=7){
 const data=await snapshot(days);const [draft]=await query('SELECT COUNT(*) AS n FROM campaign_drafts');const [report]=await query("SELECT COUNT(*) AS n FROM ai_reports WHERE status='completed'");
 const jobs=await query('SELECT id,kind,status,error_code,created_at,finished_at FROM jobs ORDER BY created_at DESC LIMIT 20');
 return {snapshot:data,draftCount:Number(draft.n),reportCount:Number(report.n),jobs};
}

// Dashboard-only periods, independent from the completed-day AI report.
export async function performance(period='today',requestedIds){
 if(!['today','yesterday','12h','24h','3d','7d'].includes(period))throw httpError(400,'Choose a supported reporting period.');
 const settings=await monitorSettings();if(!settings.schemaReady)throw httpError(503,'Import sql/003-monitoring.sql to enable recent analytics.','MONITOR_SCHEMA_REQUIRED');
 const all=await query(`SELECT a.*,s.last_success_at,s.hourly_synced_at,s.details_json FROM ad_accounts a LEFT JOIN account_sync_state s ON s.account_id=a.account_id WHERE a.slot IS NOT NULL ORDER BY a.slot`);
 const selected=requestedIds===undefined?all:all.filter(a=>requestedIds.includes(a.account_id));
 const globalWindow=period.endsWith('h')?utcHourWindow(Number(period.slice(0,-1))):null;
 const accounts=[];
 for(const a of selected){
  const now=DateTime.now().setZone(a.timezone_name);let rows,window,coverage={};
  if(globalWindow){
   const start=globalWindow.start.slice(0,19).replace('T',' '),end=globalWindow.end.slice(0,19).replace('T',' ');
   rows=await query('SELECT spend,impressions,clicks,link_clicks AS inline_link_clicks,start_utc,end_utc FROM account_hourly WHERE account_id=? AND start_utc>=? AND end_utc<=? ORDER BY start_utc',[a.account_id,start,end]);
   window=globalWindow;
   coverage={bucketCount:rows.length,firstBucket:rows[0]?.start_utc||null,lastBucket:rows.at(-1)?.end_utc||null,hourlySyncedAt:a.hourly_synced_at||null,hourlyStatus:parseJSON(a.details_json,{})?.hourly||null};
  }else{
   const until=period==='yesterday'?now.minus({days:1}).toISODate():now.toISODate();
   const since=period==='3d'?now.minus({days:2}).toISODate():period==='7d'?now.minus({days:6}).toISODate():until;
   rows=await query('SELECT d.spend,d.impressions,d.clicks,d.actions_json,e.link_clicks AS inline_link_clicks FROM insight_daily d LEFT JOIN insight_extras e ON e.account_id=d.account_id AND e.ad_id=d.ad_id AND e.day=d.day WHERE d.account_id=? AND d.day BETWEEN ? AND ?',[a.account_id,since,until]);
   window={since,until,timezone:a.timezone_name};
  }
  const metrics=sumMetricRows(rows,settings);
  accounts.push({accountId:a.account_id,name:a.name,label:'CM-'+String(a.slot).padStart(2,'0'),currency:a.currency,timezone:a.timezone_name,window,metrics,
   syncedAt:globalWindow?a.hourly_synced_at:a.last_success_at,lastError:a.last_error||null,coverage,
   stale:!utcTimestamp(globalWindow?a.hourly_synced_at:a.last_success_at)||Date.now()-utcTimestamp(globalWindow?a.hourly_synced_at:a.last_success_at)>settings.intervalMinutes*120000});
 }
 const groups=new Map();
 for(const a of accounts){if(!groups.has(a.currency))groups.set(a.currency,{currency:a.currency,spend:null,accounts:0,known:0});const g=groups.get(a.currency);g.accounts++;if(a.metrics.spend!==null){g.spend=(g.spend??0)+a.metrics.spend;g.known++;}}
 return{period,generatedAt:new Date().toISOString(),globalWindow,accounts,totals:[...groups.values()],convertedSpend:convertTotals(accounts.map(a=>({currency:a.currency,spend:a.metrics.spend})),settings),
  definitions:{allClicks:'All Meta-reported clicks',linkClicks:'Link clicks only',leads:settings.leadActionType,calls:settings.callActionType||'Not mapped',hourly:'Complete provider hour buckets inside the displayed UTC window; no interpolated partial-hour spend.'},
  actionTypes:[...new Set(accounts.flatMap(a=>a.metrics.actionTypes))].sort()};
}
