import { Router } from 'express';
import { DateTime } from 'luxon';
import { query,transaction,parseJSON } from './db.js';
import { graph,connectionToken } from './meta.js';
import { requireAuth,requireRole,csrfGuard,limit } from './auth.js';
import { httpError } from './security.js';
import {monitorSettings} from './settings.js';
import {convertTotals} from '../shared/monitoring.js';
import { normalizeBilling,aggregateFinance,nullableNumber } from '../shared/finance.js';
const iso=()=>new Date().toISOString();
export async function financeSchemaReady(){try{await query('SELECT account_id FROM account_spend_daily LIMIT 1');return true;}catch(e){if(e.code==='ER_NO_SUCH_TABLE')return false;throw e;}}
export async function syncFinance(accountId,{force=false,signal}={}){
 if(!await financeSchemaReady())throw httpError(503,'Import sql/002-media-finance.sql before syncing daily spend.','FINANCE_SCHEMA_REQUIRED');
 const [a]=await query('SELECT * FROM ad_accounts WHERE account_id=? AND slot IS NOT NULL',[accountId]);
 if(!a)throw httpError(404,'Mapped account not found.');
 const previous=parseJSON(a.billing_snapshot,{})||{};
 if(!force&&previous.lastAttemptAt&&Date.now()-Date.parse(previous.lastAttemptAt)<60000)return{cached:true,accountId};
 const now=DateTime.now().setZone(a.timezone_name);if(!now.isValid)throw httpError(422,'Unknown account timezone.');
 const token=await connectionToken(a.connection_id),today=now.toISODate(),yesterday=now.minus({days:1}).toISODate();
 const started=iso();
 const readDay=async day=>{
  const r=await graph(`${accountId}/insights`,token,{fields:'account_id,date_start,spend',level:'account',time_range:{since:day,until:day},limit:10},{signal});
  if(!Array.isArray(r.data)||r.data.length>1||r.paging?.next)throw httpError(502,'Unexpected account-level insights response.','FINANCE_DATA_INVALID');
  // An empty, successful account-level response means no reported spend. Failed calls never become zero.
  const spend=r.data.length?nullableNumber(r.data[0].spend):0;
  if(spend===null||spend<0)throw httpError(502,'Invalid spend in Meta response.','FINANCE_DATA_INVALID');
  if(r.data.length&&r.data[0].date_start!==day)throw httpError(502,'Reporting date did not match the request.','FINANCE_DATE_MISMATCH');
  return{day,spend};
 };
 const results=await Promise.allSettled([
  graph(accountId,token,{fields:'id,currency,balance,amount_spent,spend_cap,is_prepay_account'},{signal}),readDay(today),readDay(yesterday)
 ]);
 const errors={};let billing=previous.billing||null;
 if(results[0].status==='fulfilled'){
  if(results[0].value.currency&&results[0].value.currency!==a.currency)errors.billing='ACCOUNT_CURRENCY_CHANGED';
  else billing=normalizeBilling(results[0].value,a.currency,iso());
 }else errors.billing=results[0].reason.code||'BILLING_UNAVAILABLE';
 for(const [index,name] of [[1,'today'],[2,'yesterday']])if(results[index].status==='rejected')errors[name]=results[index].reason.code||'INSIGHTS_UNAVAILABLE';
 const snapshot={billing,lastAttemptAt:started,errors};
 await transaction(async c=>{
  await c.execute('UPDATE ad_accounts SET billing_snapshot=? WHERE account_id=?',[JSON.stringify(snapshot),accountId]);
  for(const result of results.slice(1))if(result.status==='fulfilled')await c.execute(`INSERT INTO account_spend_daily (account_id,day,currency,timezone_name,spend,synced_at) VALUES (?,?,?,?,?,UTC_TIMESTAMP())
   ON DUPLICATE KEY UPDATE currency=VALUES(currency),timezone_name=VALUES(timezone_name),spend=VALUES(spend),synced_at=UTC_TIMESTAMP()`,[accountId,result.value.day,a.currency,a.timezone_name,result.value.spend]);
 });
 return{accountId,errors,partial:Object.keys(errors).length>0,today,yesterday};
}
export async function financialOverview(ids){
 if(!await financeSchemaReady())throw httpError(503,'Import sql/002-media-finance.sql into the existing database to enable balance and daily spend.','FINANCE_SCHEMA_REQUIRED');
 const mapped=await query('SELECT account_id,name,currency,timezone_name,slot,billing_snapshot FROM ad_accounts WHERE slot IS NOT NULL ORDER BY slot');
 if(ids&&ids.some(id=>!mapped.some(a=>a.account_id===id)))throw httpError(400,'Only mapped accounts may be selected.');
 const selected=ids?mapped.filter(a=>ids.includes(a.account_id)):mapped;
 const accounts=[];const settings=await monitorSettings();
 for(const a of selected){
  const now=DateTime.now().setZone(a.timezone_name);if(!now.isValid)continue;
  const today=now.toISODate(),yesterday=now.minus({days:1}).toISODate();
  const rows=await query('SELECT day,currency,spend,synced_at FROM account_spend_daily WHERE account_id=? AND day IN (?,?)',[a.account_id,today,yesterday]);
  const value=day=>{const r=rows.find(r=>r.day===day&&r.currency===a.currency);return r?{day,spend:Number(r.spend),syncedAt:String(r.synced_at).replace(' ','T')+'Z'}:{day,spend:null,syncedAt:null};};
  const s=parseJSON(a.billing_snapshot,{})||{},t=value(today),y=value(yesterday);
  accounts.push({accountId:a.account_id,name:a.name,label:'CM-'+String(a.slot).padStart(2,'0'),currency:a.currency,timezone:a.timezone_name,today:t,yesterday:y,billing:s.billing?.currency===a.currency?s.billing:null,lastAttemptAt:s.lastAttemptAt||null,errors:s.errors||{},stale:!t.syncedAt||Date.now()-Date.parse(t.syncedAt)>Math.max(10,settings.intervalMinutes*2)*60000||Object.keys(s.errors||{}).length>0||!s.billing?.syncedAt||Date.now()-Date.parse(s.billing.syncedAt)>Math.max(10,settings.intervalMinutes*2)*60000});
 }
 const converted={today:convertTotals(accounts.map(a=>({currency:a.currency,spend:a.today?.spend})),settings),billingDue:convertTotals(accounts.map(a=>({currency:a.currency,spend:a.billing?.billAmountDue})),settings),capRemaining:convertTotals(accounts.map(a=>({currency:a.currency,spend:a.billing?.spendCapRemaining})),settings)};
 return{accounts,converted,totals:aggregateFinance(accounts),generatedAt:iso(),period:'account_local_calendar_day',note:'Today is midnight to the last sync in EACH account timezone, not a rolling 24 hours. Reporting can be delayed. Billing amount due is not available prepaid funds; spend-cap headroom is not cash. Missing values remain unavailable, never zero-filled.'};
}
export function financeRoutes(){const r=Router();r.use(requireAuth);
 r.get('/',async(req,res)=>{let ids;if(req.query.accounts!==undefined){ids=String(req.query.accounts).split(',').filter(Boolean);if(ids.length>12||new Set(ids).size!==ids.length||ids.some(id=>!/^act_[0-9]+$/.test(id)))throw httpError(400,'Select up to 12 unique account IDs.');}res.json(await financialOverview(ids));});
 r.post('/:id/refresh',requireRole('super_admin','manager'),csrfGuard,async(req,res)=>{await limit('finance:'+req.params.id,8,5);res.json(await syncFinance(req.params.id));});
 return r;
}
