import {buildPlan} from './planning.js';
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
export function metaCampaignForm(plan,tag){return{name:`${plan.name} [${tag}]`,objective:'OUTCOME_TRAFFIC',buying_type:'AUCTION',status:'PAUSED',special_ad_categories:plan.category==='employment'?['EMPLOYMENT']:[],bid_strategy:'LOWEST_COST_WITHOUT_CAP'};}
export function metaAdsetForm(plan,allocation,content,metaCampaignId,index){
 const item=allocation.adsets[index];if(!item||item.dailyMinor<1)throw new Error('Invalid allocated adset daily budget.');
 const targeting={geo_locations:{countries:['BD']},age_min:allocation.ageMin,age_max:allocation.ageMax};
 const form={name:`${plan.name} / ${content.title}`.slice(0,250),campaign_id:metaCampaignId,daily_budget:item.dailyMinor,billing_event:'IMPRESSIONS',optimization_goal:plan.conversion.type==='WEBSITE'?plan.conversion.goal:'LINK_CLICKS',bid_strategy:'LOWEST_COST_WITHOUT_CAP',targeting,status:'PAUSED'};
 if(allocation.startAt)form.start_time=new Date(allocation.startAt).toISOString();
 if(allocation.endAt)form.end_time=new Date(allocation.endAt).toISOString();
 return form;
}
export function metaCreativeForm(plan,allocation,content,asset,pageId,tag){
 const link=plan.conversion.type==='CALL'?`tel:${allocation.phone}`:allocation.websiteUrl;
 const call_to_action={type:content.cta,value:{link}};
 const payload=asset.kind==='video'?{video_data:{video_id:asset.meta_media_id,message:content.caption,title:content.headline,link_description:content.description||undefined,call_to_action}}:
 {link_data:{image_hash:asset.image_hash,link,message:content.caption,name:content.headline,description:content.description||undefined,call_to_action}};
 if(asset.kind==='video'&&!asset.meta_media_id||asset.kind==='image'&&!asset.image_hash)throw new Error('Meta media asset is not yet ready.');
 return{name:`${content.title} [${tag}]`,object_story_spec:{page_id:pageId,...payload}};
}
