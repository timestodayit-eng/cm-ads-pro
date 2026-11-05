import {buildPlan} from './planning.js';
import {targetingSpec,advancedWarnings} from './advanced.js';
const accountRE=/^act_[0-9]+$/;
const idRE=/^[0-9]{5,40}$/;
const recruitmentRE=/(?:recruit|hiring|vacancy|jobs?\b|employment|worker|salary|work abroad|\u09a8\u09bf\u09df\u09cb\u0997|\u099a\u09be\u0995\u09b0\u09bf|\u0995\u09b0\u09cd\u09ae\u09c0|\u09ac\u09c7\u09a4\u09a8)/i;
export function validatePageId(value){if(!idRE.test(String(value||'')))throw Object.assign(new Error('Enter the real authorized Facebook Page ID for each account.'),{status:400,code:'PAGE_ID_REQUIRED'});return String(value);}
export function policyPreflight(plan){
 const warnings=[];
 if(!plan||!Array.isArray(plan.allocations)||!plan.allocations.length)throw new Error('Choose connected accounts first.');
 if(plan.conversion?.type!=='CALL'&&plan.conversion?.type!=='WEBSITE')throw new Error('Set Call or Website conversion before publishing.');
 if(plan.conversion.type==='WEBSITE'&&!['LINK_CLICKS','LANDING_PAGE_VIEWS'].includes(plan.conversion.goal))throw new Error('Live publishing currently supports Website link clicks or landing-page views; Pixel conversion optimization needs separate verification.');
 if(plan.contents.some(c=>!c.mediaAssetId))throw new Error('Every content item must have a ready uploaded media file.');
 if(plan.category!=='employment'&&(recruitmentRE.test(plan.name)||plan.contents.some(c=>recruitmentRE.test(`${c.title} ${c.caption} ${c.headline} ${c.description}`))))throw new Error('Recruitment/employment ads must be classified under the applicable Employment Special Ad Category.');
 if(plan.category==='employment'){
  for(const a of plan.allocations){if(a.ageMin!==18||a.ageMax!==65)throw new Error('Employment targeting restrictions: use broad ages 18-65+; age variations require separate Meta eligibility review.');}
  warnings.push('Employment special-ad rules and account eligibility must be verified by Meta; creation may be rejected.');
 }
 warnings.push(...advancedWarnings(plan.advanced,plan.category));
 if(plan.budgetMode==='CAMPAIGN'){
  if(plan.advanced.delivery.bidStrategy!=='LOWEST_COST_WITHOUT_CAP')throw new Error('Campaign budget mode currently supports only lowest-cost bidding.');
  warnings.push('CAMPAIGN BUDGET: Meta can allocate the total unevenly among ad sets; individual content budgets are not fixed. This choice must be explicitly approved.');
 }
 if(plan.conversion.type==='CALL')warnings.push('Call-to-action availability and click-to-call delivery depend on Meta objective, placement and account eligibility. A CTA click is not a completed call.');
 warnings.push('All campaigns, ad sets and ads are created PAUSED. No spend starts until explicit activation approval.');
 return warnings;
}
export function previewPublishing(input){
 const plan=buildPlan(input);
 const warnings=policyPreflight(plan);
 const count=plan.allocations.length;
 if(plan.currency!=='USD'&&plan.currency!=='BDT')throw new Error('Unsupported campaign currency.');
 return{plan,warnings,expected:{accounts:count,campaigns:count,adsets:count*plan.contents.length,ads:count*plan.contents.length,combinedDailyMinor:plan.totals.dailyMinor,currency:plan.currency}};
}
export function normalizePageMap(map,allocations){
 if(!map||typeof map!=='object'||Array.isArray(map))throw new Error('Page ID mapping missing.');
 const result={};for(const a of allocations){if(!accountRE.test(a.accountId))throw new Error('Invalid account selection.');result[a.accountId]=validatePageId(map[a.accountId]);}
 return result;
}
// ABO: put the daily budget and bid strategy on each ad set, not on the campaign.
export function metaCampaignForm(plan,tag,allocation=null){
 const advanced=plan.advanced;
 const campaign={name:`${plan.name} [${tag}]`,objective:advanced.delivery.performance==='DEFAULT'?'OUTCOME_TRAFFIC':'OUTCOME_AWARENESS',buying_type:'AUCTION',status:'PAUSED',special_ad_categories:plan.category==='employment'?['EMPLOYMENT']:[]};
 if(plan.category==='employment'){
  // A Special Ad Category must be paired with the country where people will
  // see the ad. Use the already approved geography, never a guessed default.
  campaign.special_ad_category_country=[...advanced.audience.countries];
 }
 if(plan.budgetMode==='CAMPAIGN'){
  if(!allocation||!Number.isSafeInteger(allocation.totalDailyMinor)||allocation.totalDailyMinor<1)throw new Error('Campaign budget needs the selected account allocation.');
  // Campaign budget is explicitly chosen by the advertiser; never automatically
  // change ABO budgets into Advantage+ campaign budget on a Meta error.
  campaign.daily_budget=allocation.totalDailyMinor;
  campaign.bid_strategy=advanced.delivery.bidStrategy;
  if(advanced.delivery.bidStrategy!=='LOWEST_COST_WITHOUT_CAP')throw new Error('Campaign budget with bid/cost cap needs dedicated Meta validation; use lowest cost first.');
 }else{
  campaign.is_adset_budget_sharing_enabled=false;
 }
 return campaign;
}
export function metaAdsetForm(plan,allocation,content,metaCampaignId,index,pageId=null){
 const item=allocation.adsets[index];if(!item||item.dailyMinor<1)throw new Error('Invalid allocated adset daily budget.');
 const targeting=targetingSpec(plan.advanced,allocation);
 const delivery=plan.advanced.delivery;
 const goal=delivery.performance==='DEFAULT'?(plan.conversion.type==='WEBSITE'?plan.conversion.goal:'LINK_CLICKS'):delivery.performance;
 const form={name:`${plan.name} / ${content.title}`.slice(0,250),campaign_id:metaCampaignId,billing_event:'IMPRESSIONS',optimization_goal:goal,targeting,status:'PAUSED'};
 if(plan.budgetMode!=='CAMPAIGN'){form.daily_budget=item.dailyMinor;form.bid_strategy=delivery.bidStrategy;}
 if(delivery.bidStrategy!=='LOWEST_COST_WITHOUT_CAP'){
  if(plan.budgetMode==='CAMPAIGN')throw new Error('CBO bid/cost cap requires a separately verified setup.');
  form.bid_amount=Math.round(Number(delivery.bidAmount)*100);
 }
 if(delivery.frequencyCap)form.frequency_control_specs=[{event:'IMPRESSIONS',interval_days:delivery.frequencyCap.days,max_frequency:delivery.frequencyCap.count}];
 if(plan.conversion.type==='CALL'){
  // A click-to-call conversion location must be declared on the ad set, not
  // inferred solely from the CALL_NOW button in the creative.
  form.destination_type='PHONE_CALL';
  if(pageId)form.promoted_object={page_id:validatePageId(pageId)};
 }
 if(allocation.startAt)form.start_time=new Date(allocation.startAt).toISOString();
 if(allocation.endAt)form.end_time=new Date(allocation.endAt).toISOString();
 return form;
}
export function metaCreativeForm(plan,allocation,content,asset,pageId,tag){
 const link=plan.conversion.type==='CALL'?`tel:${allocation.phone}`:allocation.websiteUrl;
 const call_to_action={type:content.cta,value:{link}};
 const thumbnail=asset.image_hash?{image_hash:asset.image_hash}:asset.thumbnail_url?{image_url:asset.thumbnail_url}:null;
 if(asset.kind==='video'&&!thumbnail)throw Object.assign(new Error('Meta video thumbnail is required before creating an ad creative.'),{code:'META_VIDEO_THUMBNAIL_MISSING'});
 const payload=asset.kind==='video'?{video_data:{video_id:asset.meta_media_id,...thumbnail,message:content.caption,title:content.headline,link_description:content.description||undefined,call_to_action}}:
 {link_data:{image_hash:asset.image_hash,link,message:content.caption,name:content.headline,description:content.description||undefined,call_to_action}};
 if(asset.kind==='video'&&!asset.meta_media_id||asset.kind==='image'&&!asset.image_hash)throw new Error('Meta media asset is not yet ready.');
 return{name:`${content.title} [${tag}]`,object_story_spec:{page_id:pageId,...payload}};
}
