import test from 'node:test';
import assert from 'node:assert/strict';
import {previewPublishing,metaCreativeForm} from '../shared/publishing.js';
import {pickVideoThumbnail} from '../shared/meta-thumbnail.js';
const media='00000000-0000-4000-8000-000000000001';
const input=()=>({name:'Approved recruitment informational video',currency:'USD',category:'employment',baseBudget:'10',increment:'0',budgetScope:'PER_ADSET',budgetLevel:'AD_SET',conversion:{type:'WEBSITE',goal:'LINK_CLICKS',websiteUrl:'https://example.org/'},contents:[{id:'1',title:'Video 1',caption:'Recruitment information',headline:'Read requirements',mediaAssetId:media,cta:'LEARN_MORE'}],targets:[{accountId:'act_1234567',ageMin:18,ageMax:65}]});
function creative(asset){const {plan}=previewPublishing(input());return metaCreativeForm(plan,plan.allocations[0],plan.contents[0],asset,'1234567890','run');}
test('Meta video creative contains preferred thumbnail URL and no conflicting hash',()=>{
 const c=creative({kind:'video',meta_media_id:'123456789',thumbnail_url:'https://scontent.xx.fbcdn.net/thumbnail.jpg'});
 assert.equal(c.object_story_spec.video_data.image_url,'https://scontent.xx.fbcdn.net/thumbnail.jpg');
 assert.equal(c.object_story_spec.video_data.image_hash,undefined);
 assert.equal(c.object_story_spec.video_data.video_id,'123456789');
});
test('Existing Meta account image hash takes precedence over URL',()=>{
 const c=creative({kind:'video',meta_media_id:'123456789',image_hash:'abcabc123',thumbnail_url:'https://scontent.xx.fbcdn.net/thumb.jpg'});
 assert.equal(c.object_story_spec.video_data.image_hash,'abcabc123');
 assert.equal(c.object_story_spec.video_data.image_url,undefined);
});
test('Never send a video creative to Meta without image_hash or image_url',()=>{
 assert.throws(()=>creative({kind:'video',meta_media_id:'123456789'}),/thumbnail is required/);
});
test('Preferred Meta video thumbnail is selected and plain picture is fallback',()=>{
 assert.equal(pickVideoThumbnail({data:[{uri:'https://a.fbcdn.net/1.jpg',is_preferred:false},{uri:'https://b.fbcdn.net/2.jpg',is_preferred:true}]}),'https://b.fbcdn.net/2.jpg');
 assert.equal(pickVideoThumbnail({picture:'https://scontent.xx.fbcdn.net/picture.jpg'}),'https://scontent.xx.fbcdn.net/picture.jpg');
 assert.equal(pickVideoThumbnail({data:[{uri:'http://insecure.test/thumb.jpg',is_preferred:true}]}),null);
 assert.equal(pickVideoThumbnail({thumbnails:{data:[{uri:'https://a.fbcdn.net/thumb.jpg'}]}}),'https://a.fbcdn.net/thumb.jpg');
});
