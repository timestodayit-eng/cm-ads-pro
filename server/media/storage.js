import { config, configuration, storageEndpoint } from '../config.js';
import { httpError } from '../security.js';
let implementation;
// Lazy import: missing/unconfigured storage must not stop authentication or Meta OAuth.
export async function storage() {
 if (!configuration().storage) throw httpError(503,'Configure R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY and R2_BUCKET, then restart.','STORAGE_NOT_CONFIGURED');
 if (!implementation) implementation = createStorage().catch(e => { implementation=undefined; throw e; });
 return implementation;
}
async function createStorage() {
 const sdk = await import('@aws-sdk/client-s3');
 const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner');
 const client = new sdk.S3Client({ region:'auto',endpoint:storageEndpoint(),forcePathStyle:true,maxAttempts:2,
  requestChecksumCalculation:'WHEN_REQUIRED',responseChecksumValidation:'WHEN_REQUIRED',
  credentials:{accessKeyId:config.storage.accessKey,secretAccessKey:config.storage.secretKey} });
 const send=(command)=>client.send(command,{abortSignal:AbortSignal.timeout(25000)});
 const params=a=>({Bucket:a.bucket_name,Key:a.object_key});
 return {
  async check(){await send(new sdk.ListObjectsV2Command({Bucket:config.storage.bucket,Prefix:'coastal-media/',MaxKeys:1}));},
  async create(a){const r=await send(new sdk.CreateMultipartUploadCommand({...params(a),ContentType:a.mime_type,Metadata:{'coastal-asset-id':a.id},CacheControl:'private, max-age=0',ContentDisposition:'inline'}));if(!r.UploadId)throw new Error('Missing upload ID');return r.UploadId;},
  async signPart(a,number,length){return getSignedUrl(client,new sdk.UploadPartCommand({...params(a),UploadId:a.upload_id,PartNumber:number,ContentLength:length}),{expiresIn:900,signableHeaders:new Set(['content-length'])});},
  async list(a){let marker;const parts=[];do{const r=await send(new sdk.ListPartsCommand({...params(a),UploadId:a.upload_id,PartNumberMarker:marker,MaxParts:1000}));parts.push(...(r.Parts||[]));marker=r.IsTruncated?r.NextPartNumberMarker:undefined;if(parts.length>200)throw httpError(409,'Too many uploaded parts. Cancel and restart.','UPLOAD_PART_MISMATCH');}while(marker);return parts;},
  async complete(a,parts){return send(new sdk.CompleteMultipartUploadCommand({...params(a),UploadId:a.upload_id,MultipartUpload:{Parts:parts}}));},
  async abort(a){if(a.upload_id)try{await send(new sdk.AbortMultipartUploadCommand({...params(a),UploadId:a.upload_id}));}catch(e){if(e.name!=='NoSuchUpload')throw e;}},
  async head(a){try{return await send(new sdk.HeadObjectCommand(params(a)));}catch(e){if(e.$metadata?.httpStatusCode===404||['NotFound','NoSuchKey'].includes(e.name))return null;throw e;}},
  async header(a){const r=await send(new sdk.GetObjectCommand({...params(a),Range:'bytes=0-511'}));return new Uint8Array(await r.Body.transformToByteArray());},
  async remove(a){await send(new sdk.DeleteObjectCommand(params(a)));},
  async preview(a){return getSignedUrl(client,new sdk.GetObjectCommand({...params(a),ResponseContentType:a.mime_type,ResponseContentDisposition:'inline'}),{expiresIn:3600});}
 };
}
export function storageFailure(e) {
 if(e.status)return e;
 const name=String(e.name||e.code||'');
 const code=/AccessDenied|Forbidden|InvalidAccessKey|SignatureDoesNotMatch/.test(name)?'STORAGE_ACCESS_DENIED':/NoSuchBucket/.test(name)?'STORAGE_BUCKET_MISSING':/NoSuchUpload/.test(name)?'UPLOAD_EXPIRED':'STORAGE_REQUEST_FAILED';
 const message=code==='UPLOAD_EXPIRED'?'This multipart upload no longer exists. Cancel it and choose the file again.':code==='STORAGE_ACCESS_DENIED'?'R2 rejected the server credentials. Check object read/write permission and bucket scope.':'Storage request failed. Check your R2 configuration, network and the sanitized runtime logs.';
 return httpError(502,message,code);
}
