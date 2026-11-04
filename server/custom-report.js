import {Router} from 'express';
import {randomUUID} from 'node:crypto';
import {query,parseJSON,audit} from './db.js';
import {httpError} from './security.js';
import {requireAuth,requireRole,csrfGuard,limit} from './auth.js';
import {monitorSettings} from './settings.js';
import {convertTotals} from '../shared/monitoring.js';
import {validateCustomReport,aggregateCustomReport,REPORT_FIELDS,REPORT_GROUPS} from '../shared/custom-report.js';

export async function customReportSchemaReady(){
 try{await query('SELECT id FROM custom_report_templates LIMIT 1');return true;}catch(e){if(e.code==='ER_NO_SUCH_TABLE')return false;throw e;}
}
export async function executeCustomReport(input){
 const config=validateCustomReport(input);
 // No product-level cap on accounts. Each account must be explicitly mapped and authorized.
 const mapped=await query('SELECT account_id,name,currency,timezone_name,slot,last_sync FROM ad_accounts WHERE slot IS NOT NULL ORDER BY slot');
 const byId=new Map(mapped.map(a=>[a.account_id,a]));
 if(config.accountIds.some(id=>!byId.has(id)))throw httpError(400,'All report accounts must be mapped and connected.','REPORT_ACCOUNT_UNAVAILABLE');
 const accounts=config.accountIds.map(id=>byId.get(id));
 const settings=await monitorSettings();
 const rows=[];let totalRaw=0;
 // Fetch one account and one bounded database page at a time: do not concatenate huge IN queries.
 // The UI submits batches to avoid tying up the Hostinger HTTP request for many accounts.
 for(const a of accounts){
  let offset=0;
  for(;;){
   const page=await query(`SELECT d.account_id,d.ad_id,d.ad_name,d.campaign_id,d.adset_id,
    DATE_FORMAT(d.day,'%Y-%m-%d') AS day,d.spend,d.impressions,d.clicks,d.actions_json,
    e.link_clicks AS inline_link_clicks
    FROM insight_daily d LEFT JOIN insight_extras e ON e.account_id=d.account_id AND e.ad_id=d.ad_id AND e.day=d.day
    WHERE d.account_id=? AND d.day BETWEEN ? AND ? ORDER BY d.ad_id,d.day LIMIT 1500 OFFSET ?`,[a.account_id,config.from,config.to,offset]);
   rows.push(...page);totalRaw+=page.length;
   if(totalRaw>100000)throw httpError(422,'Report is too large for one server request. Choose fewer accounts or a shorter date range. Existing data is unchanged.','REPORT_SIZE_LIMIT');
   if(page.length<1500)break;offset+=page.length;
  }
 }
 const groups=aggregateCustomReport(rows,accounts,config,settings);
 if(groups.length>25000)throw httpError(422,'Too many report groups. Use account or campaign grouping, or a shorter range.','REPORT_GROUP_LIMIT');
 const nativeGroups=new Map();for(const r of groups){const g=nativeGroups.get(r.currency)||{currency:r.currency,spend:0,hasSpend:false,groups:0};if(r.raw.spend!==null){g.spend+=r.raw.spend;g.hasSpend=true;}g.groups++;nativeGroups.set(r.currency,g);}
 const nativeTotals=[...nativeGroups.values()].map(g=>({...g,spend:g.hasSpend?g.spend:null}));
 return{config,rows:groups,generatedAt:new Date().toISOString(),selectedAccounts:accounts.length,groupCount:groups.length,sourceRows:totalRaw,
  nativeTotals,convertedSpend:convertTotals(nativeTotals,settings),
  notes:['Uses the latest stored Meta sync, not an independently verified live feed.','Date values are ad-account local reporting dates. A recent sync may revise previously attributed results.','Unreported conversions remain unavailable; Meta call clicks do not prove a completed phone call.','Converted totals use the manually configured reporting exchange rate and date.']};
}
export function customReportRoutes(){
 const r=Router();r.use(requireAuth);
 r.get('/fields',(req,res)=>res.json({metrics:REPORT_FIELDS,groups:REPORT_GROUPS}));
 r.post('/run',csrfGuard,async(req,res)=>{await limit('custom-report-run:'+req.user.id,30,60);res.json(await executeCustomReport(req.body));});
 r.get('/templates',async(req,res)=>{if(!await customReportSchemaReady())throw httpError(503,'Import sql/005-custom-reports.sql first.','CUSTOM_REPORT_SCHEMA_REQUIRED');const t=await query('SELECT id,name,config_json,created_at,updated_at FROM custom_report_templates ORDER BY updated_at DESC LIMIT 200');res.json({templates:t.map(x=>({id:x.id,name:x.name,config:parseJSON(x.config_json),createdAt:x.created_at,updatedAt:x.updated_at}))});});
 r.post('/templates',requireRole('super_admin','manager'),csrfGuard,async(req,res)=>{
  const config=validateCustomReport(req.body);if(!await customReportSchemaReady())throw httpError(503,'Import sql/005-custom-reports.sql first.');
  const id=randomUUID();await query('INSERT INTO custom_report_templates (id,name,owner_id,config_json) VALUES (?,?,?,?)',[id,config.name,req.user.id,JSON.stringify(config)]);await audit(req.user.id,'custom_report_template_saved',id);res.status(201).json({id,config});
 });
 r.delete('/templates/:id',requireRole('super_admin','manager'),csrfGuard,async(req,res)=>{
  const [t]=await query('SELECT owner_id FROM custom_report_templates WHERE id=?',[req.params.id]);if(!t)throw httpError(404,'Template not found.');if(req.user.role!=='super_admin'&&Number(t.owner_id)!==Number(req.user.id))throw httpError(403,'Only the owner or an administrator can delete this template.');
  await query('DELETE FROM custom_report_templates WHERE id=?',[req.params.id]);await audit(req.user.id,'custom_report_template_deleted',req.params.id);res.json({ok:true});
 });
 return r;
}
