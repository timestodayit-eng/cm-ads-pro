// Pure validation and scheduling helpers. No credentials or network access.
export const DEFAULT_MONITORING = Object.freeze({
 enabled:true, intervalMinutes:5, hourlyEnabled:true, aiEnabled:false,
 displayCurrency:'BDT', fxRates:{}, fxAsOf:'', fxSource:'',
 callActionType:'', leadActionType:'lead'
});
export const ISO_DATE=/^\d{4}-\d{2}-\d{2}$/;
export function validateMonitoring(input){
 const fail=m=>{throw Object.assign(new Error(m),{status:400,code:'INVALID_MONITOR_SETTINGS'});};
 const interval=Number(input.intervalMinutes);
 if(!Number.isInteger(interval)||interval<5||interval>1440)fail('Sync interval must be an integer from 5 to 1440 minutes.');
 for(const k of ['enabled','hourlyEnabled','aiEnabled'])if(typeof input[k]!=='boolean')fail('Monitoring toggles must be true or false.');
 const currency=String(input.displayCurrency||'').toUpperCase();
 if(!/^[A-Z]{3}$/.test(currency))fail('Choose a three-letter reporting currency.');
 if(!input.fxRates||Array.isArray(input.fxRates)||typeof input.fxRates!=='object')fail('Enter exchange rates as a currency-to-rate mapping.');
 const rates={};if(Object.keys(input.fxRates).length>30)fail('A maximum of 30 conversion rates is supported.');
 for(const [code,raw] of Object.entries(input.fxRates)){
  const v=Number(raw);if(!/^[A-Z]{3}$/.test(code)||raw===''||!Number.isFinite(v)||v<=0||v>1e9)fail('Exchange rates must be positive numbers, keyed by currency.');
  if(code===currency&&v!==1)fail('The display currency conversion rate must be 1.');
  rates[code]=v;
 }
 rates[currency]=1;
 const asOf=String(input.fxAsOf||''),source=String(input.fxSource||'').trim();
 if(Object.keys(rates).some(k=>k!==currency)&&(!ISO_DATE.test(asOf)||!Number.isFinite(Date.parse(asOf+'T00:00:00Z'))||asOf>new Date().toISOString().slice(0,10)||source.length<3))fail('Add a non-future exchange-rate date and source before converting currencies.');
 const call=String(input.callActionType||'').trim(),lead=String(input.leadActionType||'lead').trim();
 const validAction=x=>/^[A-Za-z0-9_.:]{1,120}$/.test(x);
 if((call&&!validAction(call))||!validAction(lead))fail('Action types must be exact Meta action_type identifiers, not labels.');
 // Call completion is never inferred from clicks. The user must map a verified action key.
 return{enabled:input.enabled,intervalMinutes:interval,hourlyEnabled:input.hourlyEnabled,aiEnabled:input.aiEnabled,displayCurrency:currency,fxRates:rates,fxAsOf:asOf,fxSource:source.slice(0,200),callActionType:call,leadActionType:lead};
}
export function utcTimestamp(value){
 if(!value)return null;const s=String(value);const n=Date.parse(/Z$|[+-]\d{2}:\d{2}$/.test(s)?s:s.replace(' ','T')+'Z');return Number.isFinite(n)?n:null;
}
export function isDue(lastSuccess,nextAllowed,minutes,now=Date.now()){
 const blocked=utcTimestamp(nextAllowed);if(blocked!==null&&blocked>now)return false;
 const last=utcTimestamp(lastSuccess);return last===null||now-last>=minutes*60000;
}
export function retryDelaySeconds(attempt,code,providerDelay=0){
 if(/EXPIRED|META_190|META_10$|META_200$/.test(code))return Math.max(3600,providerDelay||0);
 const base=/RATE_LIMIT|META_(4|17|32|613|80004|429)$/.test(code)?300:60;
 return Math.min(86400,Math.max(base*2**Math.min(Math.max(0,attempt-1),5),Number(providerDelay)||0));
}
export function convertTotals(rows,settings,field='spend'){
 const missing=new Set();let amount=0,known=0;
 for(const row of rows){
  const value=row[field];if(value===null||value===undefined||!Number.isFinite(Number(value)))continue;
  const rate=row.currency===settings.displayCurrency?1:Number(settings.fxRates[row.currency]);
  if(!Number.isFinite(rate)||rate<=0){missing.add(row.currency);continue;}
  amount+=Number(value)*rate;known++;
 }
 return{currency:settings.displayCurrency,amount:known?Math.round(amount*1e6)/1e6:null,known,selected:rows.length,missingCurrencies:[...missing],complete:known===rows.length,rateDate:settings.fxAsOf||null,source:settings.fxSource||null,estimated:rows.some(x=>x.currency!==settings.displayCurrency)};
}
export function selectedAction(actions,type){
 if(!type)return null;
 const values=Array.isArray(actions)?actions.filter(a=>a.action_type===type):[];
 // Absence means unreported; never mislabel an unsupported conversion as zero.
 if(!values.length)return null;
 const v=Number(values[0].value);return Number.isFinite(v)&&v>=0?v:null;
}
export function metricValues(row,settings=DEFAULT_MONITORING){
 let actions=row.actions_json||row.actions||[];if(typeof actions==='string'){try{actions=JSON.parse(actions);}catch{actions=[];}}
 const num=v=>v===null||v===undefined||v===''?null:(Number.isFinite(Number(v))?Number(v):null);
 return{spend:num(row.spend),impressions:num(row.impressions),allClicks:num(row.clicks),
  linkClicks:num(row.inline_link_clicks)??selectedAction(actions,'link_click'),
  landingPageViews:selectedAction(actions,'landing_page_view'),
  leads:selectedAction(actions,settings.leadActionType),calls:selectedAction(actions,settings.callActionType),
  reportedActions:actions.filter(x=>typeof x?.action_type==='string').map(x=>({type:x.action_type,value:num(x.value)}))};
}
export function sumMetricRows(rows,settings){
 const fields=['spend','impressions','allClicks','linkClicks','landingPageViews','leads','calls'];
 const out=Object.fromEntries(fields.map(k=>[k,null]));const coverage=Object.fromEntries(fields.map(k=>[k,0]));const actionTypes=new Set();
 for(const row of rows){const v=metricValues(row,settings);for(const k of fields)if(v[k]!==null){out[k]=(out[k]??0)+v[k];coverage[k]++;}for(const a of v.reportedActions)actionTypes.add(a.type);}
 return{...out,coverage,actionTypes:[...actionTypes].sort(),rows:rows.length};
}
