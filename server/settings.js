import {Router} from 'express';
import {query,parseJSON,audit} from './db.js';
import {config} from './config.js';
import {requireRole,csrfGuard} from './auth.js';
import {httpError} from './security.js';
import {DEFAULT_MONITORING,validateMonitoring} from '../shared/monitoring.js';
export async function monitoringSchemaReady(){try{await query('SELECT id FROM workspace_settings LIMIT 1');return true;}catch(e){if(e.code==='ER_NO_SUCH_TABLE')return false;throw e;}}
export async function monitorSettings(){
 if(!await monitoringSchemaReady())return{...DEFAULT_MONITORING,schemaReady:false};
 const [row]=await query('SELECT config_json,updated_at FROM workspace_settings WHERE id=1');
 return{...DEFAULT_MONITORING,...parseJSON(row?.config_json,{}),schemaReady:true,updatedAt:row?.updated_at||null};
}
export function monitoringRoutes(){
 const r=Router();r.put('/',requireRole('super_admin'),csrfGuard,async(req,res)=>{
  if(!await monitoringSchemaReady())throw httpError(503,'Import sql/003-monitoring.sql into your existing database first.','MONITOR_SCHEMA_REQUIRED');
  const value=validateMonitoring(req.body);
  await query('INSERT INTO workspace_settings (id,config_json,updated_by) VALUES (1,?,?) ON DUPLICATE KEY UPDATE config_json=VALUES(config_json),updated_by=VALUES(updated_by)',[JSON.stringify(value),req.user.id]);
  await audit(req.user.id,'monitoring_settings_updated');res.json({settings:value,hostEnabled:config.monitor});
 });return r;
}
