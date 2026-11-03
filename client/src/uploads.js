import { useEffect,useState } from 'react';
import { api } from './api.js';
import { validateMediaInput,PART_BYTES,partLength } from '../../shared/media.js';
const listeners=new Set();let tasks=[];let sequence=0;let pumping=false;
function emit(){sequence++;for(const fn of listeners)fn(sequence);}
function patch(t,values){Object.assign(t,values);emit();}
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
export async function fingerprintFile(file){
 // Bounded-memory resume identification, not a replacement for an antivirus scan.
 const first=await file.slice(0,1048576).arrayBuffer(),last=await file.slice(Math.max(0,file.size-1048576)).arrayBuffer();
 const info=new TextEncoder().encode(`${file.name}\n${file.size}\n${file.lastModified}`),data=new Uint8Array(info.length+first.byteLength+last.byteLength);
 data.set(info);data.set(new Uint8Array(first),info.length);data.set(new Uint8Array(last),info.length+first.byteLength);
 return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',data)),b=>b.toString(16).padStart(2,'0')).join('');
}
function putPart(url,blob,signal,progress){return new Promise((resolve,reject)=>{
 const xhr=new XMLHttpRequest();let done=false;
 const finish=(error)=>{if(done)return;done=true;signal.removeEventListener('abort',abort);error?reject(error):resolve();};
 const abort=()=>xhr.abort();
 xhr.open('PUT',url);xhr.timeout=10*60*1000;xhr.setRequestHeader('Content-Type','application/octet-stream');
 xhr.upload.onprogress=e=>progress(e.loaded);
 xhr.onload=()=>xhr.status>=200&&xhr.status<300?finish():finish(new Error(`Storage upload returned HTTP ${xhr.status}. Check R2 bucket permissions and CORS; retry refreshes the signed URL.`));
 xhr.onerror=()=>finish(new Error('The browser could not reach storage. Check the R2 CORS policy and your connection.'));
 xhr.ontimeout=()=>finish(new Error('This file part timed out. Retry will resume confirmed parts.'));
 xhr.onabort=()=>finish(Object.assign(new Error('Upload paused.'),{name:'AbortError'}));
 signal.addEventListener('abort',abort,{once:true});if(signal.aborted){finish(Object.assign(new Error('Upload paused.'),{name:'AbortError'}));return;}
 xhr.send(blob);
 });}
