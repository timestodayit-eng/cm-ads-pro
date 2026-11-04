import {normalizeAdvanced} from './advanced.js';
function fail(message){throw Object.assign(new Error(message),{status:400,code:'INVALID_DRAFT'});}
export function budgetMinor(value){
 if(value===null||value===undefined||String(value).trim()==='')fail('Enter a budget amount.');
 const n=Number(value);if(!Number.isFinite(n)||Math.abs(n*100-Math.round(n*100))>1e-6)fail('Budgets must have at most two decimal places.');return Math.round(n*100);
}
export function httpsDestination(value){
 try{const u=new URL(String(value||''));if(u.protocol!=='https:'||u.username||u.password||!u.hostname||u.href.length>2000)fail('Use an HTTPS website URL without a username or password.');return u.href;}
 catch{fail('Enter a valid HTTPS destination URL.');}
}
export function phoneDestination(value){const phone=String(value||'').replace(/[ ()-]/g,'');if(!/^\+[1-9]\d{6,14}$/.test(phone))fail('Use an international phone number, for example +8801969918811.');return phone;}
export function planBudgets(draft){
 if(!['USD','BDT'].includes(draft.currency))fail('This budget builder supports USD or BDT only.');
 const n=draft.contents?.length,targets=draft.targets;
 if(!Number.isInteger(n)||n<1||n>20)fail('Add 1-20 creative items.');
 if(!Array.isArray(targets)||targets.length<1||new Set(targets.map(t=>t.accountId)).size!==targets.length)fail('Choose one or more unique accounts.');
 const base=budgetMinor(draft.baseBudget),increment=budgetMinor(draft.increment);
 if(base<=0||base>10000000||increment<0||increment>10000000)fail('Starting budget must be positive; increment must be zero or positive (maximum 100,000).');
 const scope=draft.budgetScope||'PER_ADSET';if(!['PER_ADSET','ACCOUNT_TOTAL'].includes(scope))fail('Choose a valid budget scope.');
 const cap=draft.maxAccountDailyBudget!==''&&draft.maxAccountDailyBudget!=null?budgetMinor(draft.maxAccountDailyBudget):null;
 if(cap!==null&&cap<=0)fail('The optional account budget ceiling must be positive.');
 const seen=new Set();
 return targets.map((t,i)=>{
  if(!/^act_[0-9]+$/.test(t.accountId||'')||seen.has(t.accountId))fail('Select unique, connected Meta accounts.');seen.add(t.accountId);
  const amount=t.budgetOverride!==null&&t.budgetOverride!==undefined&&t.budgetOverride!==''?budgetMinor(t.budgetOverride):base+increment*i;
  if(amount<=0||amount>10000000)fail(`Account ${i+1}: budget must be positive and at most 100,000.`);
  const total=scope==='ACCOUNT_TOTAL'?amount:amount*n;
  if(total<n)fail(`Account ${i+1}: the daily account amount cannot give each ad set even one minor currency unit.`);
  if(cap!==null&&total>cap)fail(`Account ${i+1}: ${draft.currency} ${(total/100).toFixed(2)} daily plan exceeds your account budget ceiling.`);
  const adsets=Array.from({length:n},(_,j)=>({contentId:String(draft.contents[j].id||`creative-${j+1}`),dailyMinor:scope==='ACCOUNT_TOTAL'?Math.floor(amount/n)+(j<amount%n?1:0):amount}));
  return {accountId:t.accountId,label:String(t.label||t.accountId).slice(0,100),order:i+1,ruleMinor:base+increment*i,inputBudgetMinor:amount,
   perAdsetMinor:adsets.every(x=>x.dailyMinor===adsets[0].dailyMinor)?adsets[0].dailyMinor:null,totalDailyMinor:total,adsets,budgetOverride:t.budgetOverride??null};
 });
}
export function buildPlan(draft){
 if(!draft||typeof draft!=='object')fail('Missing draft.');
 const name=String(draft.name||'').trim();if(!name||name.length>150)fail('Campaign name must be 1-150 characters.');
 const allocations=planBudgets(draft);
 let conversion=null;
 if(draft.conversion){
  const c=draft.conversion;if(!['CALL','WEBSITE'].includes(c.type))fail('Choose Call ad or Website destination.');
  const allowed=c.type==='CALL'?['CALLS']:['LINK_CLICKS','LANDING_PAGE_VIEWS','LEADS','PURCHASES'];
  if(!allowed.includes(c.goal))fail('Choose an appropriate performance goal for the destination.');
  const pixelId=String(c.pixelId||'').trim();
  if(c.type==='WEBSITE'&&['LEADS','PURCHASES'].includes(c.goal)&&!/^\d{5,30}$/.test(pixelId))fail('Website lead/purchase optimization requires your actual Meta Pixel/Dataset ID.');
  conversion={type:c.type,goal:c.goal,phone:c.type==='CALL'&&c.phone?phoneDestination(c.phone):'',websiteUrl:c.type==='WEBSITE'&&c.websiteUrl?httpsDestination(c.websiteUrl):'',pixelId:c.type==='WEBSITE'?pixelId:'',event:c.goal==='LEADS'?'Lead':c.goal==='PURCHASES'?'Purchase':null};
 }
 if(allocations.reduce((s,x)=>s+x.totalDailyMinor,0)>Number.MAX_SAFE_INTEGER)fail('Combined daily budget is too large to calculate safely. Split your approval into smaller batches.');
 const creatives=draft.contents.map((c,i)=>{
  if(!String(c.caption||'').trim()||String(c.caption).length>5000)fail(`Creative ${i+1}: add a caption (maximum 5000 characters).`);
  if(!String(c.headline||'').trim()||String(c.headline).length>255)fail(`Creative ${i+1}: add a headline (maximum 255 characters).`);
  if(c.mediaUrl)httpsDestination(c.mediaUrl);
  if(c.mediaAssetId&&!/^[a-f0-9-]{36}$/i.test(c.mediaAssetId))fail('Choose a valid uploaded media asset.');
  const allowedCTA=conversion?.type==='CALL'?['CALL_NOW']:conversion?.type==='WEBSITE'?['LEARN_MORE','SIGN_UP','APPLY_NOW','CONTACT_US','SHOP_NOW']:['CALL_NOW','LEARN_MORE','SEND_MESSAGE'];
  const cta=allowedCTA.includes(c.cta)?c.cta:allowedCTA[0];
  return{id:String(c.id||`creative-${i+1}`).slice(0,80),title:String(c.title||`Content ${i+1}`).slice(0,150),mediaAssetId:c.mediaAssetId||null,mediaName:String(c.mediaName||'').slice(0,240),mediaUrl:String(c.mediaUrl||'').slice(0,2000),caption:c.caption,headline:c.headline,description:String(c.description||'').slice(0,1000),cta};
 });
 allocations.forEach((a,i)=>{
  const t=draft.targets[i],ageMin=Number(t.ageMin??18),ageMax=Number(t.ageMax??65);
  if(!Number.isInteger(ageMin)||!Number.isInteger(ageMax)||ageMin<18||ageMax>65||ageMin>ageMax)fail('Audience age range must be 18-65 (65 represents 65+).');
  for(const k of ['startAt','endAt'])if(t[k]&&!Number.isFinite(Date.parse(t[k])))fail('Invalid schedule date.');
  if(t.startAt&&t.endAt&&Date.parse(t.endAt)<=Date.parse(t.startAt))fail('End time must be after start time.');
  const phone=conversion?.type==='CALL'?phoneDestination(t.phone||conversion.phone):String(t.phone||'');
  if(!conversion&&phone&&!/^\+?[0-9 ()-]{6,25}$/.test(phone))fail('Invalid phone destination.');
  const websiteUrl=conversion?.type==='WEBSITE'?httpsDestination(t.websiteUrl||conversion.websiteUrl):'';
  Object.assign(a,{ageMin,ageMax,phone,websiteUrl,location:String(t.location||'Bangladesh').slice(0,150),startAt:t.startAt||null,endAt:t.endAt||null});
 });
 const category=draft.category==='employment'?'employment':'none';
 const advanced=normalizeAdvanced(draft.advanced,category,conversion);
 return {name,currency:draft.currency,category,advanced,budgetMode:'AD_SET',budgetScope:draft.budgetScope||'PER_ADSET',conversion,contents:creatives,allocations,
  totals:{campaigns:allocations.length,adsets:allocations.length*creatives.length,ads:allocations.length*creatives.length,dailyMinor:allocations.reduce((s,x)=>s+x.totalDailyMinor,0)},
  warnings:['Saving a plan does not publish ads. Live creation requires a separate paused publishing approval and a configured Meta connection.','Category, destination eligibility, Pixel events, targeting and minimum Meta budgets must be validated before publishing.','Daily budgets are planning values, not guaranteed exact daily charges.','The increment applies between selected accounts in the displayed order, not automatically over time.']};
}
