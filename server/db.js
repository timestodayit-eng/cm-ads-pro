import mysql from 'mysql2/promise';
import { config, configuration } from './config.js';
let pool;
export function db() {
 if(!configuration().database) throw Object.assign(new Error('Configure the DB_* environment variables.'),{status:503,code:'DATABASE_NOT_CONFIGURED'});
 if(!pool){pool=mysql.createPool(config.db);pool.on('connection',c=>c.query("SET time_zone = '+00:00'"));}
 return pool;
}
export async function query(sql,params=[]) { const [rows]=await db().execute(sql,params);return rows; }
export async function transaction(fn) {
 const connection=await db().getConnection();
 try{await connection.beginTransaction();const result=await fn(connection);await connection.commit();return result;}
 catch(e){await connection.rollback();throw e;}finally{connection.release();}
}
export function parseJSON(value,fallback=null){if(value===null||value===undefined)return fallback;if(typeof value==='object')return value;try{return JSON.parse(value);}catch{return fallback;}}
export async function audit(userId,event,entityId=null) {await query('INSERT INTO audit_log (user_id,event_name,entity_id) VALUES (?,?,?)',[userId,event,entityId]);}
export async function closeDB(){if(pool)await pool.end();pool=undefined;}
