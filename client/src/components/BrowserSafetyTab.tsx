import {useEffect,useRef,useState} from 'react';
import {Link} from 'react-router-dom';
import {loadApiKeys} from '../api/apiKeyStorage';
import {Brief,Mode,Review,Source,loadReports,publicUrl,readArticle,runReview,saveReport,youtubeKey} from '../review/reviewEngine';
import {Connections,checkConnections,initialConnections,parseChannelList} from '../review/connections';
import '../review/review.css';

const emptyBrief:Brief={brand:'',audience:'',market:'',sensitivities:'',competitors:''};
type Row={input:string;state:'Queued'|'Reviewing'|'Ready'|'Failed'|'Stopped';report?:Review;error?:string};
function download(report:Review){
  const url=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:'application/json'}));
  const a=document.createElement('a');a.href=url;a.download='creator-review-'+report.channel.id+'-'+report.checkedAt.slice(0,10)+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function outcomeStyle(outcome:string){return outcome==='Significant concern identified'?'danger':outcome==='Review required'?'attention':outcome==='No material concerns found'?'clear':'limited';}
export default function BrowserSafetyTab(){
  const keys=loadApiKeys();
  const [connections,setConnections]=useState<Connections>(()=>initialConnections(keys));
  const [input,setInput]=useState('');const [brief,setBrief]=useState<Brief>(emptyBrief);
  const [mode,setMode]=useState<Mode>('test');const [includeSearch,setIncludeSearch]=useState(false);
  const [sources,setSources]=useState<Source[]>([]);const [url,setUrl]=useState('');const [title,setTitle]=useState('');const [text,setText]=useState('');const [kind,setKind]=useState<Source['kind']>('supplied text');const [date,setDate]=useState('');
  const [report,setReport]=useState<Review|null>(null);const [history,setHistory]=useState(loadReports);
  const [busy,setBusy]=useState(false);const [error,setError]=useState('');const [notice,setNotice]=useState('');const [confirmed,setConfirmed]=useState(false);const [rows,setRows]=useState<Row[]>([]);
  const [reviewer,setReviewer]=useState('');const [decision,setDecision]=useState('Pending review');const [notes,setNotes]=useState('');
  const stop=useRef(false);
  useEffect(()=>{let active=true;void checkConnections(keys,(service,value)=>{if(active)setConnections(prev=>({...prev,[service]:value}));});return()=>{active=false;};},[]);
  function refreshConnections(){setConnections(initialConnections(keys));void checkConnections(keys,(service,value)=>setConnections(prev=>({...prev,[service]:value})),true);}
  function selectReport(r:Review){setReport(r);setReviewer(r.reviewer);setDecision(r.decision);setNotes(r.notes);setConfirmed(false);}
  async function scan(force=false){
    setError('');setNotice('');
    if(!keys.openAiApiKey||!youtubeKey(keys)){setError('Add the missing '+(!keys.openAiApiKey?'OpenAI':'YouTube')+' API key in Settings before running a review.');return;}
    let targets:ReturnType<typeof parseChannelList>;
    try{targets=parseChannelList(input);if(!targets.length)throw Error('Add at least one YouTube channel.');if(targets.length>1&&sources.length)throw Error('Review one channel at a time when adding supporting sources, so evidence is matched to the correct creator.');}catch(e:any){setError(e.message);return;}
    setBusy(true);setReport(null);setConfirmed(false);stop.current=false;
    setRows(targets.map(t=>({input:t.input,state:t.error?'Failed':'Queued',error:t.error})));
    let selected=false;
    try{
      for(let i=0;i<targets.length;i++){
        const target=targets[i];if(target.error)continue;
        if(stop.current){setRows(prev=>prev.map((r,n)=>n>=i&&r.state==='Queued'?{...r,state:'Stopped'}:r));break;}
        setRows(prev=>prev.map((r,n)=>n===i?{...r,state:'Reviewing'}:r));
        try{
          const result=await runReview(target.input,brief,mode,sources,keys,includeSearch,force);
          setRows(prev=>prev.map((r,n)=>n===i?{...r,state:'Ready',report:result}:r));
          setConnections(prev=>({...prev,...(result.usage.openAiRequests?{gpt:{state:'connected' as const,detail:'Assessment request succeeded'}}:{}),...(result.usage.youtubeRequests?{youtube:{state:'connected' as const,detail:'Channel resolved successfully'}}:{}),...(result.usage.googleRequests&&includeSearch&&!result.warnings.some(w=>w.includes('search failed'))?{google:{state:'connected' as const,detail:'Search request succeeded'}}:{})}));
          if(!selected){selectReport(result);selected=true;}setHistory(loadReports());
        }catch(e:any){
          const message=e.message||'The review could not complete. No review was saved.';
          setRows(prev=>prev.map((r,n)=>n===i?{...r,state:'Failed',error:message}:r));
          if(targets.length===1)setError(message);
          if(/quota|rate.?limit|429|insufficient_quota|invalid.*key|unauthori[sz]ed|401|403/i.test(message)){stop.current=true;setNotice('Batch paused after a provider access or quota error. Check the connection before retrying.');}
        }
      }
    }finally{setBusy(false);}
  }
  function addSource(){
    try{
      if(sources.length>=10)throw Error('Use at most ten supporting sources.');
      if(text.trim().length<40)throw Error('Add the relevant source text, not just a URL.');
      setSources(prev=>[...prev,{id:'supplied'+prev.length,url:publicUrl(url),title:title.trim().slice(0,180)||url,text:text.trim().slice(0,24000),kind,publishedAt:date,retrievedAt:new Date().toISOString(),supplied:true}]);
      setText('');setTitle('');setUrl('');setDate('');setNotice('Supporting source added.');setError('');
    }catch(e:any){setError(e.message);}
  }
  async function fetchSource(){
    setBusy(true);setError('');setNotice('');
    try{const s=await readArticle(url);setText(s.text);setTitle(s.title);setDate(s.publishedAt.slice(0,10));setKind('article');setNotice('Article loaded. Check the text and add the source.');}
    catch{setError('This site blocks browser reading. Open the source and paste the relevant text below.');}
    finally{setBusy(false);}
  }
  function signOff(){
    if(!report||!confirmed||!reviewer.trim()||decision==='Pending review')return;
    const updated={...report,reviewer:reviewer.trim(),decision,notes:notes.trim(),reviewedAt:new Date().toISOString()};
    try{saveReport(updated);setReport(updated);setHistory(loadReports());setNotice('Human decision saved.');}catch{setError('Your decision could not be saved. Download the report to retain it.');}
  }
  const readyCount=rows.filter(r=>r.state==='Ready').length;
  return <div className="review-shell">
    <header className="review-header">
      <div><span className="review-eyebrow">PRECISIFY / CREATOR INTELLIGENCE</span><h1>Creator review</h1><p>Clear findings. Traceable evidence. Better talent decisions.</p></div>
      <div className="review-connections">
        <div className="review-status-group" aria-label="API connections">
          {([['gpt','GPT'],['youtube','YouTube'],['google','Google Search']] as [keyof Connections,string][]).map(([id,label])=><Link to="/settings" key={id} className={'review-connection '+connections[id].state} aria-label={label+': '+connections[id].state} title={label+': '+connections[id].detail}><span aria-hidden="true" className="review-status-dot" />{label}</Link>)}
          <button className="review-icon-button" aria-label="Check connections" title="Check connections. Results are reused for ten minutes. GPT check uses no generation tokens; YouTube and Google checks each use one request." onClick={refreshConnections} disabled={busy}><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M20 7v5h-5M4 17v-5h5"/><path d="M6 8a7 7 0 0 1 12-2l2 3M4 15l2 3a7 7 0 0 0 12-2"/></svg></button>
        </div>
      </div>
    </header>
    <div className="review-workspace">
      <main className="review-main">
        <section className="review-panel">
          <div className="review-panel-heading"><span className="review-step">01</span><div><h2>Add your creators</h2><p>Paste YouTube channel URLs, @handles or channel IDs. One per line, up to 20.</p></div></div>
          <label className="review-field"><span className="review-sr-only">YouTube channels</span><textarea aria-label="YouTube channels" className="review-channel-input" value={input} maxLength={10000} rows={5} disabled={busy} onChange={e=>setInput(e.target.value)} placeholder={'https://www.youtube.com/@creator\n@anothercreator\nUC...'} /></label>
          <div className="review-input-footer"><span>Duplicates are removed automatically.</span><span>Exact channels only</span></div>
        </section>
        <section className="review-panel">
          <div className="review-panel-heading"><span className="review-step">02</span><div><h2>Campaign context</h2><p>Optional. Tailor the review to the brief.</p></div></div>
          <div className="review-form-grid">
            {([['brand','Client or brand','e.g. Client name'],['audience','Audience and age','e.g. Parents of children aged 6 to 12'],['market','Market','e.g. United Kingdom'],['competitors','Competitors','Brands or partnerships to check']] as [keyof Brief,string,string][]).map(([key,label,placeholder])=><label className="review-field" key={key}><span>{label}</span><input disabled={busy} maxLength={600} value={brief[key]} placeholder={placeholder} onChange={e=>setBrief({...brief,[key]:e.target.value})}/></label>)}
            <label className="review-field review-span"><span>Restrictions and sensitive topics</span><textarea disabled={busy} rows={2} maxLength={600} value={brief.sensitivities} placeholder="Anything the creator or content must avoid" onChange={e=>setBrief({...brief,sensitivities:e.target.value})}/></label>
          </div>
        </section>
        <details className="review-panel review-details">
          <summary><span className="review-summary-title">Supporting evidence</span><span className="review-pill">{sources.length} sources</span></summary>
          <div className="review-details-content"><p className="review-help">Add original reporting, a creator response or a transcript for a deeper check. Supporting sources apply to one creator at a time.</p>
            <label className="review-field"><span>Source URL</span><input value={url} disabled={busy} maxLength={2000} onChange={e=>setUrl(e.target.value)} placeholder="https://..." /></label>
            <div className="review-actions"><button className="review-button secondary" disabled={busy||!url} onClick={fetchSource}>Read article</button>{url&&(()=>{try{return <a href={publicUrl(url)} target="_blank" rel="noreferrer">Open original</a>;}catch{return null;}})()}</div>
            <div className="review-form-grid">
              <label className="review-field review-span"><span>Source title</span><input value={title} maxLength={180} onChange={e=>setTitle(e.target.value)} /></label>
              <label className="review-field"><span>Source type</span><select value={kind} onChange={e=>setKind(e.target.value as Source['kind'])}><option value="supplied text">Pasted article or response</option><option value="article">Article text</option><option value="transcript">Video transcript</option></select></label>
              <label className="review-field"><span>Publication date, if known</span><input type="date" value={date} onChange={e=>setDate(e.target.value)} /></label>
              <label className="review-field review-span"><span>Relevant text</span><textarea rows={5} maxLength={24000} value={text} onChange={e=>setText(e.target.value)} /></label>
            </div>
            <button className="review-button secondary" disabled={busy} onClick={addSource}>Add source</button>
            {sources.map((s,i)=><div className="review-source-row" key={i}><a href={s.url} target="_blank" rel="noreferrer">{s.title}</a><button className="review-text-button" disabled={busy} onClick={()=>setSources(prev=>prev.filter((_,n)=>n!==i))}>Remove</button></div>)}
          </div>
        </details>
      </main>
      <aside className="review-sidebar">
        <section className="review-panel review-run-panel"><span className="review-eyebrow">REVIEW OPTIONS</span><h2>Choose your depth</h2>
          <div className="review-mode-options">{([['test','Quick check','5 recent uploads','Lowest usage'],['standard','Standard review','20 recent uploads','Wider text sample']] as [Mode,string,string,string][]).map(([value,label,sample,hint])=><label key={value} className={'review-mode '+(mode===value?'selected':'')}><input type="radio" name="review-depth" value={value} checked={mode===value} onChange={()=>setMode(value)} disabled={busy}/><span><strong>{label}</strong><small>{sample}</small></span><span className="review-mode-hint">{hint}</span></label>)}</div>
          <label className="review-check"><input type="checkbox" checked={includeSearch} onChange={e=>setIncludeSearch(e.target.checked)} disabled={busy}/><span>Include public reputation search<small>{mode==='test'?'1':'Up to 3'} Google searches per creator</small></span></label>
          <div className="review-run-meta"><span>One GPT assessment per fresh creator</span><span>Cached results reused for 24 hours</span></div>
          <button className="review-button primary review-full" disabled={busy||!input.trim()} onClick={()=>scan()}>{busy?'Reviewing creators...':'Run review'}</button>
          <button className="review-text-button review-full" disabled={busy||!input.trim()} onClick={()=>scan(true)}>Run without cached results</button>
          {busy&&<button className="review-button secondary review-full" onClick={()=>{stop.current=true;setNotice('Stopping after the current creator finishes.');}}>Stop after this creator</button>}
        </section>
        <details className="review-panel review-details review-scope"><summary>What this checks</summary><div className="review-details-content"><p>Channel identity, recent upload text and any supporting sources you supply. Public search is optional.</p><p>Videos, audio and comments are not automatically watched or transcribed. Missing coverage is shown in the result.</p><p>Human approval is separate from automated findings.</p></div></details>
        <details className="review-panel review-details"><summary>Saved reviews <span className="review-pill">{history.length}</span></summary><div className="review-history">{history.length?history.map(r=><button key={r.id} className="review-history-item" onClick={()=>selectReport(r)}><strong>{r.channel.title}</strong><small>{new Date(r.checkedAt).toLocaleDateString()}</small></button>):<p className="review-help">Your reviews will appear here.</p>}</div></details>
      </aside>
    </div>
    {error&&<div role="alert" className="review-message error">{error}{/key|Settings/i.test(error)&&<> <Link to="/settings">Open Settings</Link></>}</div>}
    {notice&&<div role="status" className="review-message">{notice}</div>}
    {!!rows.length&&<section className="review-panel review-batch"><div className="review-section-title"><h2>{busy?'Review in progress':'Batch results'}</h2><span className="review-pill">{readyCount} of {rows.length} ready</span></div><div className="review-batch-list">{rows.map((row,i)=><div className="review-batch-row" key={i}><div><strong>{row.report?.channel.title||row.input}</strong>{row.error&&<small className="review-row-error">{row.error}</small>}</div><span className={'review-row-status '+row.state.toLowerCase()}>{row.state}</span>{row.report&&<button className="review-text-button" onClick={()=>selectReport(row.report!)}>View report</button>}</div>)}</div></section>}
    {report&&<section className="review-report">
      <div className="review-report-header"><div><span className="review-eyebrow">EVIDENCE REPORT</span><h2><a href={report.channel.url} target="_blank" rel="noreferrer">{report.channel.title}</a></h2><p>{new Date(report.checkedAt).toLocaleString()} · {report.mode==='test'?'Quick check':'Standard review'}</p></div><button className="review-button secondary" onClick={()=>download(report)}>Download report</button></div>
      <p className="review-report-summary">{report.summary}</p>
      <div className="review-outcomes">{Object.entries(report.outcomes).map(([area,outcome])=><div className={'review-outcome '+outcomeStyle(outcome)} key={area}><span>{area==='reputation'?'Public reputation':area==='content'?'Content suitability':'Commercial suitability'}</span><strong>{outcome}</strong><small>Within the reviewed evidence</small></div>)}</div>
      <div className="review-report-grid"><div className="review-findings"><h3>Findings and context</h3>
        {!report.findings.length&&<div className="review-panel review-empty"><strong>No verified findings in this sample</strong><p>Check the coverage and limitations before making a talent decision.</p></div>}
        {report.findings.map((f,i)=><article className="review-panel review-finding" key={i}><div className="review-finding-tags"><span>{f.area}</span><span>{f.status}</span><span>{f.concern}</span></div><h3>{f.topic}</h3><p>{f.explanation}</p>{f.evidence.map((e,j)=>{const s=report.sources.find(x=>x.id===e.sourceId);return s?<div className="review-citation" key={j}><blockquote>{e.quote}</blockquote><a href={s.url} target="_blank" rel="noreferrer">{s.title}</a><small>{s.kind} · {s.publishedAt?new Date(s.publishedAt).toLocaleDateString():'Publication date unknown'}{s.supplied?' · User supplied text':''}</small></div>:null;})}</article>)}
      </div><aside className="review-panel review-coverage"><h3>Review coverage</h3><dl>{[['Uploads',report.sources.filter(s=>s.kind==='video metadata').length],['Search results',report.sources.filter(s=>s.kind==='search snippet').length],['Article excerpts',report.sources.filter(s=>s.kind==='article'||s.kind==='supplied text').length],['Transcripts',report.sources.filter(s=>s.kind==='transcript').length]].map(([label,count])=><div key={label}><dt>{label}</dt><dd>{count}</dd></div>)}</dl><details className="review-details"><summary>Limitations and notes</summary><ul>{report.warnings.map((w,i)=><li key={i}>{w}</li>)}</ul></details><details className="review-details"><summary>Usage for this run</summary><p>YouTube requests: {report.usage.youtubeRequests}<br/>Google searches: {report.usage.googleRequests}<br/>GPT requests: {report.usage.openAiRequests}<br/>Input tokens: {report.usage.inputTokens.toLocaleString()}<br/>Output tokens: {report.usage.outputTokens.toLocaleString()}<br/>Cache hits: {report.usage.cacheHits}<br/>Model: {report.usage.model}</p></details></aside></div>
      <details className="review-panel review-details"><summary>All reviewed source text <span className="review-pill">{report.sources.length}</span></summary><div className="review-details-content">{report.sources.map(s=><article className="review-source-text" key={s.id}><h4><a href={s.url} target="_blank" rel="noreferrer">{s.title}</a></h4><small>{s.kind} · Retrieved {new Date(s.retrievedAt).toLocaleString()}</small><p>{s.text}</p></article>)}</div></details>
      <section className="review-panel review-signoff"><div className="review-panel-heading"><span className="review-step">03</span><div><h2>Human review</h2><p>Record the decision for this campaign.</p></div></div><div className="review-form-grid"><label className="review-field"><span>Reviewer</span><input value={reviewer} maxLength={150} onChange={e=>setReviewer(e.target.value)}/></label><label className="review-field"><span>Decision</span><select aria-label="Decision" value={decision} onChange={e=>setDecision(e.target.value)}><option>Pending review</option><option>Approved for this campaign</option><option>Escalate for further review</option><option>Not approved for this campaign</option></select></label><label className="review-field review-span"><span>Notes</span><textarea value={notes} rows={3} maxLength={5000} onChange={e=>setNotes(e.target.value)} /></label></div><label className="review-check"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/><span>I confirmed the channel identity, reviewed relevant original sources and checked content outside the automated text sample where needed.</span></label><div className="review-actions"><button className="review-button primary" disabled={!confirmed||!reviewer.trim()||decision==='Pending review'} onClick={signOff}>Save human decision</button>{report.reviewedAt&&<small>{report.decision} · {report.reviewer} · {new Date(report.reviewedAt).toLocaleDateString()}</small>}</div></section>
    </section>}
  </div>;
}
