import {createHmac} from 'node:crypto';
import {config,configuration,storageEndpoint} from './config.js';
import {httpError} from './security.js';
import {graph} from './meta.js';
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
  const title=String(data.error?.error_user_title||'').replace(/https?:\/\/\S+/gi,'[link]').replace(/EA[A-Za-z0-9_-]{20,}/g,'[token]').slice(0,140);
  const message=title?`Meta rejected this operation: ${title}. Check the account, Page and campaign settings.`:'Meta rejected the request. Check the response error code, permissions and campaign settings.';
  const e=httpError(502,message,'META_WRITE_'+String(data.error?.code||response.status));
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
export async function isVideoReady(videoId,token){
 const res=await graph(String(videoId),token,{fields:'status'});
 const status=res.status?.video_status||res.status?.processing_phase?.status||res.status||'';
 if(typeof status==='object')return{ready:false,error:false};
 const value=String(status).toLowerCase();
 if(/error|fail|reject/.test(value))throw httpError(422,'Meta rejected or failed to process the video.','META_VIDEO_PROCESSING_FAILED');
 return{ready:/ready|complete|finished/.test(value),value};
}
export async function metaSetStatus({id,token,status}){
 if(!/^\d+$/.test(id)||!['ACTIVE','PAUSED'].includes(status))throw httpError(400,'Invalid Meta object or status.');
 return metaWrite(id,token,{status});
}