async function run(t){
 t.controller=new AbortController();patch(t,{status:'uploading',error:'',loaded:0});const signal=t.controller.signal;
 const stopped=()=>{if(signal.aborted)throw Object.assign(new Error('Paused.'),{name:'AbortError'});};
 try{
  stopped();
  if(!t.asset){const r=await api('/media/uploads',{method:'POST',body:{name:t.file.name,size:t.file.size,type:t.file.type,fingerprint:t.fingerprint,clientUploadId:t.clientId}});t.asset=r.asset;emit();}
  stopped();
  if(t.asset.status==='initializing')throw new Error('Storage initialization is still pending. Retry shortly; cancel and start again if it stays pending.');
  const state=await api('/media/uploads/'+t.asset.id);t.asset=state.asset;
  if(state.asset.status==='ready'){patch(t,{status:'complete',loaded:t.file.size});t.onComplete?.(state.asset);return;}
  const partSize=state.asset.partSize||PART_BYTES,confirmed=new Map((state.parts||[]).filter(p=>p.size===partLength(t.file.size,p.number,partSize)).map(p=>[p.number,p.size])),inflight=new Map();
  let confirmedBytes=[...confirmed.values()].reduce((a,b)=>a+b,0);
  const update=()=>patch(t,{loaded:Math.min(t.file.size,confirmedBytes+[...inflight.values()].reduce((a,b)=>a+b,0))});update();
  const pending=Array.from({length:Math.ceil(t.file.size/partSize)},(_,i)=>i+1).filter(n=>!confirmed.has(n));let cursor=0;
  async function worker(){while(cursor<pending.length){const number=pending[cursor++],bytes=partLength(t.file.size,number,partSize);stopped();
   let lastError;
   for(let attempt=0;attempt<3;attempt++){
    stopped();inflight.set(number,0);update();
    try{const signed=await api('/media/uploads/'+t.asset.id+'/parts',{method:'POST',body:{numbers:[number]}});stopped();
     await putPart(signed.parts[0].url,t.file.slice((number-1)*partSize,(number-1)*partSize+bytes,'application/octet-stream'),signal,n=>{inflight.set(number,n);update();});
     confirmedBytes+=bytes;inflight.delete(number);update();lastError=null;break;
    }catch(e){lastError=e;inflight.delete(number);update();if(e.name==='AbortError'||[400,401,403,409].includes(e.status))throw e;if(attempt<2)await sleep(750*2**attempt);}
   }
   if(lastError)throw lastError;
  }}
  const results=await Promise.allSettled([worker(),worker()]);const failed=results.find(r=>r.status==='rejected');if(failed)throw failed.reason;
  stopped();patch(t,{status:'finishing',loaded:t.file.size});const finished=await api('/media/uploads/'+t.asset.id+'/complete',{method:'POST'});
  patch(t,{status:'complete',asset:finished.asset,loaded:t.file.size});t.onComplete?.(finished.asset);
 }catch(e){t.controller.abort();patch(t,{status:e.name==='AbortError'?'paused':'error',error:e.name==='AbortError'?'':e.message});}
 finally{t.controller=null;}
}
async function pump(){if(pumping)return;pumping=true;try{for(let t;(t=tasks.find(x=>x.status==='queued'));){t.runPromise=run(t);await t.runPromise;}}finally{pumping=false;emit();}}
export const uploadStore={
 async add(file,{asset,onComplete}={}){
  const fingerprint=await fingerprintFile(file);validateMediaInput({name:file.name,size:file.size,type:file.type,fingerprint});
  if(asset&&(asset.fingerprint!==fingerprint||asset.size!==file.size||asset.name!==file.name))throw new Error('Select the same original file (name, size, modification time and sampled bytes must match).');
  if(asset&&tasks.some(t=>t.asset?.id===asset.id&&['queued','uploading','finishing'].includes(t.status)))throw new Error('This file is already in the upload queue.');
  const t={id:crypto.randomUUID(),clientId:crypto.randomUUID(),file,name:file.name,size:file.size,fingerprint,asset,onComplete,status:'queued',loaded:0,error:'',controller:null};
  tasks.push(t);emit();pump();return t.id;
 },
 pause(id){const t=tasks.find(t=>t.id===id);if(!t||t.status==='finishing')return;if(t.status==='queued')patch(t,{status:'paused'});else t.controller?.abort();},
 resume(id){const t=tasks.find(t=>t.id===id);if(t&&['error','paused'].includes(t.status)){patch(t,{status:'queued',error:''});pump();}},
 async cancel(id){const t=tasks.find(t=>t.id===id);if(!t)return;if(t.status==='finishing')throw new Error('Finalization is in progress. Wait for it to finish.');if(t.controller)t.controller.abort();if(t.runPromise)await t.runPromise;if(t.asset&&t.status!=='complete')await api('/media/uploads/'+t.asset.id+'/abort',{method:'POST'});tasks=tasks.filter(x=>x.id!==id);emit();},
 dismiss(id){tasks=tasks.filter(t=>t.id!==id);emit();},
 clear(){for(const t of tasks)t.controller?.abort();tasks=[];emit();},
 get(){return tasks.map(({file,controller,onComplete,runPromise,...rest})=>rest);}
};
export function useUploads(){const [version,setVersion]=useState(sequence);useEffect(()=>{listeners.add(setVersion);return()=>listeners.delete(setVersion);},[]);return{version,tasks:uploadStore.get(),...uploadStore};}
