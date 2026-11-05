import React,{useEffect,useState} from 'react';
import {api} from '../api.js';
import {Badge,Field,Notice} from './ui.jsx';

const suggestions=[
 'আজকে আমার সব Ad Account-এর রেজাল্ট কী? Currency অনুযায়ী হিসাব করো।',
 'গত ৭ দিনে কোন Account-এ Spend বেশি কিন্তু Link Click কম? কারণ বিশ্লেষণ করো।',
 'আমার সাম্প্রতিক Failed Meta Publishing-এর আসল Error কী এবং কীভাবে ঠিক করব?',
 'Scheduler ঠিকমতো চলছে? Overdue Job আছে কি?',
 'গত ৭ দিনের ডেটা দেখে আমার জন্য Evidence-based Budget Optimization Plan দাও।'
];
export default function AICopilot({accounts,user,notify,onDocument,onCampaign}){
 const [conversations,setConversations]=useState([]),[activeId,setActiveId]=useState(''),[messages,setMessages]=useState([]),[question,setQuestion]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [selectedIds,setSelectedIds]=useState([]),[pickerOpen,setPickerOpen]=useState(false),[filter,setFilter]=useState(''),[documentTitle,setDocumentTitle]=useState('Advertising performance review'),[documentPeriod,setDocumentPeriod]=useState('7d');
 const mapped=accounts.filter(x=>x.slot);
 const load=async()=>{try{const d=await api('/copilot/conversations');setConversations(d.conversations||[]);}catch(e){setError(e.message);}};
 useEffect(()=>{load();},[]);
 async function open(id){setError('');try{const d=await api('/copilot/conversations/'+id);setActiveId(id);setMessages(d.messages||[]);setPickerOpen(false);}catch(e){setError(e.message);}}
 async function create(){setBusy(true);setError('');try{const result=await api('/copilot/conversations',{method:'POST',body:{title:'New analysis',accountIds:selectedIds}});await load();setActiveId(result.id);setMessages([]);setPickerOpen(false);notify('New private AI conversation created.');}catch(e){setError(e.message);}finally{setBusy(false);}}
 async function send(text=question){const message=String(text||'').trim();if(message.length<2||busy)return;setBusy(true);setError('');let id=activeId;try{
  if(!id){const r=await api('/copilot/conversations',{method:'POST',body:{title:message.slice(0,95),accountIds:selectedIds}});id=r.id;setActiveId(id);await load();}
  setMessages(s=>[...s,{id:'local-'+Date.now(),role:'user',content:message}]);setQuestion('');
  const r=await api('/copilot/conversations/'+id+'/messages',{method:'POST',body:{message}});setMessages(s=>[...s,r.message]);await load();
 }catch(e){setError(e.message);await open(id).catch(()=>{});}finally{setBusy(false);}}
 async function makeDocument(){if(!activeId||busy)return;setBusy(true);setError('');try{
  const d=await api('/documents/generate',{method:'POST',body:{conversationId:activeId,title:documentTitle,period:documentPeriod}});
  notify('Editable document version 1.0 created with a saved data-source reference.');onDocument?.(d.id);
 }catch(e){setError(e.message);}finally{setBusy(false);}}
 const shown=mapped.filter(a=>(a.name+' '+a.account_id).toLowerCase().includes(filter.toLowerCase())).slice(0,160);
 return <><div className="page-head"><div><span className="eyebrow">AI BUSINESS INTELLIGENCE</span><h1>AI Ads Copilot</h1><p>Ask real questions about Meta spend, results, publishing failures and your campaign strategy—Bangla, Banglish or English.</p></div><Badge tone="blue">Read-only analysis · Actions need approval</Badge></div>
 <div className="copilot-layout">
  <aside className="panel padded copilot-sidebar"><button className="button primary full" onClick={()=>setPickerOpen(true)} disabled={busy}>+ New conversation</button><p className="muted small-text">The current release uses the connected workspace's mapped accounts. Select a subset when starting a chat.</p><h3>Chat history</h3><div className="copilot-chat-list">{conversations.map(c=><button key={c.id} className={'copilot-history '+(activeId===c.id?'selected':'')} onClick={()=>open(c.id)}><strong>{c.title}</strong><small>{new Date(c.updated_at).toLocaleString()}</small></button>)}</div></aside>
  <div className="panel padded copilot-main">
   {pickerOpen&&<section className="copilot-scope"><h3>Select accounts for the new conversation</h3><p className="muted small-text">Leave all unchecked for all mapped accounts, or select an explicit set. This scope is fixed for this conversation.</p><div className="fields two"><Field label="Search accounts"><input value={filter} onChange={e=>setFilter(e.target.value)} placeholder="Search mapped accounts"/></Field><div className="copilot-inline"><button className="button secondary small" onClick={()=>setSelectedIds(mapped.map(a=>a.account_id))}>Select all</button><button className="button secondary small" onClick={()=>setSelectedIds([])}>Use all by default</button></div></div><div className="copilot-account-picker">{shown.map(a=><label key={a.account_id}><input type="checkbox" checked={selectedIds.includes(a.account_id)} onChange={e=>setSelectedIds(s=>e.target.checked?[...s,a.account_id]:s.filter(x=>x!==a.account_id))}/><span>{a.name} <small>{a.currency}</small></span></label>)}</div><p className="muted small-text">Selected: {selectedIds.length||`All ${mapped.length}`} {shown.length< mapped.length&&'· Search to select additional accounts.'}</p><div className="copilot-inline"><button className="button primary" disabled={busy} onClick={create}>Start conversation</button><button className="button secondary" onClick={()=>setPickerOpen(false)}>Cancel</button></div></section>}
   {!messages.length&&!pickerOpen&&<div className="copilot-welcome"><div className="copilot-orb">✦</div><h2>What should we analyze today?</h2><p>Ask about actual advertising data. The assistant uses server-side tools, cites the data window and does not change live ads.</p><div className="copilot-suggestions">{suggestions.map((s,i)=><button key={i} onClick={()=>send(s)} disabled={busy}>{s}</button>)}</div></div>}
   <div className="copilot-messages" role="log" aria-live="polite">{messages.map((m,i)=><div className={'copilot-message '+m.role} key={m.id||i}><div className="copilot-message-label">{m.role==='user'?'You':'AI Ads Copilot'}</div><div className="copilot-message-content">{m.content}</div>{m.evidence?.length>0&&<div className="copilot-evidence">Used data tools: {m.evidence.map(x=>x.tool).join(', ')}</div>}</div>)}{busy&&<p className="muted">Working with available data or generating your document…</p>}</div>
   {error&&<Notice tone="danger">{error}</Notice>}
   <div className="copilot-compose"><textarea rows={3} aria-label="Ask your Ads Copilot" placeholder="আজকের Result কেমন? কোন Account ভালো? Meta Ads কেন Failed?" value={question} onChange={e=>setQuestion(e.target.value)} onKeyDown={e=>{if((e.metaKey||e.ctrlKey)&&e.key==='Enter'){e.preventDefault();send();}}}/><div className="copilot-inline"><button className="button primary" disabled={busy||question.trim().length<2} onClick={()=>send()}>Ask AI</button><button className="button secondary" disabled={!question.trim()} onClick={()=>onCampaign?.(question)}>Prepare campaign in AI Command Center</button></div><p className="muted small-text">Ctrl/⌘ + Enter to send. All ad creation and activation still require separate human approval.</p></div>
   <div className="copilot-doc-actions"><h3>Create a versioned document from this conversation</h3><div className="fields two"><Field label="Document title"><input value={documentTitle} onChange={e=>setDocumentTitle(e.target.value)} maxLength={180}/></Field><Field label="Fresh data window"><select value={documentPeriod} onChange={e=>setDocumentPeriod(e.target.value)}><option value="today">Today</option><option value="yesterday">Yesterday</option><option value="3d">Last 3 days</option><option value="7d">Last 7 days</option></select></Field></div><button className="button secondary" disabled={!activeId||!messages.length||busy} onClick={makeDocument}>Generate editable document</button><p className="muted small-text">AI Documents saves the full sections, version history and data-source timestamp. Reports with insufficient data will explain the gaps.</p></div>
  </div>
 </div></>;
}
