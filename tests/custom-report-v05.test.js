import test from 'node:test';
import assert from 'node:assert/strict';
import {validateCustomReport,aggregateCustomReport,csvReport} from '../shared/custom-report.js';
import {validatePanelName,DEFAULT_PANEL_NAME} from '../shared/branding.js';
const input=()=>({name:'Coastal report',accountIds:Array.from({length:150},(_,i)=>`act_${i+100}`),from:'2026-10-01',to:'2026-10-02',groupBy:'account',metrics:['spend','impressions','linkClicks','leads','linkCtr']});
test('custom report supports more than 12 or 100 unique accounts',()=>{const x=validateCustomReport(input());assert.equal(x.accountIds.length,150);});
test('custom report protects against duplicate accounts and unknown metrics',()=>{let x=input();x.accountIds[5]=x.accountIds[0];assert.throws(()=>validateCustomReport(x));x=input();x.metrics=['unknown'];assert.throws(()=>validateCustomReport(x));});
test('report computes account groups without collapsing currencies',()=>{
 const config=validateCustomReport({...input(),accountIds:['act_100','act_101']});
 const accounts=[{account_id:'act_100',name:'A',slot:1,currency:'USD',timezone_name:'America/New_York',last_sync:null},{account_id:'act_101',name:'B',slot:2,currency:'BDT',timezone_name:'Asia/Dhaka',last_sync:null}];
 const rows=[{account_id:'act_100',day:'2026-10-01',spend:10,impressions:100,clicks:11,inline_link_clicks:5,actions_json:[]},{account_id:'act_101',day:'2026-10-01',spend:100,impressions:1000,clicks:20,inline_link_clicks:10,actions_json:[]}];
 const out=aggregateCustomReport(rows,accounts,config,{leadActionType:'lead',callActionType:''});assert.equal(out.length,2);assert.deepEqual(new Set(out.map(x=>x.currency)),new Set(['USD','BDT']));assert.equal(out.find(x=>x.currency==='USD').metrics.linkCtr,5);assert.match(csvReport({config,rows:out}),/Link CTR/);
});
test('CSV export shields spreadsheet formula injection',()=>{
 const req=validateCustomReport({...input(),accountIds:['act_100'],metrics:['spend']});const row={accountLabel:'CM-01',accountName:'=SUM(A1:A3)',accountId:'act_100',currency:'USD',timezone:'UTC',dimension:'ad',label:'-cmd',lastSyncedAt:null,sourceRows:1,metrics:{spend:8}};
 const csv=csvReport({config:req,rows:[row]});assert.match(csv,/"'=SUM/);assert.match(csv,/"'-cmd"/);
});
test('panel name allows natural Bengali and English, strips whitespace',()=>{assert.equal(validatePanelName('  My   Ads Panel  '),'My Ads Panel');assert.equal(validatePanelName('কোস্টাল অ্যাডস সেন্টার'),'কোস্টাল অ্যাডস সেন্টার');assert.ok(DEFAULT_PANEL_NAME.includes('Coastal'));});
test('panel name rejects invalid tags, control characters and overlong names',()=>{for(const x of ['a','<script>','Hi\nThere','X'.repeat(81),null])assert.throws(()=>validatePanelName(x));});
