import test from 'node:test';
import assert from 'node:assert/strict';
import {policyPreflight,previewPublishing,normalizePageMap,metaCampaignForm,metaAdsetForm,metaCreativeForm,validatePageId} from '../shared/publishing.js';
const media='00000000-0000-4000-8000-000000000001';
const campaign=()=>({name:'Coastal Bangladesh recruitment',currency:'USD',category:'employment',baseBudget:10,increment:2,budgetScope:'PER_ADSET',maxAccountDailyBudget:100,conversion:{type:'WEBSITE',goal:'LINK_CLICKS',websiteUrl:'https://example.com/landing',phone:'',pixelId:''},contents:[{id:'creative-1',title:'Video 1',mediaAssetId:media,caption:'Apply for the job after reviewing the details.',headline:'Recruitment information',cta:'LEARN_MORE'}],targets:[{accountId:'act_123456',label:'CM-01',ageMin:18,ageMax:65,location:'Bangladesh',websiteUrl:'https://example.com/landing'}]});
test('publisher validates distinct account page IDs',()=>{assert.deepEqual(normalizePageMap({'act_123456':'1234567890'},[{accountId:'act_123456'}]),{'act_123456':'1234567890'});assert.throws(()=>validatePageId('act_12345'));});
test('publication creates paused campaign and adset with budget',()=>{
 const p=previewPublishing(campaign());assert.equal(p.expected.combinedDailyMinor,1000);
 assert.equal(metaCampaignForm(p.plan,'run').status,'PAUSED');
 assert.deepEqual(metaCampaignForm(p.plan,'run').special_ad_categories,['EMPLOYMENT']);
 const adset=metaAdsetForm(p.plan,p.plan.allocations[0],p.plan.contents[0],'111',0);
 assert.equal(adset.daily_budget,1000);assert.equal(adset.status,'PAUSED');assert.equal(adset.optimization_goal,'LINK_CLICKS');assert.equal(adset.targeting.geo_locations.countries[0],'BD');
});
test('publisher refuses employment ads with narrowed age',()=>{const d=campaign();d.targets[0].ageMin=21;assert.throws(()=>previewPublishing(d),/Employment targeting/);});
test('publisher flags recruitment in undeclared special category',()=>{const d=campaign();d.category='none';assert.throws(()=>previewPublishing(d),/Employment Special Ad Category/);});
test('publisher refuses unverified pixel goals',()=>{const d=campaign();d.conversion.goal='PURCHASES';d.conversion.pixelId='123456';assert.throws(()=>previewPublishing(d),/currently supports Website link clicks/);});
test('publisher creates image creative with Page ID and CTA',()=>{const p=previewPublishing(campaign());const out=metaCreativeForm(p.plan,p.plan.allocations[0],p.plan.contents[0],{kind:'image',image_hash:'hash123'},'1234567890','abc');assert.equal(out.object_story_spec.page_id,'1234567890');assert.equal(out.object_story_spec.link_data.image_hash,'hash123');assert.equal(out.object_story_spec.link_data.call_to_action.type,'LEARN_MORE');});
test('publisher uses tel destination for call ad',()=>{const d=campaign();d.conversion={type:'CALL',goal:'CALLS',phone:'+8801969918811'};d.contents[0].cta='CALL_NOW';const p=previewPublishing(d);const out=metaCreativeForm(p.plan,p.plan.allocations[0],p.plan.contents[0],{kind:'video',meta_media_id:'12345'},'1234567890','abc');assert.equal(out.object_story_spec.video_data.call_to_action.value.link,'tel:+8801969918811');});
test('publisher calculates increasing budgets across 12 accounts',()=>{const d=campaign();d.targets=Array.from({length:12},(_,i)=>({accountId:`act_${i+10000}`,label:'CM-'+i,ageMin:18,ageMax:65,location:'Bangladesh'}));const p=previewPublishing(d);assert.equal(p.expected.accounts,12);assert.equal(p.plan.allocations[0].totalDailyMinor,1000);assert.equal(p.plan.allocations[11].totalDailyMinor,3200);assert.equal(p.expected.combinedDailyMinor,25200);});
