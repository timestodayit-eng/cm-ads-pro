import {createHmac} from 'node:crypto';
import {config,configuration,storageEndpoint} from './config.js';
import {httpError} from './security.js';
import {graph} from './meta.js';
import {describeMetaError,interpretVideoStatus} from '../shared/meta-diagnostics.js';
import {pickVideoThumbnail} from '../shared/meta-thumbnail.js';
let store;

function proof(token){return createHmac('sha256',config.meta.appSecret).update(token).digest('hex');}
export async function metaWrite(path,token,params,{timeoutMs=55000}={}){
 if(!configuration().meta)throw httpError(503,'Meta configuration is not complete.','META_NOT_CONFIGURED');
 const url=`https://graph.facebook.com/${config.meta.version}/${path}`;
 const form=new URLSearchParams();form.set('appsecret_proof',proof(token));
 for(const [k,v] of Object.entries(params||{}))if(v!==undefined&&v!==null)form.set(k,typeof v==='object'?JSON.stringify(v):String(v));
 const response=await fetch(url,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/x-www-form-urlencoded'},body:form,signal:AbortSignal.timeout(timeoutMs)});
 const data=await response.json().catch(()=>({}));
 if(!response.ok||data.error){
  // Meta's human-facing error title is useful to a logged-in campaign manager.
  // Never echo raw request parameters, access tokens, debug payloads or signed R2 links.
  const info=describeMetaError(data.error,response.status);
  const e=httpError(502,info.message,info.code);
  e.metaRejected=true;e.metaSubcode=String(data.error?.error_subcode||'');throw e;
 }
 return data;
}
function storageClient(){
 if(!configuration().storage)throw httpError(503,'Configure Cloudflare R2 storage.','STORAGE_NOT_CONFIGURED');
 if(!store){store=import('@aws-sdk/client-s3').then(sdk=>{
  const client=new sdk.S3Client({region:'auto',endpoint:storageEndpoint(),forcePathStyle:true,maxAttempts:2,credentials:{accessKeyId:config.storage.accessKey,secretAccessKey:config.storage.secretKey}});
  return{sdk,client};
 });}return store;
}
export async function uploadMetaMedia({accountId,token,asset}){
 const {sdk,client}=await storageClient();
 const object={Bucket:asset.bucket_name,Key:asset.object_key};
 if(asset.kind==='video'){
  const {getSignedUrl}=await import('@aws-sdk/s3-request-presigner');
  const fileUrl=await getSignedUrl(client,new sdk.GetObjectCommand(object),{expiresIn:3600});
  const result=await metaWrite(`${accountId}/advideos`,token,{file_url:fileUrl,name:asset.original_name},{timeoutMs:55000});
  if(!/^\d+$/.test(String(result.id||'')))throw httpError(502,'Meta did not return a video ID.','META_MEDIA_ID_MISSING');
  return{metaMediaId:String(result.id),kind:'video',status:'processing'};
 }
 if(Number(asset.byte_size)>20*1024*1024)throw httpError(422,'Meta image upload is limited to 20 MB by this release.','IMAGE_TOO_LARGE');
 const result=await client.send(new sdk.GetObjectCommand(object),{abortSignal:AbortSignal.timeout(25000)});
 const bytes=await result.Body.transformToByteArray();
 if(bytes.length!==Number(asset.byte_size))throw httpError(409,'R2 image bytes do not match uploaded file metadata.','MEDIA_SIZE_MISMATCH');
 const form=new FormData();form.set('appsecret_proof',proof(token));form.append('filename',new Blob([bytes],{type:asset.mime_type}),asset.original_name);
 const response=await fetch(`https://graph.facebook.com/${config.meta.version}/${accountId}/adimages`,{method:'POST',headers:{Authorization:`Bearer ${token}`},body:form,signal:AbortSignal.timeout(55000)});
 const body=await response.json().catch(()=>({}));
 if(!response.ok||body.error){const e=httpError(502,'Meta rejected the image upload.','META_MEDIA_'+String(body.error?.code||response.status));e.metaRejected=true;throw e;}
 const image=Object.values(body.images||{})[0];if(!image?.hash)throw httpError(502,'Meta returned no image hash.','META_IMAGE_HASH_MISSING');
 return{imageHash:String(image.hash),kind:'image',status:'ready'};
}
export async function getMetaVideoThumbnail(videoId,token){
 if(!/^\d{5,40}$/.test(String(videoId||'')))throw httpError(422,'Valid Meta video ID is required for thumbnail lookup.','META_VIDEO_ID_REQUIRED');
 let thumbnail=null;
 try{thumbnail=pickVideoThumbnail(await graph(`${videoId}/thumbnails`,token,{fields:'uri,is_preferred',limit:25}));}catch(e){
  // Some video account permissions support the picture field but not the thumbnails edge.
  if(e?.retryAfterSeconds)throw e;
 }
 if(!thumbnail){
  const info=await graph(String(videoId),token,{fields:'picture'});
  thumbnail=pickVideoThumbnail(info);
 }
 if(!thumbnail)throw httpError(422,'Meta video has no accessible HTTPS thumbnail yet. Set a preferred thumbnail in Meta and retry after it finishes processing.','META_VIDEO_THUMBNAIL_MISSING');
 return thumbnail;
}
export async function isVideoReady(videoId,token){
 const res=await graph(String(videoId),token,{fields:'status'});
 const parsed=interpretVideoStatus(res);
 if(parsed.failed)throw httpError(422,`Meta rejected video processing (${parsed.value}).`,'META_VIDEO_PROCESSING_FAILED');
 return{ready:parsed.ready,value:parsed.value};
}
export async function metaSetStatus({id,token,status}){
 if(!/^\d+$/.test(id)||!['ACTIVE','PAUSED'].includes(status))throw httpError(400,'Invalid Meta object or status.');
 return metaWrite(id,token,{status});
}
