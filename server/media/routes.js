import { Router } from 'express';
import { config,configuration } from '../config.js';
import { requireAuth,requireRole,csrfGuard,limit } from '../auth.js';
import { audit } from '../db.js';
import { httpError } from '../security.js';
import { MEDIA_TYPES, MAX_IMAGE_BYTES, PART_BYTES } from '../../shared/media.js';
import { mediaRepository,mediaSchemaReady } from './repository.js';
import { createMediaService,publicMedia } from './service.js';
import { storage,storageFailure } from './storage.js';
export function mediaRoutes(){
 const r=Router();r.use(requireAuth);
 r.get('/config',async(req,res)=>res.json({configured:configuration().storage,schemaReady:await mediaSchemaReady(),maxVideoBytes:config.storage.maxVideoBytes,maxImageBytes:MAX_IMAGE_BYTES,partSize:PART_BYTES,allowedTypes:Object.values(MEDIA_TYPES),quotaBytes:config.storage.quotaBytes,corsOrigin:config.origin}));
 r.use(async(req,res,next)=>{if(!await mediaSchemaReady())throw httpError(503,'Import sql/002-media-finance.sql into your existing Coastal database, then retry. No database reset is needed.','MEDIA_SCHEMA_REQUIRED');next();});
 r.get('/',async(req,res)=>{const offset=Math.max(0,Math.min(10000,Number(req.query.offset)||0));const rows=await mediaRepository.list(61,Math.floor(offset));res.json({assets:rows.slice(0,60).map(a=>publicMedia(a,req.user)),nextOffset:rows.length>60?offset+60:null});});
 r.post('/storage-check',requireRole('super_admin'),csrfGuard,async(req,res)=>{await limit('storage-check:'+req.user.id,10,5);try{await(await storage()).check();res.json({ok:true,message:'Server credentials can access the bucket. Browser CORS still needs a real upload test.'});}catch(e){throw storageFailure(e);}});
 async function service(){return createMediaService({repo:mediaRepository,store:await storage(),settings:config.storage});}
 const call=fn=>async(req,res)=>{try{await fn(req,res,await service());}catch(e){throw storageFailure(e);}};
 r.post('/uploads',requireRole('super_admin','manager'),csrfGuard,call(async(req,res,s)=>{await limit('media-start:'+req.user.id,40,60);res.status(201).json({asset:await s.initialize(req.body,req.user)});}));
 r.get('/uploads/:id',requireRole('super_admin','manager'),call(async(req,res,s)=>res.json(await s.parts(req.params.id,req.user))));
 r.post('/uploads/:id/parts',requireRole('super_admin','manager'),csrfGuard,call(async(req,res,s)=>{await limit('media-sign:'+req.user.id,1000,60);res.json(await s.sign(req.params.id,req.body.numbers,req.user));}));
 r.post('/uploads/:id/complete',requireRole('super_admin','manager'),csrfGuard,call(async(req,res,s)=>{await limit('media-complete:'+req.user.id,100,60);res.json({asset:await s.complete(req.params.id,req.user)});}));
 r.post('/uploads/:id/abort',requireRole('super_admin','manager'),csrfGuard,call(async(req,res,s)=>{res.json(await s.abort(req.params.id,req.user));}));
 r.get('/:id/preview',call(async(req,res,s)=>res.json(await s.preview(req.params.id,req.user))));
 r.delete('/:id',requireRole('super_admin','manager'),csrfGuard,call(async(req,res,s)=>{const result=await s.remove(req.params.id,req.user);await audit(req.user.id,'media_deleted',req.params.id);res.json(result);}));
 return r;
}
