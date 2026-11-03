import { randomUUID } from 'node:crypto';
import { validateMediaInput, partLength, validateParts, matchesMediaHeader, mediaError } from '../../shared/media.js';
export const publicMedia = (a, user) => ({
 id:a.id,name:a.original_name,type:a.mime_type,kind:a.kind,size:Number(a.byte_size),fingerprint:a.fingerprint,
 status:a.status,partSize:Number(a.part_size),partCount:Math.ceil(Number(a.byte_size)/Number(a.part_size)),
 createdAt:a.created_at,completedAt:a.completed_at,expiresAt:a.expires_at,errorCode:a.error_code||null,
 draftCount:Number(a.draft_count)||0,canManage:Number(a.owner_id)===Number(user?.id)||user?.role==='super_admin'
});
export function createMediaService({repo,store,settings}){
 async function get(id){if(!/^[a-f0-9-]{36}$/i.test(id))throw mediaError('File not found.','MEDIA_NOT_FOUND',404);const a=await repo.get(id);if(!a||a.status==='deleted')throw mediaError('File not found.','MEDIA_NOT_FOUND',404);return a;}
 function manage(a,user){if(Number(a.owner_id)!==Number(user.id)&&user.role!=='super_admin')throw mediaError('Only the uploader or an administrator can manage this upload.','MEDIA_FORBIDDEN',403);}
 function active(a){if(!['uploading','completing'].includes(a.status))throw mediaError('This upload is not active. Select the file to start a new upload.','UPLOAD_INACTIVE',409);if(Date.parse(String(a.expires_at).replace(' ','T')+'Z')<Date.now())throw mediaError('This upload expired. Cancel it and start again.','UPLOAD_EXPIRED',409);}
 return {
  async initialize(input,user){
   const v=validateMediaInput(input,settings.maxVideoBytes);
   if(!/^[a-f0-9-]{36}$/i.test(input.clientUploadId||''))throw mediaError('Missing upload request ID.');
   const id=randomUUID();const a={id,client_upload_id:input.clientUploadId,owner_id:user.id,original_name:v.name,mime_type:v.mime,kind:v.kind,byte_size:v.bytes,fingerprint:v.fingerprint,
    object_key:`coastal-media/${id}.${v.extension}`,bucket_name:settings.bucket,part_size:v.partSize,status:'initializing'};
   const existing=await repo.reserve(a,settings.quotaBytes);
   if(existing){manage(existing,user);if(existing.fingerprint!==v.fingerprint||Number(existing.byte_size)!==v.bytes||existing.mime_type!==v.mime)throw mediaError('An upload request cannot be reused for a different file.','UPLOAD_CONFLICT',409);return publicMedia(existing,user);}
   let uploadId;
   try{uploadId=await store.create(a);await repo.setUploading(id,uploadId);return publicMedia(await repo.get(id),user);}
   catch(e){if(uploadId)try{await store.abort({...a,upload_id:uploadId});}catch{}await repo.setState(id,'failed','STORAGE_INITIALIZE_FAILED');throw e;}
  },
  async parts(id,user){const a=await get(id);manage(a,user);if(a.status==='ready')return{asset:publicMedia(a,user),parts:[]};active(a);const parts=await store.list(a);return{asset:publicMedia(a,user),parts:parts.map(p=>({number:p.PartNumber,size:Number(p.Size),etag:p.ETag}))};},
  async sign(id,numbers,user){const a=await get(id);manage(a,user);active(a);
   if(a.status!=='uploading')throw mediaError('This upload is finalizing. Wait before resuming.','UPLOAD_BUSY',409);
   if(!Array.isArray(numbers)||numbers.length<1||numbers.length>4||new Set(numbers).size!==numbers.length)throw mediaError('Request 1-4 unique part numbers.');
   const parts=[];for(const n of numbers){const length=partLength(Number(a.byte_size),n,Number(a.part_size));parts.push({number:n,size:length,url:await store.signPart(a,n,length)});}return{parts,expiresIn:900};
  },
  async complete(id,user){
   const a=await get(id);manage(a,user);if(a.status==='ready')return publicMedia(a,user);active(a);
   if(!await repo.claimComplete(id))throw mediaError('The file is already being finalized. Retry in two minutes.','UPLOAD_BUSY',409);
   let invalid=false;
   try{
    // Recover after a network/process interruption between storage completion and DB commit.
    let head=await store.head(a);
    if(!head){const parts=validateParts(await store.list(a),Number(a.byte_size),Number(a.part_size));await store.complete(a,parts);head=await store.head(a);}
    if(!head)throw mediaError('Storage has not confirmed the completed file. Retry finalization.','UPLOAD_NOT_CONFIRMED',409);
    if(Number(head.ContentLength)!==Number(a.byte_size)||head.Metadata?.['coastal-asset-id']!==a.id||head.ContentType!==a.mime_type||!matchesMediaHeader(await store.header(a),a.mime_type)){
     invalid=true;try{await store.remove(a);}catch{}throw mediaError('Uploaded data does not match the declared image/video format or size. The file was not added to the library.','MEDIA_CONTENT_REJECTED',422);
    }
    await repo.ready(id,user.id);return publicMedia(await repo.get(id),user);
   }catch(e){await repo.setState(id,invalid?'failed':'uploading',String(e.code||'UPLOAD_FINALIZE_RETRY').slice(0,100));throw e;}
  },
  async abort(id,user){const a=await get(id);manage(a,user);if(a.status==='aborted')return{ok:true};if(a.status==='ready')throw mediaError('This file is already uploaded. Use Delete file instead.','MEDIA_READY',409);
   if(a.status==='completing')throw mediaError('Finalization is in progress. Wait before cancelling.','UPLOAD_BUSY',409);
   await store.abort(a);if(await store.head(a))await store.remove(a);await repo.setState(id,'aborted');return{ok:true};},
  async remove(id,user){const a=await get(id);manage(a,user);if(!await repo.claimDelete(id))throw mediaError('Cancel an unfinished upload first.','UPLOAD_ACTIVE',409);
   await store.abort(a);await store.remove(a);await repo.setState(id,'deleted');return{ok:true};},
  async preview(id,user){const a=await get(id);if(a.status!=='ready')throw mediaError('Upload must finish before preview.','MEDIA_NOT_READY',409);return{url:await store.preview(a),expiresIn:3600,asset:publicMedia(a,user)};}
 };
}
