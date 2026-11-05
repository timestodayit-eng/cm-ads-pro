import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const enabled=process.env.RUN_DB_TESTS==='true';
let server,base,query,closeDB,cookie='',csrf='';
const rawFetch=globalThis.fetch;
async function call(path,{method='GET',body,auth=true,origin='http://localhost',sendCsrf=true}={}){
 const r=await rawFetch(base+path,{method,redirect:'manual',headers:{Origin:origin,...(body?{'Content-Type':'application/json'}:{}),...(auth&&cookie?{Cookie:cookie}:{}),...(auth&&sendCsrf&&csrf?{'X-CSRF-Token':csrf}:{})},...(body?{body:JSON.stringify(body)}:{})});
 const type=r.headers.get('content-type')||'';const data=type.includes('json')?await r.json():await r.text();return{status:r.status,data,headers:r.headers};
}
before(async()=>{
 if(!enabled)return;
 Object.assign(process.env,{NODE_ENV:'test',APP_ORIGIN:'http://localhost',SESSION_SECRET:'test-session-secret-not-for-production-1234567890',FIRST_ADMIN_SETUP_SECRET:'test-setup-secret-not-for-production-1234567890',TOKEN_ENCRYPTION_KEY:'a1'.repeat(32),META_APP_ID:'100',META_APP_SECRET:'mock-secret-not-real',META_CONFIG_ID:'200',META_API_VERSION:'v99.0',META_REDIRECT_URI:'http://localhost/api/meta/callback'});
 ({query,closeDB}=await import('../../server/db.js'));
 for(const file of ['001-initial.sql','002-media-finance.sql','003-monitoring.sql','004-publishing.sql','005-custom-reports.sql','006-workspace-branding.sql','007-ai-copilot-documents.sql'])for(const statement of readFileSync(new URL('../../sql/'+file,import.meta.url),'utf8').replace(/^\s*--.*$/gm,'').split(';').map(s=>s.trim()).filter(Boolean))await query(statement);
 const{createApp}=await import('../../server/app.js');server=createApp().listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));base='http://127.0.0.1:'+server.address().port;
});
after(async()=>{globalThis.fetch=rawFetch;if(server)await new Promise(r=>server.close(r));if(closeDB)await closeDB();});
const it=(name,fn)=>test(name,{skip:!enabled},fn);
it('liveness and frontend are available',async()=>{const r=await call('/api/health');assert.equal(r.status,200);assert.equal(r.data.frontend,true);});
it('private dashboard requires login',async()=>assert.equal((await call('/api/overview',{auth:false})).status,401));
it('first admin created with setup key',async()=>{
 const r=await call('/api/auth/setup',{method:'POST',auth:false,body:{name:'CI Test Admin',email:'test@example.invalid',password:'long-test-password-123456',setupSecret:process.env.FIRST_ADMIN_SETUP_SECRET}});
 assert.equal(r.status,201);cookie=r.headers.get('set-cookie').split(';')[0];csrf=r.data.csrf;assert.equal(r.data.user.role,'super_admin');
});
it('public panel branding and administrator updates are validated and persisted',async()=>{
 const before=await call('/api/branding',{auth:false});assert.equal(before.status,200);assert.equal(before.data.panelName,'Coastal Ads Command Center');
 const denied=await call('/api/branding',{method:'PUT',auth:false,body:{panelName:'Unauthorized name'}});assert.equal(denied.status,401);
 const csrfDenied=await call('/api/branding',{method:'PUT',sendCsrf:false,body:{panelName:'Bad name'}});assert.equal(csrfDenied.status,403);
 const changed=await call('/api/branding',{method:'PUT',body:{panelName:'নতুন বিজ্ঞাপন ড্যাশবোর্ড'}});assert.equal(changed.status,200);assert.equal(changed.data.panelName,'নতুন বিজ্ঞাপন ড্যাশবোর্ড');
 assert.equal((await call('/api/branding',{auth:false})).data.panelName,'নতুন বিজ্ঞাপন ড্যাশবোর্ড');
 assert.equal((await call('/api/settings')).data.branding.panelName,'নতুন বিজ্ঞাপন ড্যাশবোর্ড');
 assert.equal((await call('/api/branding',{method:'PUT',body:{panelName:'<invalid>'}})).status,400);
});
it('setup closes after first admin',async()=>{const r=await call('/api/auth/setup',{method:'POST',body:{name:'Second',email:'second@example.invalid',password:'long-test-password-123456',setupSecret:process.env.FIRST_ADMIN_SETUP_SECRET}});assert.equal(r.status,409);});
it('session returns only safe user fields',async()=>{const r=await call('/api/auth/me');assert.equal(r.status,200);assert.equal(r.data.user.password_hash,undefined);});
it('cross-origin write rejected',async()=>assert.equal((await call('/api/reports',{method:'POST',origin:'https://attacker.invalid',body:{days:7}})).status,403));
it('missing CSRF rejected',async()=>assert.equal((await call('/api/meta/connect',{method:'POST',sendCsrf:false})).status,403));
it('unknown API does not return SPA HTML',async()=>{const r=await call('/api/does-not-exist');assert.equal(r.status,404);assert.equal(r.data.code,'API_NOT_FOUND');});
it('live publishing is explicitly blocked',async()=>assert.equal((await call('/api/publish',{method:'POST',body:{}})).status,501));
it('OAuth redirect and callback with mocked Meta',async()=>{
 const connect=await call('/api/meta/connect',{method:'POST'});assert.equal(connect.status,200);const url=new URL(connect.data.url);assert.equal(url.hostname,'www.facebook.com');assert.equal(url.searchParams.get('config_id'),'200');
 globalThis.fetch=async(url,options)=>{
  const u=new URL(String(url));if(u.hostname!=='graph.facebook.com')return rawFetch(url,options);
  if(u.pathname.endsWith('/oauth/access_token'))return Response.json({access_token:'test-token-never-use-live',expires_in:3600});
  if(u.pathname.endsWith('/me'))return Response.json({id:'42'});
  if(u.pathname.endsWith('/me/adaccounts'))return Response.json({data:[{id:'act_123',name:'Fixture account',currency:'USD',timezone_name:'Asia/Dhaka',account_status:1}]});
  throw new Error('Unexpected mock Meta path '+u.pathname);
 };
 const r=await call('/api/meta/callback?state='+encodeURIComponent(url.searchParams.get('state'))+'&code=mock-code');assert.equal(r.status,302);assert.match(r.headers.get('location'),/meta=connected/);
 const [conn]=await query('SELECT * FROM meta_connections');assert.ok(conn.token_cipher.startsWith('v1:'));assert.ok(!conn.token_cipher.includes('test-token'));
 const discovered=await call('/api/meta/discover',{method:'POST',body:{connectionId:conn.id}});assert.equal(discovered.data.found,1);
 const mapping=await call('/api/meta/mapping',{method:'POST',body:{accounts:[{account_id:'act_123',slot:1}]}});assert.equal(mapping.status,200);
 globalThis.fetch=rawFetch;
});
it('OAuth state cannot be reused',async()=>{const r=await call('/api/meta/callback?state=reused-or-invalid&code=test');assert.equal(r.status,302);assert.match(r.headers.get('location'),/meta=failed/);});
it('draft stored without any Meta write',async()=>{
 const r=await call('/api/drafts',{method:'POST',body:{name:'Test only',currency:'USD',baseBudget:10,increment:2,contents:[{caption:'Shared',headline:'Test',title:'One'}],targets:[{accountId:'act_123',ageMin:18,ageMax:65}]}});
 assert.equal(r.status,201);assert.equal(r.data.plan.totals.adsets,1);const d=await call('/api/drafts');assert.equal(d.data.drafts.length,1);
});
it('default monitoring interval and storage state returned safely',async()=>{
 const r=await call('/api/settings');assert.equal(r.status,200);assert.equal(r.data.monitoring.intervalMinutes,5);assert.equal(r.data.monitoring.schemaReady,true);assert.equal(r.data.OPENAI_API_KEY,undefined);
});
it('only an authenticated CSRF-protected administrator can change cadence',async()=>{
 const settings=(await call('/api/settings')).data.monitoring;
 assert.equal((await call('/api/settings/monitoring',{method:'PUT',auth:false,body:settings})).status,401);
 assert.equal((await call('/api/settings/monitoring',{method:'PUT',sendCsrf:false,body:settings})).status,403);
 const r=await call('/api/settings/monitoring',{method:'PUT',body:{...settings,intervalMinutes:10}});assert.equal(r.status,200);
 assert.equal((await call('/api/settings')).data.monitoring.intervalMinutes,10);
 assert.equal((await call('/api/settings/monitoring',{method:'PUT',body:{...settings,intervalMinutes:1}})).status,400);
});
it('manual all-account sync is deduplicated against the active queue',async()=>{
 const r=await call('/api/sync/all',{method:'POST'});assert.equal(r.status,202);assert.equal(r.data.accounts,1);
 await call('/api/sync/all',{method:'POST'});
 const [row]=await query("SELECT COUNT(*) AS n FROM jobs WHERE kind='sync_account' AND status IN ('queued','running')");assert.equal(Number(row.n),1);
 const status=await call('/api/sync/status');assert.equal(status.status,200);assert.equal(status.data.accounts[0].status,'queued');assert.equal(status.data.scheduler.healthy,false);
});
it('custom report fields, templates and large-selection query paths respond safely',async()=>{
 const fields=await call('/api/custom-reports/fields');assert.equal(fields.status,200);assert.ok(fields.data.metrics.linkClicks);
 const config={name:'Morning view',accountIds:['act_123'],from:'2026-10-01',to:'2026-10-02',groupBy:'account',metrics:['spend','impressions']};
 const stored=await call('/api/custom-reports/templates',{method:'POST',body:config});assert.equal(stored.status,201);
 const listing=await call('/api/custom-reports/templates');assert.equal(listing.status,200);assert.ok(listing.data.templates.some(t=>t.id===stored.data.id));
 const r=await call('/api/custom-reports/run',{method:'POST',body:config});assert.equal(r.status,200);assert.equal(r.data.selectedAccounts,1);
 const perf=await call('/api/performance/query',{method:'POST',body:{period:'today',accountIds:['act_123']}});assert.equal(perf.status,200);
 const finance=await call('/api/finance/query',{method:'POST',body:{accountIds:['act_123']}});assert.equal(finance.status,200);
 const deleted=await call('/api/custom-reports/templates/'+stored.data.id,{method:'DELETE'});assert.equal(deleted.status,200);
});
it('AI conversations and editable document versions persist and enforce safe export',async()=>{
 const created=await call('/api/copilot/conversations',{method:'POST',body:{title:'My test analysis',accountIds:['act_123']}});
 assert.equal(created.status,201);const convoId=created.data.id;
 const list=await call('/api/copilot/conversations');assert.ok(list.data.conversations.some(c=>c.id===convoId));
 const denied=await call('/api/copilot/conversations/'+convoId+'/messages',{method:'POST',body:{message:'Show today result'}});
 assert.equal(denied.status,503);assert.equal(denied.data.code,'OPENAI_NOT_CONFIGURED');
 const doc=await call('/api/documents',{method:'POST',body:{title:'Operations report',sections:[{heading:'Executive Summary',content:'Performance data is pending sync.'}]}});
 assert.equal(doc.status,201);assert.equal(doc.data.version,1);
 const id=doc.data.id;const detail=await call('/api/documents/'+id);assert.equal(detail.status,200);assert.equal(detail.data.version.sections.length,1);
 const edited=await call('/api/documents/'+id,{method:'PUT',body:{expectedVersion:1,title:'Operations report',sections:[{heading:'Executive Summary',content:'Revised for management.'}]}});
 assert.equal(edited.status,200);assert.equal(edited.data.version,2);
 const conflict=await call('/api/documents/'+id,{method:'PUT',body:{expectedVersion:1,title:'Operations report',sections:[{heading:'Executive Summary',content:'Old version'}]}});
 assert.equal(conflict.status,409);assert.equal(conflict.data.code,'DOC_VERSION_CONFLICT');
 const old=await call('/api/documents/'+id+'/versions/1');assert.equal(old.status,200);
 const html=await call('/api/documents/'+id+'/export?format=html');assert.equal(html.status,200);assert.match(html.data,/Save as PDF/);
 const csv=await call('/api/documents/'+id+'/export?format=csv');assert.equal(csv.status,200);
 const restored=await call('/api/documents/'+id+'/restore',{method:'POST',body:{version:1}});assert.equal(restored.data.version,3);
 const final=await call('/api/documents/'+id+'/finalize',{method:'POST'});assert.equal(final.status,200);
});
it('hourly dashboard never invents unsynced spend',async()=>{
 const r=await call('/api/performance?period=12h');assert.equal(r.status,200);assert.equal(r.data.accounts[0].metrics.spend,null);assert.equal(r.data.accounts[0].metrics.calls,null);
});
it('media config without R2 leaves login working and upload explicitly disabled',async()=>{
 const r=await call('/api/media/config');assert.equal(r.status,200);assert.equal(r.data.schemaReady,true);assert.equal(r.data.configured,false);
});
it('password change revokes the old session',async()=>{
 const oldCookie=cookie,oldCsrf=csrf;const r=await call('/api/auth/password',{method:'POST',body:{currentPassword:'long-test-password-123456',newPassword:'new-long-test-password-123456'}});assert.equal(r.status,200);
 const nextCookie=r.headers.get('set-cookie').split(';')[0],nextCsrf=r.data.csrf;
 cookie=oldCookie;csrf=oldCsrf;assert.equal((await call('/api/auth/me')).status,401);cookie=nextCookie;csrf=nextCsrf;assert.equal((await call('/api/auth/me')).status,200);
});
it('logout revokes the session',async()=>{assert.equal((await call('/api/auth/logout',{method:'POST'})).status,200);assert.equal((await call('/api/auth/me')).status,401);});
