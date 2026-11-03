import {DEFAULT_MONITORING,metricValues} from './monitoring.js';
export function ratio(n,d,multiplier=1){return n!==null&&n!==undefined&&d>0?Math.round((n/d)*multiplier*10000)/10000:null;}
export function aggregate(rows,accountMap,settings=DEFAULT_MONITORING){
 const ads=new Map(),accounts=new Map(),currencies=new Map();
 const fields=['spend','impressions','clicks','reported_leads','link_clicks','landing_page_views','reported_calls'];
 const seed=()=>({spend:0,impressions:0,clicks:0,reported_leads:null,link_clicks:null,landing_page_views:null,reported_calls:null});
 for(const row of rows){
  const a=accountMap[row.account_id];if(!a)continue;
  const ref=`ad:${row.account_id}:${row.ad_id}`;
  if(!ads.has(ref))ads.set(ref,{ref,account_ref:`account:${row.account_id}`,currency:a.currency,...seed()});
  const ad=ads.get(ref),v=metricValues(row,settings);
  const values={spend:v.spend,impressions:v.impressions,clicks:v.allClicks,reported_leads:v.leads,link_clicks:v.linkClicks,landing_page_views:v.landingPageViews,reported_calls:v.calls};
  for(const f of fields)if(values[f]!==null)ad[f]=(ad[f]??0)+values[f];
 }
 const metrics=x=>({...x,spend:Math.round(x.spend*1e6)/1e6,ctr_pct:ratio(x.clicks,x.impressions,100),link_ctr_pct:ratio(x.link_clicks,x.impressions,100),cpc:ratio(x.spend,x.clicks),link_cpc:ratio(x.spend,x.link_clicks),cpm:ratio(x.spend,x.impressions,1000),cost_per_reported_lead:ratio(x.spend,x.reported_leads)});
 for(const ad of ads.values()){
  if(!accounts.has(ad.account_ref))accounts.set(ad.account_ref,{ref:ad.account_ref,currency:ad.currency,...seed()});
  if(!currencies.has(ad.currency))currencies.set(ad.currency,{ref:`total:${ad.currency}`,currency:ad.currency,...seed()});
  for(const f of fields)if(ad[f]!==null){accounts.get(ad.account_ref)[f]=(accounts.get(ad.account_ref)[f]??0)+ad[f];currencies.get(ad.currency)[f]=(currencies.get(ad.currency)[f]??0)+ad[f];}
 }
 return{totals:[...currencies.values()].map(metrics),accounts:[...accounts.values()].map(metrics),ads:[...ads.values()].map(metrics)};
}
export const reportSchema={type:'object',additionalProperties:false,properties:{summary:{type:'string'},findings:{type:'array',items:{type:'object',additionalProperties:false,properties:{severity:{type:'string',enum:['info','watch','high']},title:{type:'string'},observation:{type:'string'},evidence_refs:{type:'array',items:{type:'string'}},next_step:{type:'string'}},required:['severity','title','observation','evidence_refs','next_step']}},data_limitations:{type:'array',items:{type:'string'}},needs_human_review:{type:'boolean',enum:[true]}},required:['summary','findings','data_limitations','needs_human_review']};
export function validateReport(report,snapshot){
 if(!report||typeof report.summary!=='string'||report.summary.length>12000||!Array.isArray(report.findings)||report.findings.length>20||report.needs_human_review!==true||!Array.isArray(report.data_limitations)||!report.data_limitations.every(x=>typeof x==='string'))throw new Error('Invalid AI report structure');
 const refs=new Set([...snapshot.totals,...snapshot.accounts,...snapshot.ads].map(x=>x.ref));
 for(const f of report.findings){if(!['info','watch','high'].includes(f.severity)||!['title','observation','next_step'].every(k=>typeof f[k]==='string')||!Array.isArray(f.evidence_refs)||f.evidence_refs.length===0||!f.evidence_refs.every(r=>refs.has(r)))throw new Error('AI returned missing or unknown evidence references');}
 return report;
}
export function extractResponseText(data){
 if(data.status!=='completed')throw new Error('OpenAI response incomplete');
 const parts=(data.output||[]).filter(x=>x.type==='message').flatMap(x=>x.content||[]);
 if(parts.some(x=>x.type==='refusal'))throw new Error('OpenAI refused the report');
 const text=parts.filter(x=>x.type==='output_text').map(x=>x.text).join('');if(!text)throw new Error('OpenAI returned no report');return text;
}
