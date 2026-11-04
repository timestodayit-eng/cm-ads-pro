import {Router} from 'express';
import {query,audit} from './db.js';
import {csrfGuard,requireRole,limit} from './auth.js';
import {DEFAULT_PANEL_NAME,validatePanelName} from '../shared/branding.js';

// Keep login available even before the optional v0.5 migration is installed.
export async function readBranding(){
 try{
  const [row]=await query('SELECT panel_name,updated_at FROM workspace_branding WHERE id=1');
  return{panelName:row?.panel_name||DEFAULT_PANEL_NAME,updatedAt:row?.updated_at||null,configured:!!row};
 }catch(e){
  if(['ER_NO_SUCH_TABLE','ER_BAD_DB_ERROR','ENOTFOUND','ECONNREFUSED','ER_ACCESS_DENIED_ERROR'].includes(e.code))return{panelName:DEFAULT_PANEL_NAME,updatedAt:null,configured:false};
  throw e;
 }
}
export function brandingRoutes(){
 const r=Router();
 r.put('/',requireRole('super_admin'),csrfGuard,async(req,res)=>{
  await limit('brand-name:'+req.user.id,30,60);
  const panelName=validatePanelName(req.body?.panelName);
  try{await query('INSERT INTO workspace_branding (id,panel_name,updated_by) VALUES (1,?,?) ON DUPLICATE KEY UPDATE panel_name=VALUES(panel_name),updated_by=VALUES(updated_by)',[panelName,req.user.id]);}
  catch(e){if(e.code==='ER_NO_SUCH_TABLE')throw Object.assign(new Error('Import sql/006-workspace-branding.sql first.'),{status:503,code:'BRANDING_SCHEMA_REQUIRED'});throw e;}
  await audit(req.user.id,'panel_name_changed');res.json({panelName});
 });
 return r;
}
