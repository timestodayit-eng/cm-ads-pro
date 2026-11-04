import test from 'node:test';
import assert from 'node:assert/strict';
import {previewPublishing,metaCampaignForm,metaAdsetForm,metaCreativeForm} from '../shared/publishing.js';
import {interpretVideoStatus,describeMetaError,safeMetaErrorText} from '../shared/meta-diagnostics.js';
const media='00000000-0000-4000-8000-000000000001';
const input=()=>({name:'Recruitment information',currency:'USD',category:'employment',baseBudget:'10',increment:'2',budgetScope:'PER_ADSET',budgetLevel:'AD_SET',conversion:{type:'WEBSITE',goal:'LINK_CLICKS',websiteUrl:'https://example.org/'},contents:[{id:'1',title:'Video 1',caption:'Recruitment campaign',headline:'Read requirements',mediaAssetId:media,cta:'LEARN_MORE'}, {id:'2',title:'Video 2',caption:'Recruitment campaign',headline:'Eligibility',mediaAssetId:media,cta:'LEARN_MORE'}],targets:[{accountId:'act_1234567',ageMin:18,ageMax:65} ]});
test('ABO campaign has zero campaign budget, opts out of sharing, and declares special-ad country',()=>{
 const {plan}=previewPublishing(input());const c=metaCampaignForm(plan,'abc',plan.allocations[0]);
 assert.equal(c.status,'PAUSED');assert.equal(c.is_adset_budget_sharing_enabled,false);
 assert.equal(c.daily_budget,undefined);assert.equal(c.bid_strategy,undefined);
 assert.deepEqual(c.special_ad_category_country,['BD']);
 const a=metaAdsetForm(plan,plan.allocations[0],plan.contents[0],'111',0);
 assert.equal(a.daily_budget,1000);assert.equal(a.bid_strategy,'LOWEST_COST_WITHOUT_CAP');
});
test('CBO explicitly approved uses account combined amount on campaign only, not adsets',()=>{
 const draft=input();draft.budgetLevel='CAMPAIGN';
 const {plan,expected,warnings}=previewPublishing(draft);const c=metaCampaignForm(plan,'abc',plan.allocations[0]);
 assert.equal(c.daily_budget,2000);assert.equal(c.bid_strategy,'LOWEST_COST_WITHOUT_CAP');
 assert.equal(c.is_adset_budget_sharing_enabled,undefined);
 assert.equal(expected.combinedDailyMinor,2000);assert.match(warnings.join(' '),/unevenly/);
 const a=metaAdsetForm(plan,plan.allocations[0],plan.contents[0],'111',0);
 assert.equal(a.daily_budget,undefined);assert.equal(a.bid_strategy,undefined);
 assert.equal(a.status,'PAUSED');
});
test('invalid CBO budget allocation fails instead of creating an unbudgeted campaign',()=>{
 const draft=input();draft.budgetLevel='CAMPAIGN';const {plan}=previewPublishing(draft);
 assert.throws(()=>metaCampaignForm(plan,'abc'),/account allocation/);
});
test('CBO custom cap is not silently translated into an unapproved campaign bid',()=>{
 const draft=input();draft.budgetLevel='CAMPAIGN';draft.advanced={delivery:{bidStrategy:'COST_CAP',bidAmount:'2.00'}};
 assert.throws(()=>previewPublishing(draft),/supports only lowest-cost/);
});
test('Meta video readiness understands the nested video_status object',()=>{
 assert.deepEqual(interpretVideoStatus({status:{video_status:'ready',processing_phase:{status:'complete'}}}),{ready:true,failed:false,value:'ready'});
 assert.deepEqual(interpretVideoStatus({status:{video_status:'processing',processing_phase:{status:'complete'}}}),{ready:false,failed:false,value:'processing'});
 assert.equal(interpretVideoStatus({status:{video_status:'error'}}).failed,true);
 assert.equal(interpretVideoStatus({status:{video_status:'expired'}}).failed,true);
 assert.equal(interpretVideoStatus({status:{video_status:'processing'}}).ready,false);
 assert.equal(interpretVideoStatus({status:{processing_phase:{status:'complete'}}}).ready,false);
});
test('Meta error includes useful detail and subcode but redacts credentials',()=>{
 const e=describeMetaError({code:100,error_subcode:1845423,error_user_title:'No Budget for Campaign',error_user_msg:'Supply campaign daily_budget or use ad set budgeting.'},400);
 assert.equal(e.code,'META_WRITE_100');assert.match(e.message,/No Budget for Campaign/);assert.match(e.message,/daily_budget/);assert.match(e.message,/1845423/);
 const redacted=safeMetaErrorText('https://evil.example/?X-Amz-Signature=secret access_token=topsecret');
 assert.doesNotMatch(redacted,/topsecret|secret/);
});
test('phone creative does not switch advertiser destination when selected separately',()=>{
 const draft=input();draft.conversion={type:'CALL',goal:'CALLS',phone:'+8801969918811'};draft.contents[0].cta='CALL_NOW';
 const {plan}=previewPublishing(draft);const a=metaCreativeForm(plan,plan.allocations[0],plan.contents[0],{kind:'video',meta_media_id:'123456'},'1234567890','run');
 assert.equal(a.object_story_spec.video_data.call_to_action.value.link,'tel:+8801969918811');
});
