// Validation and safe, deterministic data summarization. Never execute AI-generated SQL.
export const ACCOUNT_ID=/^act_\d+$/;
const UUID=/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i;
export function failure(message,code='COPILOT_INVALID',status=400){
 const error=new Error(message);error.status=status;error.code=code;throw error;
}
export function validateAccountScope(input,accessibleIds){
 const accountIds=input==null?[]:input;
 if(!Array.isArray(accountIds)||new Set(accountIds).size!==accountIds.length||accountIds.some(x=>typeof x!=='string'||!ACCOUNT_ID.test(x)))failure('Select unique valid Meta account IDs.');
 if(accountIds.some(x=>!accessibleIds.has(x)))failure('A selected account is not authorized or mapped.','COPILOT_ACCOUNT_DENIED',403);
 return accountIds;
}
export function normalizeDocumentSections(input){
 if(!Array.isArray(input)||input.length<1||input.length>30)failure('Document must contain 1–30 sections.','DOCUMENT_INVALID');
 if(input.reduce((sum,s)=>sum+String(s?.content||'').length,0)>350000)failure('Document exceeds the 350,000-character editor limit.','DOCUMENT_TOO_LARGE');
 const sections=input.map((s,i)=>{
  if(!s||typeof s!=='object'||Array.isArray(s))failure('Invalid document section.','DOCUMENT_INVALID');
  const id=typeof s.id==='string'&&UUID.test(s.id)?s.id:null;
  const heading=String(s.heading||'').trim();
  const content=String(s.content||'').trim();
  if(heading.length<2||heading.length>150||!content||content.length>25000)failure('Each section needs a heading and text (maximum 25,000 characters).','DOCUMENT_INVALID');
  return{id:id||`section-${i+1}`,heading,content};
 });
 if(new Set(sections.map(s=>s.id)).size!==sections.length)failure('Section IDs must be unique.','DOCUMENT_INVALID');
 return sections;
}
const safeMoney=value=>Math.round(Number(value||0)*1e4)/1e4;
// Preserve currency boundaries and the difference between unreported and zero conversions.
export function summarizePerformance(data,maxDetail=35){
 const accounts=Array.isArray(data?.accounts)?data.accounts:[];
 const groups=new Map();
 for(const a of accounts){
  const c=String(a.currency||'UNKNOWN');
  const g=groups.get(c)||{currency:c,accounts:0,spend:0,spendKnown:0,impressions:0,impressionsKnown:0,linkClicks:0,linkClicksKnown:0,leads:0,leadsKnown:0,calls:0,callsKnown:0};
  g.accounts++;
  for(const [field,known] of [['spend','spendKnown'],['impressions','impressionsKnown'],['linkClicks','linkClicksKnown'],['leads','leadsKnown'],['calls','callsKnown']]){
   const v=a.metrics?.[field];if(v!==null&&v!==undefined&&Number.isFinite(Number(v))){g[field]+=Number(v);g[known]++;}
  }
  groups.set(c,g);
 }
 const totals=[...groups.values()].map(g=>({...g,spend:g.spendKnown?safeMoney(g.spend):null,impressions:g.impressionsKnown?g.impressions:null,linkClicks:g.linkClicksKnown?g.linkClicks:null,leads:g.leadsKnown?g.leads:null,calls:g.callsKnown?g.calls:null}));
 const detail=accounts.slice().sort((a,b)=>(Number(b.metrics?.spend)||0)-(Number(a.metrics?.spend)||0)).slice(0,maxDetail).map(a=>({accountId:a.accountId,name:a.name,currency:a.currency,timezone:a.timezone,metrics:a.metrics,syncedAt:a.syncedAt,stale:a.stale,coverage:a.coverage}));
 return{period:data?.period,generatedAt:data?.generatedAt,totalAccounts:accounts.length,currencyTotals:totals,displayedAccountDetails:detail,detailsOmitted:Math.max(0,accounts.length-detail.length),notes:['Currency totals are separate: do not sum USD and BDT directly.','Meta reported call actions do not prove completed calls.','Null conversion metrics mean unavailable, not zero.'],dataFreshness:detail.some(x=>x.stale)?'Some accounts are stale':'See each account sync timestamp'};
}
export function versionLabel(version){return `${Math.floor((version-1)/10)+1}.${(version-1)%10}`;}
export function xmlEscape(value){return String(value??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');}
export function htmlEscape(value){return String(value??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');}
