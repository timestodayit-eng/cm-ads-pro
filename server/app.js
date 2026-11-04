import express from 'express';
import {existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {config,configuration,strongSecret,storageEndpoint} from './config.js';
import {query,parseJSON,audit,transaction} from './db.js';
import {httpError,constantEqual} from './security.js';
import {authRoutes,attachSession,originGuard,requireAuth,requireRole,csrfGuard,limit} from './auth.js';
import {metaRoutes} from './meta.js';
import {mediaRoutes} from './media/routes.js';
import {financeRoutes} from './finance.js';
import {overview,performance} from './metrics.js';
import {monitorSettings,monitoringRoutes,monitoringSchemaReady} from './settings.js';
import {getReport} from './ai.js';
import {enqueue,runOne,enqueueAll,runBatch,syncStatus} from './jobs.js';
import {buildPlan} from '../shared/planning.js';
import {publishRoutes,publishingSchemaReady} from './publish.js';
import {commandRoutes} from './command.js';
import {customReportRoutes,customReportSchemaReady} from './custom-report.js';
import {brandingRoutes,readBranding} from './branding.js';
const dist=fileURLToPath(new URL('../dist/',import.meta.url));
export function createApp(){
 const app=express();app.disable('x-powered-by');app.set('trust proxy',1);
 app.use((req,res,next)=>{
  res.set({'X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','Referrer-Policy':'same-origin','Permissions-Policy':'camera=(), microphone=(), geolocation=()',
   'Content-Security-Policy':`default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: ${storageEndpoint()}; media-src 'self' blob: ${storageEndpoint()}; connect-src 'self' ${storageEndpoint()}; font-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'`});
  if(config.production)res.set('Strict-Transport-Security','max-age=31536000');next();
 });
 app.use(express.json({limit:'512kb'}));
 app.get('/api/health',(req,res)=>res.json({ok:true,service:'Coastal Ads Command Center',release:'0.6.0',frontend:existsSync(dist+'index.html')}));
 app.get('/api/ready',async(req,res)=>{
  const c=configuration();let database=false;try{const locks=await query('SELECT id FROM app_locks WHERE id=1');await query('SELECT id FROM users LIMIT 1');database=locks.length===1;}catch{}
  let upgraded=false;try{upgraded=await monitoringSchemaReady();await query('SELECT id FROM media_assets LIMIT 1');}catch{upgraded=false;}
  let publishing=false;try{publishing=await publishingSchemaReady();}catch{}
  let customReports=false;try{customReports=await customReportSchemaReady();}catch{}
  let branding=false;try{branding=(await readBranding()).configured;}catch{}
  const ready=database&&upgraded&&publishing&&customReports&&branding&&c.session&&c.origin&&existsSync(dist+'index.html');res.status(ready?200:503).json({ready,database,upgradeSchema:upgraded,publishingSchema:publishing,customReportSchema:customReports,brandingSchema:branding,frontend:existsSync(dist+'index.html'),sessionConfigured:c.session,originConfigured:c.origin});
 });
 app.use('/api',(req,res,next)=>{res.set('Cache-Control','no-store');next();});
 app.use('/api',originGuard);
 app.post('/api/jobs/tick',async(req,res)=>{
  if(!strongSecret(config.jobSecret)||!constantEqual(req.get('authorization')||'',`Bearer ${config.jobSecret}`))throw httpError(401,'Scheduler authorization failed.');
  res.json(await runBatch({source:'https-scheduler',budgetMs:15000,maxJobs:12}));
 });
 app.get('/api/branding',async(req,res)=>res.json(await readBranding()));
 app.use('/api',attachSession);
 app.use('/api',authRoutes());app.use('/api/meta',metaRoutes());app.use('/api/media',mediaRoutes());app.use('/api/finance',financeRoutes());app.use('/api/publish',publishRoutes());app.use('/api/command',commandRoutes());app.use('/api/custom-reports',customReportRoutes());app.use('/api/branding',brandingRoutes());
 app.get('/api/overview',requireAuth,async(req,res)=>res.json(await overview(Number(req.query.days)||7)));
 app.get('/api/settings',requireAuth,async(req,res)=>res.json({configuration:configuration(),monitorEnabled:config.monitor,monitoring:await monitorSettings(),reportIntervalHours:config.reportIntervalHours,branding:await readBranding(),model:config.ai.model,dailyMax:config.ai.dailyMax,maxAccounts:null,accountSelection:'all_authorized_mapped',features:{pausedPublishing:config.publishEnabled,activationAvailable:config.activationEnabled,requiresActivationApproval:true,aiCommandCenter:true,largeVideoUpload:true,uploadRequiresR2:true,conversionDestinations:true,accountDailySpend:true,billingBalance:true,rollingHourlyInsights:true,configurableAutoSync:true,readOnlyAI:true}}));
 app.use('/api/settings/monitoring',monitoringRoutes());
 app.get('/api/sync/status',requireAuth,async(req,res)=>res.json(await syncStatus()));
 app.post('/api/sync/all',requireRole('super_admin','manager'),csrfGuard,async(req,res)=>{await limit('sync-all:'+req.user.id,5,5);res.status(202).json(await enqueueAll());});
 app.post('/api/performance/query',requireAuth,csrfGuard,async(req,res)=>{
  const period=String(req.body?.period||'today');
  const ids=req.body?.accountIds;
  if(!Array.isArray(ids)||new Set(ids).size!==ids.length||ids.some(x=>typeof x!=='string'||!/^act_\d+$/.test(x)))throw httpError(400,'Select unique valid mapped account IDs.');
  res.json(await performance(period,ids));
 });
 app.get('/api/performance',requireAuth,async(req,res)=>{
  const ids=req.query.accounts===undefined?undefined:String(req.query.accounts).split(',').filter(Boolean);
  if(ids&&(ids.some(x=>!/^act_\d+$/.test(x))))throw httpError(400,'Select unique valid account IDs.');
  res.json(await performance(String(req.query.period||'today'),ids));
 });
 app.post('/api/accounts/:accountId/sync',requireRole('super_admin','manager'),csrfGuard,async(req,res)=>{
  const [account]=await query('SELECT account_id FROM ad_accounts WHERE account_id=? AND slot IS NOT NULL',[req.params.accountId]);if(!account)throw httpError(404,'Mapped account not found.');
  res.status(202).json(await enqueue('sync_account',{accountId:account.account_id},`manual:${account.account_id}:${randomUUID()}`));
 });
 app.get('/api/drafts',requireAuth,async(req,res)=>{
  const drafts=await query('SELECT id,name,config_json,updated_at FROM campaign_drafts ORDER BY updated_at DESC LIMIT 100');res.json({drafts:drafts.map(x=>({...x,config:parseJSON(x.config_json),config_json:undefined}))});
 });
 app.post('/api/drafts',requireRole('super_admin','manager'),csrfGuard,async(req,res)=>{
  const plan=buildPlan(req.body);
  for(const t of plan.allocations){const [a]=await query('SELECT currency FROM ad_accounts WHERE account_id=? AND slot IS NOT NULL',[t.accountId]);if(!a||a.currency!==plan.currency)throw httpError(400,'Each selected account must be mapped and use the chosen currency.');}
  const id=randomUUID();
  await transaction(async c=>{
   await c.execute('SELECT id FROM app_locks WHERE id=1 FOR UPDATE');
   const assetIds=[...new Set(plan.contents.map(x=>x.mediaAssetId).filter(Boolean))];
   for(const assetId of assetIds){const [[a]]=await c.execute("SELECT id FROM media_assets WHERE id=? AND status='ready'",[assetId]);if(!a)throw httpError(400,'Finish uploading every selected media file before saving.','MEDIA_NOT_READY');}
   await c.execute('INSERT INTO campaign_drafts (id,name,created_by,config_json) VALUES (?,?,?,?)',[id,plan.name,req.user.id,JSON.stringify({input:req.body,plan})]);
   for(const assetId of assetIds)await c.execute('INSERT INTO draft_media (draft_id,media_id) VALUES (?,?)',[id,assetId]);
  });
  await audit(req.user.id,'draft_created',id);res.status(201).json({id,plan});
 });
 app.delete('/api/drafts/:id',requireRole('super_admin','manager'),csrfGuard,async(req,res)=>{
  const [d]=await query('SELECT created_by FROM campaign_drafts WHERE id=?',[req.params.id]);if(!d)throw httpError(404,'Draft not found.');
  if(req.user.role!=='super_admin'&&Number(d.created_by)!==Number(req.user.id))throw httpError(403,'Only the author or administrator can delete this draft.');
  await query('DELETE FROM campaign_drafts WHERE id=?',[req.params.id]);await audit(req.user.id,'draft_deleted',req.params.id);res.json({ok:true});
 });
 app.get('/api/reports',requireAuth,async(req,res)=>res.json({reports:await query('SELECT id,status,model,period_days,error_code,input_tokens,output_tokens,created_at FROM ai_reports ORDER BY created_at DESC LIMIT 100')}));
 app.get('/api/reports/:id',requireAuth,async(req,res)=>res.json(await getReport(req.params.id)));
 app.post('/api/reports',requireRole('super_admin','manager'),csrfGuard,async(req,res)=>{
  if(!configuration().openai)throw httpError(503,'Configure OPENAI_API_KEY first.');
  const days=Number(req.body.days)||7;if(![1,3,7].includes(days))throw httpError(400,'Invalid report period.');
  await limit('report-request:'+req.user.id,8,60);
  res.status(202).json(await enqueue('ai_report',{days,userId:req.user.id},`report:manual:${req.user.id}:${days}:${Math.floor(Date.now()/900000)}`));
 });
 app.post('/api/jobs/process',requireRole('super_admin','manager'),csrfGuard,async(req,res)=>{await limit('job-process:'+req.user.id,60,60);res.json(await runBatch({source:'manual',budgetMs:15000,maxJobs:12}));});
 app.get('/api/audit',requireRole('super_admin'),async(req,res)=>res.json({events:await query('SELECT event_name,entity_id,created_at FROM audit_log ORDER BY id DESC LIMIT 100')}));
 app.use('/api',(req,res)=>res.status(404).json({code:'API_NOT_FOUND',message:'API route not found.'}));
 app.use(express.static(dist,{index:false,maxAge:config.production?'1h':0}));
 app.get('/{*path}',(req,res)=>{
  if(!existsSync(dist+'index.html'))return res.status(503).type('text').send('Frontend build missing. Check the deployment npm install/postinstall log. Run the build workflow; this server does not build on startup.');
  res.set('Cache-Control','no-cache');res.sendFile(dist+'index.html');
 });
 app.use((err,req,res,next)=>{
  if(res.headersSent)return next(err);
  const expected=Number.isInteger(err.status)&&err.status>=400&&err.status<=599;
  console.error(JSON.stringify({event:'request_error',path:req.path,code:err.code||'INTERNAL_ERROR'}));
  res.status(expected?err.status:500).json({code:err.code||'INTERNAL_ERROR',message:expected?err.message:'Server operation failed. Check schema, environment configuration and sanitized runtime logs.'});
 });
 return app;
}
