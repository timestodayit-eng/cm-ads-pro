import test from 'node:test';import assert from 'node:assert/strict';
import {compactAiSnapshot,validateReport} from '../shared/reporting.js';
test('large advertising scopes use actual aggregate totals rather than failing at 250 ads',()=>{
 const data={totals:[{ref:'total:USD',currency:'USD',spend:10000}],accounts:Array.from({length:150},(_,i)=>({ref:`account:${i}`,spend:i,currency:'USD'})),ads:Array.from({length:480},(_,i)=>({ref:`ad:${i}`,spend:i,currency:'USD'})),windows:[],limitations:[]};
 const c=compactAiSnapshot(data);assert.equal(c.selectionCoverage.totalAds,480);assert.equal(c.ads.length,120);assert.equal(c.accounts.length,100);assert.equal(c.totals[0].spend,10000);assert.match(c.limitations.at(-1),/not exhaustive/);
 const report={summary:'Scoped results',findings:[{severity:'info',title:'Spend',observation:'USD total',evidence_refs:['total:USD'],next_step:'Review'}],data_limitations:[],needs_human_review:true};
 assert.equal(validateReport(report,c),report);
});
