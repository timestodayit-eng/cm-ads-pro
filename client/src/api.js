let csrf='';
export function setCsrf(value){csrf=value||'';}
export async function api(path,options={}){
 const method=options.method||'GET';const response=await fetch('/api'+path,{method,credentials:'same-origin',headers:{...(options.body?{'Content-Type':'application/json'}:{}),...(!['GET','HEAD'].includes(method)&&csrf?{'X-CSRF-Token':csrf}:{})},...(options.body?{body:JSON.stringify(options.body)}:{})});
 let data;try{data=await response.json();}catch{throw new Error('The API did not return JSON. Check the Express deployment and /api/health.');}
 if(!response.ok)throw Object.assign(new Error(data.message||data.code||`Request failed (${response.status})`),{status:response.status,code:data.code});
 if(data.csrf)setCsrf(data.csrf);return data;
}
export function money(value,currency='USD'){try{return new Intl.NumberFormat('en-US',{style:'currency',currency,maximumFractionDigits:2}).format(Number(value)||0);}catch{return (Number(value)||0).toFixed(2)+' '+currency;}}
export function count(value){return new Intl.NumberFormat('en-US').format(Number(value)||0);}
export function date(value){if(!value)return 'Not synced';const x=new Date(/Z$|[+]\d\d:\d\d$/.test(value)?value:String(value).replace(' ','T')+'Z');return Number.isNaN(x.getTime())?'Unknown':x.toLocaleString();}
export function downloadJSON(name,data){const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
