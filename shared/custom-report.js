import {metricValues} from './monitoring.js';

export const REPORT_FIELDS=Object.freeze({
 spend:'Spend',impressions:'Impressions',allClicks:'All clicks',linkClicks:'Link clicks',landingPageViews:'Landing-page views',leads:'Mapped leads',calls:'Reported call actions',linkCtr:'Link CTR (%)',linkCpc:'Cost per link click',cpm:'CPM',costPerLead:'Cost per mapped lead'
});
export const REPORT_GROUPS=Object.freeze({account:'Account',campaign:'Campaign',adset:'Ad set',ad:'Ad',day:'Reporting day'});
const rawFields=['spend','impressions','allClicks','linkClicks','landingPageViews','leads','calls'];
const iso=/^\d{4}-\d{2}-\d{2}$/;
function bad(message){throw Object.assign(new Error(message),{code:'INVALID_CUSTOM_REPORT',status:400});}
export function validateCustomReport(value){
 if(!value||typeof value!=='object'||Array.isArray(value))bad('A report configuration is required.');
 const accountIds=value.accountIds;
 if(!Array.isArray(accountIds)||!accountIds.length||accountIds.some(x=>typeof x!=='string'||!/^act_[0-9]+$/.test(x))||new Set(accountIds).size!==accountIds.length)bad('Select unique, authorized ad accounts.');
 const groupBy=String(value.groupBy||'account');if(!Object.hasOwn(REPORT_GROUPS,groupBy))bad('Choose a valid group by field.');
 const metrics=value.metrics;
 if(!Array.isArray(metrics)||!metrics.length||new Set(metrics).size!==metrics.length||metrics.some(x=>typeof x!=='string'||!Object.hasOwn(REPORT_FIELDS,x)))bad('Choose unique available metrics.');
 const from=String(value.from||''),to=String(value.to||'');
 if(!iso.test(from)||!iso.test(to)||!Number.isFinite(Date.parse(from+'T00:00:00Z'))||!Number.isFinite(Date.parse(to+'T00:00:00Z'))||new Date(from+'T00:00:00Z').toISOString().slice(0,10)!==from||new Date(to+'T00:00:00Z').toISOString().slice(0,10)!==to)bad('Select valid ISO dates.');
 const days=(Date.parse(to+'T00:00:00Z')-Date.parse(from+'T00:00:00Z'))/86400000;
 if(days<0||days>92)bad('Choose a period from 1 to 93 reporting days; split longer reports into separate date ranges.');
 if(to>new Date().toISOString().slice(0,10))bad('Report end date cannot be in the future.');
 const name=String(value.name||'Custom report').trim();if(!name||name.length>120)bad('Report name must be 1–120 characters.');
 return{name,accountIds:[...accountIds],from,to,groupBy,metrics:[...metrics]};
}
function ratio(n,d,mult=1){return n===null||d===null||!Number.isFinite(n)||!Number.isFinite(d)||d<=0?null:Math.round(n/d*mult*1000000)/1000000;}
function groupOf(row,groupBy){
 if(groupBy==='account')return [row.account_id,'All ads'];
 if(groupBy==='day')return [String(row.day),'Reporting day'];
 const field={campaign:'campaign_id',adset:'adset_id',ad:'ad_id'}[groupBy];
 const id=String(row[field]||'Unknown');return[id,groupBy==='ad'?String(row.ad_name||id):id];
}
export function aggregateCustomReport(rawRows,accounts,request,settings){
 const accountMap=new Map(accounts.map(a=>[a.account_id,a]));
 const groups=new Map();
 for(const row of rawRows){
  const a=accountMap.get(row.account_id);if(!a)continue;
  const [dimension,label]=groupOf(row,request.groupBy);
  const key=JSON.stringify([a.account_id,dimension]);
  let g=groups.get(key);
  if(!g){g={accountId:a.account_id,accountName:a.name,accountLabel:'CM-'+String(a.slot).padStart(2,'0'),currency:a.currency,timezone:a.timezone_name,dimension,label,raw:Object.fromEntries(rawFields.map(f=>[f,null])),coverage:Object.fromEntries(rawFields.map(f=>[f,0])),sourceRows:0,lastSyncedAt:a.last_sync||null};groups.set(key,g);}
  const metrics=metricValues(row,settings);g.sourceRows++;
  for(const field of rawFields)if(metrics[field]!==null){g.raw[field]=(g.raw[field]??0)+metrics[field];g.coverage[field]++;}
 }
 const result=[...groups.values()].map(g=>{
  const m=g.raw;
  const computed={...m,linkCtr:ratio(m.linkClicks,m.impressions,100),linkCpc:ratio(m.spend,m.linkClicks),cpm:ratio(m.spend,m.impressions,1000),costPerLead:ratio(m.spend,m.leads)};
  return{...g,metrics:Object.fromEntries(request.metrics.map(x=>[x,computed[x]]))};
 }).sort((a,b)=>(b.raw.spend??-1)-(a.raw.spend??-1)||a.accountLabel.localeCompare(b.accountLabel));
 return result;
}
export function csvReport(report){
 const fields=report.config.metrics,columns=['Account label','Account name','Meta account ID','Currency','Timezone','Group','Group label','Last sync','Source rows',...fields.map(f=>REPORT_FIELDS[f])];
 const safe=x=>{const s=x===null||x===undefined?'':String(x);const safeExcel=/^[=+@\-\t\r]/.test(s)?"'"+s:s;return '"'+safeExcel.replaceAll('"','""')+'"';};
 const result=[columns.map(safe).join(',')];
 for(const r of report.rows){result.push([r.accountLabel,r.accountName,r.accountId,r.currency,r.timezone,r.dimension,r.label,r.lastSyncedAt,r.sourceRows,...fields.map(f=>r.metrics[f])].map(safe).join(','));}
 return '\ufeff'+result.join('\r\n')+'\r\n';
}
