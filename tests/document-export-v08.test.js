import test from 'node:test';
import assert from 'node:assert/strict';
import {exportDocument,printHtml} from '../server/document-export.js';
const doc={id:'example',title:'Report'},version={title:'Report',version_no:1,sources:{generatedAt:'2026-11-05'},sections:[{heading:'Spend',content:'Value: 25 USD <script>alert(1)</script>'}]};
test('print html safely encodes user material and offers print-to-PDF',()=>{
 const html=printHtml(doc,version);assert.match(html,/Save as PDF/);assert.match(html,/&lt;script&gt;/);assert.doesNotMatch(html,/<script>alert\(1\)<\/script>/);
});
test('CSV export encodes quotes, not attacker-provided formulas',async()=>{
 const r=await exportDocument(doc,{...version,sections:[{heading:'=INJECT',content:'Hello, "World"'}]},'csv');
 assert.match(r.content.toString('utf8'),/"'=INJECT"/);assert.match(r.content.toString('utf8'),/"Hello, ""World"""/);assert.equal(r.mime,'text/csv; charset=utf-8');
});
