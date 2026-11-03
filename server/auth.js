import { Router } from 'express';
import { config, configuration, strongSecret } from './config.js';
import { query, transaction, audit } from './db.js';
import { randomToken,sha256,csrfToken,constantEqual,hashPassword,verifyPassword,parseCookies,httpError,validateEmail } from './security.js';
export const cookieName=config.production?'__Host-coastal_session':'coastal_session';
const cookieOptions={httpOnly:true,secure:config.production,sameSite:'lax',path:'/',maxAge:8*60*60*1000};
export async function limit(key,max=10,minutes=15){
 const hash=sha256(key);
 await query(`INSERT INTO rate_limits (key_hash,window_end,hits) VALUES (?,DATE_ADD(UTC_TIMESTAMP(),INTERVAL ? MINUTE),1)
  ON DUPLICATE KEY UPDATE hits=IF(window_end<UTC_TIMESTAMP(),1,hits+1),window_end=IF(window_end<UTC_TIMESTAMP(),VALUES(window_end),window_end)`,[hash,minutes]);
 const [r]=await query('SELECT hits FROM rate_limits WHERE key_hash=?',[hash]);
 if(r.hits>max)throw httpError(429,'Too many attempts. Please wait and try again.','RATE_LIMIT');
}
export function originGuard(req,res,next){
 if(['GET','HEAD','OPTIONS'].includes(req.method)||req.path==='/jobs/tick')return next();
 if(!configuration().origin)return next(httpError(503,'Configure APP_ORIGIN before using the app.','ORIGIN_NOT_CONFIGURED'));
 if(req.get('origin')!==config.origin)return next(httpError(403,'Request origin is not allowed.','ORIGIN_REJECTED'));
 next();
}
export async function attachSession(req,res,next){
 const raw=parseCookies(req.headers.cookie)[cookieName];
 if(raw&&configuration().database&&configuration().session){
  const [session]=await query(`SELECT u.id,u.name,u.email,u.role,s.token_hash FROM sessions s JOIN users u ON u.id=s.user_id
   WHERE s.token_hash=? AND s.expires_at>UTC_TIMESTAMP() AND u.active=1`,[sha256(raw)]);
  if(session){req.user=session;req.sessionRaw=raw;}
 }
 next();
}
export function requireAuth(req,res,next){if(!req.user)return next(httpError(401,'Please sign in.','AUTH_REQUIRED'));next();}
export function requireRole(...roles){return(req,res,next)=>{if(!req.user)return next(httpError(401,'Please sign in.'));if(!roles.includes(req.user.role))return next(httpError(403,'Your role does not allow this action.'));next();};}
export function csrfGuard(req,res,next){
 if(!['GET','HEAD','OPTIONS'].includes(req.method)&&req.user&&!constantEqual(req.get('x-csrf-token')||'',csrfToken(req.sessionRaw,config.sessionSecret)))return next(httpError(403,'Session check failed. Reload and try again.','CSRF_REJECTED'));
 next();
}
async function sessionFor(res,user){
 const raw=randomToken();await query('INSERT INTO sessions (token_hash,user_id,expires_at) VALUES (?,?,DATE_ADD(UTC_TIMESTAMP(),INTERVAL 8 HOUR))',[sha256(raw),user.id]);
 res.cookie(cookieName,raw,cookieOptions);return {user:{id:user.id,name:user.name,email:user.email,role:user.role},csrf:csrfToken(raw,config.sessionSecret)};
}
export function authRoutes(){
 const r=Router();
 r.get('/bootstrap',async(req,res)=>{
  const cfg=configuration();let database=false,schema=false,setupRequired=false;
  if(cfg.database){try{await query('SELECT 1');database=true;const [row]=await query('SELECT COUNT(*) AS n FROM users');schema=true;setupRequired=Number(row.n)===0;}catch{}}
  res.json({configuration:cfg,database,schema,setupRequired,release:'0.3.0'});
 });
 r.post('/auth/setup',async(req,res)=>{
  if(!configuration().session||!strongSecret(config.setupSecret))throw httpError(503,'Configure SESSION_SECRET and FIRST_ADMIN_SETUP_SECRET in Hostinger.');
  await limit('setup:'+req.ip,6,30);
  if(!constantEqual(req.body.setupSecret||'',config.setupSecret))throw httpError(403,'The setup key is not valid.');
  const email=validateEmail(req.body.email),name=String(req.body.name||'Administrator').trim().slice(0,100),passwordHash=await hashPassword(req.body.password);
  const user=await transaction(async c=>{
   await c.execute('SELECT id FROM app_locks WHERE id=1 FOR UPDATE');
   const [[row]]=await c.execute('SELECT COUNT(*) AS n FROM users');
   if(Number(row.n)!==0)throw httpError(409,'Initial setup is already closed. Please sign in.','SETUP_CLOSED');
   const [insert]=await c.execute("INSERT INTO users (name,email,password_hash,role) VALUES (?,?,?,'super_admin')",[name,email,passwordHash]);
   return {id:insert.insertId,name,email,role:'super_admin'};
  });
  await audit(user.id,'first_admin_created');res.status(201).json(await sessionFor(res,user));
 });
 r.post('/auth/login',async(req,res)=>{
  if(!configuration().session)throw httpError(503,'Configure SESSION_SECRET.');
  const email=validateEmail(req.body.email);await limit('login-ip:'+req.ip,20);await limit('login-email:'+email,10);
  const [u]=await query('SELECT * FROM users WHERE email=? AND active=1',[email]);
  const dummy='scrypt:32768:8:1:00000000000000000000000000000000:'+('00'.repeat(64));
  const valid=await verifyPassword(req.body.password,u?.password_hash||dummy);
  if(!u||!valid)throw httpError(401,'Email or password is incorrect.','INVALID_LOGIN');
  if(req.user)await query('DELETE FROM sessions WHERE token_hash=?',[req.user.token_hash]);
  await audit(u.id,'login');res.json(await sessionFor(res,u));
 });
 r.get('/auth/me',requireAuth,(req,res)=>res.json({user:{id:req.user.id,name:req.user.name,email:req.user.email,role:req.user.role},csrf:csrfToken(req.sessionRaw,config.sessionSecret)}));
 r.post('/auth/logout',requireAuth,csrfGuard,async(req,res)=>{await query('DELETE FROM sessions WHERE token_hash=?',[req.user.token_hash]);res.clearCookie(cookieName,{httpOnly:true,secure:config.production,sameSite:'lax',path:'/'});res.json({ok:true});});
 r.post('/auth/password',requireAuth,csrfGuard,async(req,res)=>{
  await limit('password:'+req.user.id,5);
  const [u]=await query('SELECT * FROM users WHERE id=?',[req.user.id]);
  if(!await verifyPassword(req.body.currentPassword,u.password_hash))throw httpError(403,'Current password is incorrect.');
  const hash=await hashPassword(req.body.newPassword);
  await transaction(async c=>{await c.execute('UPDATE users SET password_hash=? WHERE id=?',[hash,u.id]);await c.execute('DELETE FROM sessions WHERE user_id=?',[u.id]);});
  await audit(u.id,'password_changed');res.json(await sessionFor(res,u));
 });
 r.get('/users',requireRole('super_admin'),async(req,res)=>res.json({users:await query('SELECT id,name,email,role,active,created_at FROM users ORDER BY id')}));
 r.post('/users',requireRole('super_admin'),csrfGuard,async(req,res)=>{
  const email=validateEmail(req.body.email),role=req.body.role;if(!['manager','analyst'].includes(role))throw httpError(400,'Choose manager or analyst.');
  const hash=await hashPassword(req.body.password);const result=await query('INSERT INTO users (name,email,role,password_hash) VALUES (?,?,?,?)',[String(req.body.name||'Team member').slice(0,100),email,role,hash]);
  await audit(req.user.id,'user_created',String(result.insertId));res.status(201).json({ok:true});
 });
 return r;
}
