import { query, transaction } from '../db.js';
import { httpError } from '../security.js';
export const mediaRepository = {
 async get(id){return (await query('SELECT * FROM media_assets WHERE id=?',[id]))[0]||null;},
 async reserve(a, quotaBytes){return transaction(async c=>{
  await c.execute('SELECT id FROM app_locks WHERE id=1 FOR UPDATE');
  const [[existing]]=await c.execute('SELECT * FROM media_assets WHERE client_upload_id=?',[a.client_upload_id]);
  if(existing)return existing;
  const [[pending]]=await c.execute("SELECT COUNT(*) AS n FROM media_assets WHERE owner_id=? AND status IN ('initializing','uploading','completing')",[a.owner_id]);
  if(Number(pending.n)>=8)throw httpError(409,'Finish or cancel an existing upload before starting more (8 pending uploads maximum).','UPLOAD_PENDING_LIMIT');
  const [[size]]=await c.execute("SELECT COALESCE(SUM(byte_size),0) AS n FROM media_assets WHERE status NOT IN ('aborted','deleted')");
  if(Number(size.n)+a.byte_size>quotaBytes)throw httpError(409,'Workspace storage quota reached. Remove unused files or raise MEDIA_STORAGE_QUOTA_BYTES.','MEDIA_QUOTA');
  await c.execute(`INSERT INTO media_assets (id,client_upload_id,owner_id,original_name,mime_type,kind,byte_size,fingerprint,object_key,bucket_name,part_size,status,expires_at)
   VALUES (?,?,?,?,?,?,?,?,?,?,?,'initializing',DATE_ADD(UTC_TIMESTAMP(),INTERVAL 6 DAY))`,[a.id,a.client_upload_id,a.owner_id,a.original_name,a.mime_type,a.kind,a.byte_size,a.fingerprint,a.object_key,a.bucket_name,a.part_size]);
  return null;
 });},
 async setUploading(id,uploadId){await query("UPDATE media_assets SET upload_id=?,status='uploading',error_code=NULL WHERE id=? AND status='initializing'",[uploadId,id]);},
 async setState(id,status,error=null){await query('UPDATE media_assets SET status=?,error_code=?,updated_at=UTC_TIMESTAMP() WHERE id=?',[status,error,id]);},
 async claimComplete(id){const r=await query("UPDATE media_assets SET status='completing',updated_at=UTC_TIMESTAMP() WHERE id=? AND (status='uploading' OR (status='completing' AND updated_at<DATE_SUB(UTC_TIMESTAMP(),INTERVAL 2 MINUTE)))",[id]);return r.affectedRows===1;},
 async ready(id,userId){await transaction(async c=>{await c.execute("UPDATE media_assets SET status='ready',completed_at=UTC_TIMESTAMP(),upload_id=NULL,error_code=NULL WHERE id=?",[id]);await c.execute('INSERT INTO audit_log (user_id,event_name,entity_id) VALUES (?,\'media_uploaded\',?)',[userId,id]);});},
 async claimDelete(id){return transaction(async c=>{
  await c.execute('SELECT id FROM app_locks WHERE id=1 FOR UPDATE');
  const [[used]]=await c.execute('SELECT COUNT(*) AS n FROM draft_media WHERE media_id=?',[id]);
  if(Number(used.n))throw httpError(409,'This file is used by a saved draft. Remove those drafts before deleting the file.','MEDIA_IN_USE');
  const [r]=await c.execute("UPDATE media_assets SET status='deleting',updated_at=UTC_TIMESTAMP() WHERE id=? AND status IN ('ready','failed','aborted','deleting')",[id]);return r.affectedRows===1;
 });},
 async list(limit,offset){return query(`SELECT m.*, (SELECT COUNT(*) FROM draft_media d WHERE d.media_id=m.id) AS draft_count FROM media_assets m WHERE m.status NOT IN ('deleted','aborted') ORDER BY m.created_at DESC,m.id LIMIT ${limit} OFFSET ${offset}`);}
};
export async function mediaSchemaReady(){try{await query('SELECT id FROM media_assets LIMIT 1');await query('SELECT media_id FROM draft_media LIMIT 1');return true;}catch(e){if(['ER_NO_SUCH_TABLE','ER_BAD_FIELD_ERROR'].includes(e.code))return false;throw e;}}
