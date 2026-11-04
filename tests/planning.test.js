import test from 'node:test';
import assert from 'node:assert/strict';
import {buildPlan} from '../shared/planning.js';
function fixture(n=12,c=5){return{name:'Test campaign',currency:'USD',baseBudget:10,increment:2,category:'none',contents:Array.from({length:c},(_,i)=>({id:'c'+i,title:'Video '+i,caption:'Shared caption '+i,headline:'Shared headline '+i,cta:'CALL_NOW'})),targets:Array.from({length:n},(_,i)=>({accountId:'act_'+(i+1),label:'CM-'+(i+1),ageMin:18,ageMax:45,phone:'+8801969918811'}))};}
test('twelve accounts with five creatives creates sixty ad-set intents',()=>{const p=buildPlan(fixture());assert.deepEqual(p.totals,{campaigns:12,adsets:60,ads:60,dailyMinor:126000});});
test('budget increments and per-account totals use integer minor units',()=>{const p=buildPlan(fixture(3,2));assert.deepEqual(p.allocations.map(a=>a.perAdsetMinor),[1000,1200,1400]);assert.deepEqual(p.allocations.map(a=>a.totalDailyMinor),[2000,2400,2800]);});
test('manual override affects only selected account',()=>{const x=fixture(3,2);x.targets[1].budgetOverride=25;const p=buildPlan(x);assert.deepEqual(p.allocations.map(a=>a.perAdsetMinor),[1000,2500,1400]);});
test('creatives and copy remain shared',()=>{const p=buildPlan(fixture(2,3));assert.equal(p.contents[1].caption,'Shared caption 1');assert.equal(p.contents.length,3);assert.equal(p.allocations.length,2);});
test('duplicate accounts rejected',()=>{const x=fixture(2);x.targets[1].accountId=x.targets[0].accountId;assert.throws(()=>buildPlan(x));});
test('more than twelve authorized accounts can be planned',()=>{const p=buildPlan(fixture(25,1));assert.equal(p.allocations.length,25);assert.equal(p.totals.campaigns,25);assert.equal(p.allocations[24].perAdsetMinor,5800);});
test('empty creatives rejected',()=>assert.throws(()=>buildPlan(fixture(1,0))));
test('zero budget rejected',()=>{const x=fixture();x.baseBudget=0;assert.throws(()=>buildPlan(x));});
test('negative resulting budget rejected',()=>{const x=fixture();x.increment=-20;assert.throws(()=>buildPlan(x));});
test('fractional cents rejected',()=>{const x=fixture();x.baseBudget=10.123;assert.throws(()=>buildPlan(x));});
test('invalid age range rejected',()=>{const x=fixture();x.targets[0].ageMin=50;x.targets[0].ageMax=40;assert.throws(()=>buildPlan(x));});
test('end before start rejected',()=>{const x=fixture();x.targets[0].startAt='2026-11-05T12:00:00Z';x.targets[0].endAt='2026-11-04T12:00:00Z';assert.throws(()=>buildPlan(x));});
test('insecure media references rejected',()=>{const x=fixture();x.contents[0].mediaUrl='javascript:alert(1)';assert.throws(()=>buildPlan(x));});
test('unknown currency rejected for two-decimal budget builder',()=>{const x=fixture();x.currency='JPY';assert.throws(()=>buildPlan(x));});
