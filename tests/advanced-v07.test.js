import test from 'node:test';
import assert from 'node:assert/strict';
import {buildPlan} from '../shared/planning.js';
import {previewPublishing,metaCampaignForm,metaAdsetForm} from '../shared/publishing.js';
import {defaultAdvanced,normalizeAdvanced,targetingSpec} from '../shared/advanced.js';
const media='00000000-0000-4000-8000-000000000001';
function sample({category='employment',type='CALL'}={}){
 return{name:'Recruitment information test',currency:'USD',category,baseBudget:10,increment:0,budgetScope:'ACCOUNT_TOTAL',conversion:type==='CALL'?{type:'CALL',goal:'CALLS',phone:'+8801969918811'}:{type:'WEBSITE',goal:'LINK_CLICKS',websiteUrl:'https://example.com'},contents:[{id:'1',mediaAssetId:media,title:'One',caption:'Job opportunities',headline:'Company information',cta:type==='CALL'?'CALL_NOW':'LEARN_MORE'}],targets:[{accountId:'act_12345',ageMin:18,ageMax:65,location:'Bangladesh'}],advanced:defaultAdvanced()};
}
test('v0.7 legacy plans default to broad Bangladesh and automated placement',()=>{
 const d=sample();delete d.advanced;const p=previewPublishing(d).plan;
 assert.deepEqual(p.advanced.audience.countries,['BD']);const adset=metaAdsetForm(p,p.allocations[0],p.contents[0],'12345',0);
 assert.deepEqual(adset.targeting.targeting_automation,{advantage_audience:0});
 assert.equal(adset.targeting.publisher_platforms,undefined);
});
test('employment cannot select narrow interest, custom audience, gender or manual targeting',()=>{
 const d=sample();d.advanced.audience={...d.advanced.audience,gender:'MALE'};
 assert.throws(()=>buildPlan(d),/all genders/);
 d.advanced.audience.gender='ALL';d.advanced.audience.mode='MANUAL';
 assert.throws(()=>buildPlan(d),/Broad or Advantage/);
 d.advanced.audience.mode='ADVANTAGE_PLUS';d.advanced.audience.interestIds=['6003139266461'];
 assert.throws(()=>buildPlan(d),/unverified detailed/);
});
test('Advantage+ audience and multi-country targeting are forwarded to Meta',()=>{
 const d=sample();d.advanced.audience.mode='ADVANTAGE_PLUS';d.advanced.audience.countries=['BD','MY'];const p=previewPublishing(d).plan;
 const target=targetingSpec(p.advanced,p.allocations[0]);
 assert.deepEqual(target.geo_locations.countries,['BD','MY']);assert.deepEqual(target.targeting_automation,{advantage_audience:1});
});
test('manual facebook and instagram placements are mapped exactly',()=>{
 const d=sample();d.advanced.placements={mode:'MANUAL',facebook:['feed','facebook_reels'],instagram:['reels','story'],messenger:[],audience_network:[],devices:['mobile']};
 const p=previewPublishing(d).plan;const form=metaAdsetForm(p,p.allocations[0],p.contents[0],'4567',0);
 assert.deepEqual(form.targeting.publisher_platforms,['facebook','instagram']);
 assert.deepEqual(form.targeting.facebook_positions,['feed','facebook_reels']);
 assert.deepEqual(form.targeting.instagram_positions,['reels','story']);
 assert.deepEqual(form.targeting.device_platforms,['mobile']);
});
test('reject deprecated/unknown placements and blank manual selection',()=>{
 const a=defaultAdvanced();a.placements.mode='MANUAL';
 assert.throws(()=>normalizeAdvanced(a,'employment',{type:'CALL',goal:'CALLS'}),/Select at least one placement/);
 a.placements.instagram=['explore'];
 assert.throws(()=>normalizeAdvanced(a,'employment',{type:'CALL',goal:'CALLS'}),/Unsupported instagram placement/);
});
test('Reach campaigns map to awareness and frequency cap',()=>{
 const d=sample({type:'WEBSITE'});d.advanced.delivery={...d.advanced.delivery,performance:'REACH',frequencyCap:{count:2,days:7}};
 const p=previewPublishing(d).plan;
 assert.equal(metaCampaignForm(p,'tag').objective,'OUTCOME_AWARENESS');
 const adset=metaAdsetForm(p,p.allocations[0],p.contents[0],'123',0);
 assert.equal(adset.optimization_goal,'REACH');
 assert.deepEqual(adset.frequency_control_specs,[{event:'IMPRESSIONS',interval_days:7,max_frequency:2}]);
});
test('frequency cap fails outside Reach, or for call campaigns',()=>{
 const d=sample({type:'CALL'});d.advanced.delivery.performance='REACH';
 assert.throws(()=>buildPlan(d),/requires a Website destination/);
 const d2=sample({type:'WEBSITE'});d2.advanced.delivery.frequencyCap={count:2,days:7};
 assert.throws(()=>buildPlan(d2),/requires Awareness/);
});
test('manual interest IDs for non-employment are validated and passed through',()=>{
 const d=sample({category:'none'});d.name='General company awareness';d.contents[0].caption='Our company';d.contents[0].headline='Our latest update';d.advanced.audience.mode='MANUAL';d.advanced.audience.gender='FEMALE';d.advanced.audience.interestIds=['6003139266461'];
 const p=previewPublishing(d).plan;
 assert.deepEqual(targetingSpec(p.advanced,p.allocations[0]).interests,[{id:'6003139266461'}]);
 assert.deepEqual(targetingSpec(p.advanced,p.allocations[0]).genders,[2]);
});
test('bid caps are stored in minor account units and unsupported values rejected',()=>{
 const d=sample();d.advanced.delivery.bidStrategy='LOWEST_COST_WITH_BID_CAP';d.advanced.delivery.bidAmount='1.25';
 const p=previewPublishing(d).plan;const adset=metaAdsetForm(p,p.allocations[0],p.contents[0],'123',0);
 assert.equal(adset.bid_amount,125);assert.equal(adset.bid_strategy,'LOWEST_COST_WITH_BID_CAP');
 d.advanced.delivery.bidAmount='-2';assert.throws(()=>buildPlan(d),/valid positive/);
});
test('reject unknown targeting and object injection via client',()=>{
 const a=defaultAdvanced();a.placements.mode='MANUAL';a.placements.facebook=['__proto__'];
 assert.throws(()=>normalizeAdvanced(a,'none',{type:'WEBSITE',goal:'LINK_CLICKS'}),/Unsupported facebook placement/);
 a.placements={...defaultAdvanced().placements};a.audience.interestIds=['123'];a.audience.mode='MANUAL';
 assert.throws(()=>normalizeAdvanced(a,'none',{type:'WEBSITE',goal:'LINK_CLICKS'}),/valid numeric Meta ID/);
});
