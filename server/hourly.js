import {DateTime} from 'luxon';
import {query,transaction} from './db.js';
import {graph} from './meta.js';
import {parseHourLabel} from '../shared/hourly.js';
import {httpError} from './security.js';
export async function syncHourly(account,token,signal){
 const now=DateTime.now().setZone(account.timezone_name),since=now.minus({days:2}).toISODate(),until=now.toISODate();
 let after;const rows=[];
 do{
  const r=await graph(`${account.account_id}/insights`,token,{level:'account',fields:'account_id,date_start,spend,impressions,clicks,inline_link_clicks',breakdowns:'hourly_stats_aggregated_by_advertiser_time_zone',time_range:{since,until},time_increment:1,limit:500,...(after?{after}:{})},{signal});
  if(!Array.isArray(r.data))throw httpError(502,'Invalid hourly response.','HOURLY_RESPONSE_INVALID');
  rows.push(...r.data);after=r.paging?.next?r.paging?.cursors?.after:null;
  if(rows.length>1000)throw httpError(422,'Hourly report exceeded its safe size.','HOURLY_SIZE_LIMIT');
 }while(after);
 if(!rows.length)return{status:'unavailable_or_no_delivery',rows:0};
 const values=[];const seen=new Set();
 for(const r of rows){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(r.date_start||'')||r.date_start<since||r.date_start>until)throw httpError(502,'Hourly report returned an unexpected date.','HOURLY_DATE_MISMATCH');
  const label=r.hourly_stats_aggregated_by_advertiser_time_zone;let hour;
  try{hour=parseHourLabel(label);}catch{throw httpError(502,'Unsupported hourly bucket.','HOURLY_BUCKET_INVALID');}
  const local=DateTime.fromISO(`${r.date_start}T${String(hour).padStart(2,'0')}:00:00`,{zone:account.timezone_name});
  if(!local.isValid||local.hour!==hour||(local.getPossibleOffsets?.().length||1)!==1)throw httpError(422,'The account timezone has an ambiguous DST bucket. Daily reporting remains available.','HOURLY_DST_AMBIGUOUS');
  const key=r.date_start+label;if(seen.has(key))throw httpError(502,'Duplicate hourly bucket.','HOURLY_DUPLICATE');seen.add(key);
  const spend=Number(r.spend);if(!Number.isFinite(spend)||spend<0)throw httpError(502,'Invalid hourly spend.','HOURLY_AMOUNT_INVALID');
  const number=v=>v==null?null:Math.max(0,Number(v)||0);
  values.push([account.account_id,r.date_start,label,local.toUTC().toFormat('yyyy-MM-dd HH:mm:ss'),local.plus({hours:1}).toUTC().toFormat('yyyy-MM-dd HH:mm:ss'),account.timezone_name,account.currency,spend,number(r.impressions),number(r.clicks),number(r.inline_link_clicks)]);
 }
 await transaction(async c=>{
  await c.execute('DELETE FROM account_hourly WHERE account_id=? AND local_day BETWEEN ? AND ?',[account.account_id,since,until]);
  for(const v of values)await c.execute('INSERT INTO account_hourly (account_id,local_day,hour_label,start_utc,end_utc,timezone_name,currency,spend,impressions,clicks,link_clicks) VALUES (?,?,?,?,?,?,?,?,?,?,?)',v);
  await c.execute('UPDATE account_sync_state SET hourly_synced_at=UTC_TIMESTAMP() WHERE account_id=?',[account.account_id]);
 });
 return{status:'synced',rows:values.length,since,until};
}
