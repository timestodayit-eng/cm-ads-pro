import { randomBytes,createHash,createHmac,scrypt as rawScrypt,timingSafeEqual,createCipheriv,createDecipheriv } from 'node:crypto';
import { promisify } from 'node:util';
const scrypt=promisify(rawScrypt);
export const randomToken=()=>randomBytes(32).toString('base64url');
export const sha256=s=>createHash('sha256').update(String(s)).digest('hex');
export function constantEqual(a,b){return timingSafeEqual(Buffer.from(sha256(a)),Buffer.from(sha256(b)));}
export function csrfToken(raw,secret){return createHmac('sha256',secret).update('csrf:'+raw).digest('base64url');}
export async function hashPassword(password){
 if(typeof password!=='string'||password.length<14||Buffer.byteLength(password)>256) throw Object.assign(new Error('Use a password of at least 14 characters (maximum 256 bytes).'),{status:400});
 const salt=randomBytes(16).toString('hex');
 const key=await scrypt(password,salt,64,{N:32768,r:8,p:1,maxmem:64*1024*1024});
 return `scrypt:32768:8:1:${salt}:${key.toString('hex')}`;
}
export async function verifyPassword(password,encoded){
 if(typeof password!=='string'||Buffer.byteLength(password)>256||!encoded)return false;
 const [algo,n,r,p,salt,hex]=encoded.split(':');
 if(algo!=='scrypt'||n!=='32768'||r!=='8'||p!=='1'||!/^[a-f0-9]{32}$/.test(salt||'')||!/^[a-f0-9]{128}$/.test(hex||''))return false;
 const key=await scrypt(password,salt,64,{N:32768,r:8,p:1,maxmem:64*1024*1024});return timingSafeEqual(key,Buffer.from(hex,'hex'));
}
export function encryptToken(text,hexKey){
 if(!/^[a-fA-F0-9]{64}$/.test(hexKey))throw new Error('TOKEN_ENCRYPTION_KEY must contain 64 hex characters');
 const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',Buffer.from(hexKey,'hex'),iv);
 const data=Buffer.concat([cipher.update(text,'utf8'),cipher.final()]);
 return ['v1',iv.toString('hex'),cipher.getAuthTag().toString('hex'),data.toString('hex')].join(':');
}
export function decryptToken(value,hexKey){
 const [version,iv,tag,data]=value.split(':');if(version!=='v1')throw new Error('Unsupported token format');
 const decipher=createDecipheriv('aes-256-gcm',Buffer.from(hexKey,'hex'),Buffer.from(iv,'hex'));decipher.setAuthTag(Buffer.from(tag,'hex'));
 return Buffer.concat([decipher.update(Buffer.from(data,'hex')),decipher.final()]).toString('utf8');
}
export function parseCookies(header=''){return Object.fromEntries(header.split(';').map(x=>x.trim().split(/=(.*)/s)).filter(x=>x[0]).map(([k,v])=>{try{return[k,decodeURIComponent(v||'')];}catch{return[k,''];}}));}
export function httpError(status,message,code='REQUEST_FAILED'){return Object.assign(new Error(message),{status,code});}
export function validateEmail(v){const e=String(v||'').trim().toLowerCase();if(e.length>254||!/^\S+@\S+\.\S+$/.test(e))throw httpError(400,'Enter a valid email address.');return e;}
