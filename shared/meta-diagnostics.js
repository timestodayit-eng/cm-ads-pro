export function safeMetaErrorText(input,max=320){
 const s=String(input||'').replace(/https?:\/\/[^\s<>"']+/gi,'[link]').replace(/EA[A-Za-z0-9_-]{20,}/g,'[token]').replace(/(?:access_token|appsecret_proof|client_secret|X-Amz-Signature)\s*[=:]\s*[^\s&,;]+/gi,'[credential]').replace(/[\r\n\t]+/g,' ').trim();
 return s.slice(0,max);
}
export function describeMetaError(error,status){
 const code=String(error?.code||status||'UNKNOWN').slice(0,12);
 const subcode=error?.error_subcode?` (Meta subcode ${String(error.error_subcode).slice(0,16)})`:'';
 const title=safeMetaErrorText(error?.error_user_title,120);
 const detail=safeMetaErrorText(error?.error_user_msg||error?.message,220);
 return{code:`META_WRITE_${code}`,message:`Meta ${code}${subcode}: ${title||'Request rejected'}${detail&&detail!==title?` — ${detail}`:''}`.slice(0,340)};
}
export function interpretVideoStatus(value){
 const status=value?.status??value;
 if(typeof status==='string'){
  const v=status.toLowerCase();return{ready:v==='ready'||v==='complete'||v==='finished',failed:/error|fail|reject|expired/.test(v),value:v};
 }
 if(!status||typeof status!=='object')return{ready:false,failed:false,value:'unknown'};
 // The video_status field is authoritative. Processing phase can be complete
 // while publishing or encoding is still pending.
 const v=String(status.video_status||'unknown').toLowerCase();
 return{ready:v==='ready'||v==='complete'||v==='finished',failed:/error|fail|reject|expired/.test(v),value:v};
}

