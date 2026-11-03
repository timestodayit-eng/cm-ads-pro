import test from 'node:test';
import assert from 'node:assert/strict';
import {validateMediaInput,partLength,validateParts,matchesMediaHeader,MAX_VIDEO_BYTES,PART_BYTES} from '../shared/media.js';
import {createMediaService} from '../server/media/service.js';
const fp='a'.repeat(64),client='11111111-1111-4111-8111-111111111111';
const input=(changes={})=>({name:'test.png',size:24,type:'image/png',fingerprint:fp,clientUploadId:client,...changes});
const admin={id:1,role:'super_admin'},manager={id:2,role:'manager'};
const png=new Uint8Array([137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82,0,0,0,1,0,0,0,1]);
function fixture(){
 const rows=new Map();let object=null,parts=[],finishes=0,aborted=0,deleted=0,used=false,createFailure=false,readyFailure=false,previewCount=0;
 const repo={
  async get(id){return rows.get(id)||null;},
  async reserve(a){const existing=[...rows.values()].find(x=>x.client_upload_id===a.client_upload_id);if(existing)return existing;rows.set(a.id,{...a,expires_at:'2099-12-31 00:00:00',created_at:'2026-11-03 00:00:00'});return null;},
  async setUploading(id,uploadId){Object.assign(rows.get(id),{upload_id:uploadId,status:'uploading'});},
  async setState(id,status,error=null){Object.assign(rows.get(id),{status,error_code:error});},
  async claimComplete(id){const a=rows.get(id);if(a.status==='completing')return false;a.status='completing';return true;},
  async ready(id){if(readyFailure){readyFailure=false;throw new Error('Simulated DB interruption');}Object.assign(rows.get(id),{status:'ready',upload_id:null});},
  async claimDelete(id){if(used)throw Object.assign(new Error('Used'),{code:'MEDIA_IN_USE',status:409});rows.get(id).status='deleting';return true;}
 };
 const store={
  async create(){if(createFailure)throw new Error('Simulated storage failure');return 'fixture-upload';},
  async signPart(a,n,len){return `https://storage.invalid/${a.id}?part=${n}&length=${len}`;},
  async list(){return parts;},
  async head(){return object;},
  async header(){return png;},
  async complete(a){finishes++;object={ContentLength:Number(a.byte_size),ContentType:a.mime_type,Metadata:{'coastal-asset-id':a.id}};},
  async abort(){aborted++;},async remove(){deleted++;object=null;},async preview(){previewCount++;return'https://storage.invalid/temporary';}
 };
 const s=createMediaService({repo,store,settings:{bucket:'test-bucket',maxVideoBytes:MAX_VIDEO_BYTES,quotaBytes:50*MAX_VIDEO_BYTES}});
 return{s,repo,store,rows,setParts:p=>parts=p,setObject:o=>object=o,setUsed:()=>used=true,failCreate:()=>createFailure=true,failReady:()=>readyFailure=true,counts:()=>({finishes,aborted,deleted,previewCount})};
}
test('images and videos get fixed safe MIME types from whitelisted extensions',()=>{assert.equal(validateMediaInput(input()).mime,'image/png');assert.equal(validateMediaInput(input({name:'movie.mp4',type:'video/mp4',size:MAX_VIDEO_BYTES})).partCount,128);});
test('one GiB is accepted; one byte larger is rejected',()=>{assert.doesNotThrow(()=>validateMediaInput(input({name:'movie.mp4',type:'video/mp4',size:MAX_VIDEO_BYTES})));assert.throws(()=>validateMediaInput(input({name:'movie.mp4',type:'video/mp4',size:MAX_VIDEO_BYTES+1})),/between/);});
test('30 MiB image cap cannot be bypassed with video limit',()=>assert.throws(()=>validateMediaInput(input({size:31*1024*1024})),/between/));
test('SVG and HTML are rejected',()=>{for(const name of ['x.svg','x.html','x.php','x.exe','x.js'])assert.throws(()=>validateMediaInput(input({name,type:''})));});
test('path traversal and control characters in file names rejected',()=>{for(const name of ['../x.png','x/y.png','a\\b.png','x\u0000.png'])assert.throws(()=>validateMediaInput(input({name})));});
test('incorrect type, fingerprint and empty file rejected',()=>{assert.throws(()=>validateMediaInput(input({type:'text/html'})));assert.throws(()=>validateMediaInput(input({fingerprint:'abc'})));assert.throws(()=>validateMediaInput(input({size:0})));});
test('last multipart chunk has exact size',()=>{assert.equal(partLength(PART_BYTES*2+7,3),7);assert.equal(partLength(PART_BYTES*2,2),PART_BYTES);assert.throws(()=>partLength(100,0));assert.throws(()=>partLength(100,2));});
test('parts are sorted and complete list must cover declared byte size',()=>{const p=[{PartNumber:2,Size:7,ETag:'b'},{PartNumber:1,Size:PART_BYTES,ETag:'a'}];assert.deepEqual(validateParts(p,PART_BYTES+7).map(x=>x.PartNumber),[1,2]);assert.throws(()=>validateParts(p.slice(0,1),PART_BYTES+7));});
test('duplicate and oversized chunks rejected',()=>{assert.throws(()=>validateParts([{PartNumber:1,Size:24,ETag:'a'},{PartNumber:1,Size:24,ETag:'b'}],24));assert.throws(()=>validateParts([{PartNumber:1,Size:25,ETag:'a'}],24));});
test('binary signature validation rejects renamed HTML and accepts PNG/JPEG',()=>{assert.equal(matchesMediaHeader(png,'image/png'),true);assert.equal(matchesMediaHeader(new TextEncoder().encode('<html>hello</html>'),'image/png'),false);assert.equal(matchesMediaHeader(new Uint8Array([255,216,255,0]),'image/jpeg'),true);});
test('HEIC/AVIF cannot masquerade as MP4',()=>{const b=new TextEncoder().encode('0000ftypavif0000');assert.equal(matchesMediaHeader(b,'video/mp4'),false);assert.equal(matchesMediaHeader(new TextEncoder().encode('0000ftypisom0000'),'video/mp4'),true);});
test('initialize stores private key and never exposes upload ID or bucket',async()=>{const f=fixture(),a=await f.s.initialize(input(),admin);assert.equal(a.status,'uploading');assert.equal(a.bucket_name,undefined);assert.equal(a.upload_id,undefined);assert.equal(a.object_key,undefined);});
test('initialize is idempotent for same client request',async()=>{const f=fixture(),a=await f.s.initialize(input(),admin),b=await f.s.initialize(input(),admin);assert.equal(a.id,b.id);assert.equal(f.rows.size,1);});
test('client request ID cannot be reused for another file',async()=>{const f=fixture();await f.s.initialize(input(),admin);await assert.rejects(()=>f.s.initialize(input({fingerprint:'b'.repeat(64)}),admin),e=>e.code==='UPLOAD_CONFLICT');});
test('initialization failure is recorded instead of claiming upload success',async()=>{const f=fixture();f.failCreate();await assert.rejects(()=>f.s.initialize(input(),admin));assert.equal([...f.rows.values()][0].status,'failed');});
test('signing checks owner, bounds and number count',async()=>{const f=fixture(),a=await f.s.initialize(input(),admin);await assert.rejects(()=>f.s.sign(a.id,[1],manager),e=>e.code==='MEDIA_FORBIDDEN');await assert.rejects(()=>f.s.sign(a.id,[2],admin));await assert.rejects(()=>f.s.sign(a.id,[1,1],admin));assert.match((await f.s.sign(a.id,[1],admin)).parts[0].url,/length=24/);});
test('parts endpoint supports safe resume using provider-confirmed parts',async()=>{const f=fixture(),a=await f.s.initialize(input(),admin);f.setParts([{PartNumber:1,Size:24,ETag:'abc'}]);const r=await f.s.parts(a.id,admin);assert.equal(r.parts[0].size,24);assert.equal(r.parts[0].number,1);});
test('successful complete validates object and adds ready library item',async()=>{const f=fixture(),a=await f.s.initialize(input(),admin);f.setParts([{PartNumber:1,Size:24,ETag:'abc'}]);const ready=await f.s.complete(a.id,admin);assert.equal(ready.status,'ready');assert.equal(f.counts().finishes,1);});
test('complete retry does not create duplicate object',async()=>{const f=fixture(),a=await f.s.initialize(input(),admin);f.setParts([{PartNumber:1,Size:24,ETag:'abc'}]);await f.s.complete(a.id,admin);await f.s.complete(a.id,admin);assert.equal(f.counts().finishes,1);});
test('incomplete upload is left resumable',async()=>{const f=fixture(),a=await f.s.initialize(input(),admin);await assert.rejects(()=>f.s.complete(a.id,admin),e=>e.code==='UPLOAD_INCOMPLETE');assert.equal((await f.repo.get(a.id)).status,'uploading');});
test('wrong-sized completed object is removed and rejected',async()=>{const f=fixture(),a=await f.s.initialize(input(),admin);f.setObject({ContentLength:99,ContentType:'image/png',Metadata:{'coastal-asset-id':a.id}});await assert.rejects(()=>f.s.complete(a.id,admin),e=>e.code==='MEDIA_CONTENT_REJECTED');assert.equal(f.counts().deleted,1);assert.equal((await f.repo.get(a.id)).status,'failed');});
test('completed object with foreign asset metadata is rejected',async()=>{const f=fixture(),a=await f.s.initialize(input(),admin);f.setObject({ContentLength:24,ContentType:'image/png',Metadata:{'coastal-asset-id':'other'}});await assert.rejects(()=>f.s.complete(a.id,admin));});
test('database interruption after storage completion is recoverable without re-upload',async()=>{const f=fixture(),a=await f.s.initialize(input(),admin);f.setParts([{PartNumber:1,Size:24,ETag:'abc'}]);f.failReady();await assert.rejects(()=>f.s.complete(a.id,admin));const r=await f.s.complete(a.id,admin);assert.equal(r.status,'ready');assert.equal(f.counts().finishes,1);});
test('upload cannot preview before content verification',async()=>{const f=fixture(),a=await f.s.initialize(input(),admin);await assert.rejects(()=>f.s.preview(a.id,admin),e=>e.code==='MEDIA_NOT_READY');assert.equal(f.counts().previewCount,0);});
test('aborting cancels the multipart session and is idempotent',async()=>{const f=fixture(),a=await f.s.initialize(input(),admin);await f.s.abort(a.id,admin);await f.s.abort(a.id,admin);assert.equal((await f.repo.get(a.id)).status,'aborted');assert.equal(f.counts().aborted,1);});
test('upload cannot be deleted while a saved draft references it',async()=>{const f=fixture(),a=await f.s.initialize(input(),admin);f.setParts([{PartNumber:1,Size:24,ETag:'a'}]);await f.s.complete(a.id,admin);f.setUsed();await assert.rejects(()=>f.s.remove(a.id,admin),e=>e.code==='MEDIA_IN_USE');assert.equal(f.counts().deleted,0);});
test('expired multipart sessions cannot issue new signed URLs',async()=>{const f=fixture(),a=await f.s.initialize(input(),admin);f.rows.get(a.id).expires_at='2020-01-01 00:00:00';await assert.rejects(()=>f.s.sign(a.id,[1],admin),e=>e.code==='UPLOAD_EXPIRED');});
