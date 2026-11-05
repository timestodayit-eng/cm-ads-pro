import test from 'node:test';
import assert from 'node:assert/strict';
import {validateAccountScope,normalizeDocumentSections,summarizePerformance,versionLabel,htmlEscape} from '../shared/copilot.js';

test('account scope cannot silently broaden beyond mapped accounts',()=>{
 const mapped=new Set(['act_12','act_34']);assert.deepEqual(validateAccountScope(['act_12'],mapped),['act_12']);
 assert.throws(()=>validateAccountScope(['act_55'],mapped),{code:'COPILOT_ACCOUNT_DENIED'});
 assert.throws(()=>validateAccountScope(['act_12','act_12'],mapped),{code:'COPILOT_INVALID'});
 assert.deepEqual(validateAccountScope([],mapped),[]);
});
test('document validates sections and preserves user text safely',()=>{
 const sections=normalizeDocumentSections([{heading:'Executive Summary',content:'Bangla বাংলা; spending data.'}]);
 assert.equal(sections.length,1);assert.equal(sections[0].id,'section-1');
 assert.throws(()=>normalizeDocumentSections([]),{code:'DOCUMENT_INVALID'});
 assert.throws(()=>normalizeDocumentSections([{heading:'Budget',content:''}]),{code:'DOCUMENT_INVALID'});
 assert.throws(()=>normalizeDocumentSections([{heading:'Budget',content:'x'.repeat(25001)}]),{code:'DOCUMENT_INVALID'});
});
test('performance currencies never combine USD with BDT and null calls remain unavailable',()=>{
 const result=summarizePerformance({period:'today',accounts:[
  {accountId:'act_12',currency:'USD',metrics:{spend:10,impressions:200,linkClicks:4,calls:null,leads:2}},
  {accountId:'act_34',currency:'BDT',metrics:{spend:1000,impressions:2000,linkClicks:40,calls:3,leads:null}},
  {accountId:'act_56',currency:'USD',metrics:{spend:5,impressions:400,linkClicks:10,calls:null,leads:null}}
 ]});
 assert.equal(result.totalAccounts,3);assert.equal(result.currencyTotals.length,2);
 assert.equal(result.currencyTotals.find(x=>x.currency==='USD').spend,15);
 assert.equal(result.currencyTotals.find(x=>x.currency==='USD').calls,null);
 assert.equal(result.currencyTotals.find(x=>x.currency==='BDT').spend,1000);
 assert.equal(result.currencyTotals.find(x=>x.currency==='BDT').calls,3);
});
test('document version labels and output escaping',()=>{
 assert.equal(versionLabel(1),'1.0');assert.equal(versionLabel(2),'1.1');
 assert.equal(htmlEscape('<script>'), '&lt;script&gt;');
});
