import React,{useEffect,useMemo,useRef,useState} from 'react';
import {api,date} from '../api.js';
import {csvReport,REPORT_FIELDS,REPORT_GROUPS} from '../../../shared/custom-report.js';

const today=()=>new Date().toISOString().slice(0,10);
const daysAgo=n=>new Date(Date.now()-n*86400000).toISOString().slice(0,10);
const empty=()=>({name:'Custom performance report',accountIds:[],from:daysAgo(7),to:today(),groupBy:'account',metrics:['spend','impressions','linkClicks','leads','calls','linkCtr','costPerLead']});
function exportCSV(result){
 const csv=csvReport(result),url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
 const anchor=document.createElement('a');anchor.href=url;anchor.download='custom-meta-report-'+result.config.from+'-'+result.config.to+'.csv';anchor.click();setTimeout(()=>URL.revokeObjectURL(url),2000);
}
function moneyValue(v){return v===null||v===undefined?'—':Number(v).toLocaleString('en-US',{maximumFractionDigits:4});}
export default function CustomReports({accounts,user,notify}){
 const mapped=useMemo(()=>accounts.filter(a=>a.slot).sort((a,b)=>a.slot-b.slot),[accounts]);
 const [form,setForm]=useState(empty),[filter,setFilter]=useState(''),[showCount,setShowCount]=useState(80),[running,setRunning]=useState(false),[saving,setSaving]=useState(false),[result,setResult]=useState(null),[templates,setTemplates]=useState([]),[templateError,setTemplateError]=useState(''),[displayRows,setDisplayRows]=useState(150);
 const initialized=useRef(false);
 const signature=mapped.map(a=>a.account_id).join(',');
 useEffect(()=>{if(!mapped.length)return;setForm(p=>({...p,accountIds:initialized.current?p.accountIds.filter(id=>mapped.some(a=>a.account_id===id)):mapped.map(a=>a.account_id)}));initialized.current=true;},[signature]);
 async function loadTemplates(){try{const d=await api('/custom-reports/templates');setTemplates(d.templates||[]);setTemplateError('');}catch(e){setTemplateError(e.message);}}
 useEffect(()=>{loadTemplates();},[]);
 const visible=mapped.filter(a=>(`${a.name} ${a.account_id} CM-${a.slot}`).toLowerCase().includes(filter.toLowerCase()));
 function flip(id,on){setForm(p=>({...p,accountIds:on?[...p.accountIds,id]:p.accountIds.filter(x=>x!==id)}));}
 function chooseVisible(select){setForm(p=>({...p,accountIds:select?[...new Set([...p.accountIds,...visible.map(x=>x.account_id)])]:p.accountIds.filter(id=>!visible.some(x=>x.account_id===id))}));}
 async function run(e){e.preventDefault();setRunning(true);setResult(null);setDisplayRows(150);try{const data=await api('/custom-reports/run',{method:'POST',body:form});setResult(data);notify(`Report ready: ${data.selectedAccounts} account(s), ${data.groupCount} groups.`);}catch(e){notify(e.message,true);}finally{setRunning(false);}}
 async function save(){setSaving(true);try{await api('/custom-reports/templates',{method:'POST',body:form});notify('Custom report template saved.');await loadTemplates();}catch(e){notify(e.message,true);}finally{setSaving(false);}}
 function loadTemplate(id){const t=templates.find(x=>x.id===id);if(!t)return;setForm(t.config);setResult(null);}
 async function removeTemplate(id){if(!confirm('Delete this saved report template?'))return;try{await api('/custom-reports/templates/'+id,{method:'DELETE'});await loadTemplates();notify('Saved template deleted.');}catch(e){notify(e.message,true);}}
 return <div className="custom-reports">
  <div className="page-head"><div><span className="eyebrow">CUSTOM REPORT BUILDER</span><h1>Build the report you need.</h1><p>Select any number of mapped Meta ad accounts, measures and grouping. Export CSV or save your template.</p></div><span className="badge blue">{form.accountIds.length} selected</span></div>
  <div className="notice subtle">Meta reporting is based on last synced data and account reporting dates; recent attribution may change. Currencies remain separate. Large reports can require smaller date ranges due to server resource limits.</div>
  <div className="two-columns">
   <section className="panel padded"><h2>Report configuration</h2><form onSubmit={run}>
    <label className="field"><span>Report title</span><input required maxLength="120" value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></label>
    <div className="fields two"><label className="field"><span>From (account reporting date)</span><input required type="date" max={today()} value={form.from} onChange={e=>setForm({...form,from:e.target.value})}/></label><label className="field"><span>To (account reporting date)</span><input required type="date" max={today()} value={form.to} onChange={e=>setForm({...form,to:e.target.value})}/></label></div>
    <label className="field"><span>Group by</span><select value={form.groupBy} onChange={e=>setForm({...form,groupBy:e.target.value})}>{Object.entries(REPORT_GROUPS).map(([k,v])=><option value={k} key={k}>{v}</option>)}</select></label>
    <h3>Report columns</h3><div className="report-fields">{Object.entries(REPORT_FIELDS).map(([k,v])=><label key={k}><input type="checkbox" checked={form.metrics.includes(k)} onChange={e=>setForm(p=>({...p,metrics:e.target.checked?[...p.metrics,k]:p.metrics.filter(x=>x!==k)}))}/>{v}</label>)}</div>
    <div className="inline-actions" style={{marginTop:18,flexWrap:'wrap'}}><button className="button primary" disabled={running||!form.accountIds.length||!form.metrics.length}>{running?'Creating report…':'Generate custom report'}</button><button type="button" className="button secondary" disabled={saving||user.role==='analyst'||!form.accountIds.length} onClick={save}>{saving?'Saving…':'Save template'}</button></div>
   </form></section>
   <section className="panel padded"><div className="panel-title"><div><h2>Select mapped accounts</h2><small>Unlimited account selection in the interface · results are processed within server limits</small></div></div><input aria-label="Search accounts for report" placeholder="Search by name, ID or CM label" value={filter} onChange={e=>{setFilter(e.target.value);setShowCount(80);}}/>
    <div className="inline-actions" style={{margin:'12px 0',flexWrap:'wrap'}}><button className="button secondary small" onClick={()=>chooseVisible(true)}>Select all matching ({visible.length})</button><button className="button ghost small" onClick={()=>chooseVisible(false)}>Clear matching</button><span className="muted">{form.accountIds.length} / {mapped.length}</span></div>
    <div className="report-account-list">{visible.slice(0,showCount).map(a=><label className="report-account" key={a.account_id}><input type="checkbox" checked={form.accountIds.includes(a.account_id)} onChange={e=>flip(a.account_id,e.target.checked)}/><span><strong>CM-{String(a.slot).padStart(2,'0')} · {a.name}</strong><small>{a.account_id} · {a.currency} · {a.timezone_name}</small></span></label>)}{!visible.length&&<p className="muted">No matching mapped accounts. Connect and map accounts first.</p>}</div>
    {visible.length>showCount&&<button className="button secondary small" onClick={()=>setShowCount(n=>n+80)}>Show next 80</button>}
    <div className="saved-templates"><h3>Saved report templates</h3>{templateError&&<p className="muted">{templateError}</p>}{!templates.length&&!templateError&&<p className="muted">No templates saved yet.</p>}{templates.map(t=><div key={t.id} className="saved-template"><button className="button ghost small" onClick={()=>loadTemplate(t.id)}>{t.name}</button>{user.role!=='analyst'&&<button className="button ghost small danger-text" onClick={()=>removeTemplate(t.id)}>Delete</button>}</div>)}</div>
   </section>
  </div>
  {result&&<section className="panel padded custom-result"><div className="panel-title"><div><h2>{result.config.name}</h2><p className="muted">{result.selectedAccounts} accounts · {result.groupCount} rows · Generated {date(result.generatedAt)}</p></div><button className="button secondary small" onClick={()=>exportCSV(result)}>Download CSV</button></div>
    <div className="report-total-list">{result.nativeTotals.map(t=><div key={t.currency}><span>{t.currency} total spend</span><strong>{moneyValue(t.spend)}</strong></div>)}</div>
    {result.convertedSpend&&<div className="notice subtle">Converted spend is based on your manually configured exchange rates. Verify rate source/date in Settings before comparisons.</div>}
    <div className="table-wrap"><table><thead><tr><th>Account</th><th>Group</th>{result.config.metrics.map(k=><th key={k}>{REPORT_FIELDS[k]}</th>)}</tr></thead><tbody>{result.rows.slice(0,displayRows).map((r,i)=><tr key={r.accountId+'-'+r.dimension+'-'+i}><td><strong>{r.accountLabel}</strong><small>{r.accountName} · {r.currency}</small></td><td>{r.label}</td>{result.config.metrics.map(k=><td key={k}>{moneyValue(r.metrics[k])}</td>)}</tr>)}</tbody></table></div>
    {result.rows.length>displayRows&&<button className="button secondary small" onClick={()=>setDisplayRows(n=>n+150)}>Show next 150 rows</button>}
    <details className="data-details"><summary>Data notes</summary>{result.notes?.map((n,i)=><p key={i}>{n}</p>)}</details>
   </section>}
 </div>;
}
