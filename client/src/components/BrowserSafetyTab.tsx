import {useState} from 'react';
import {Link} from 'react-router-dom';
import {loadApiKeys} from '../api/apiKeyStorage';
import {Brief,Mode,Review,Source,loadReports,publicUrl,readArticle,runReview,saveReport,youtubeKey} from '../review/reviewEngine';

const emptyBrief:Brief={brand:'',audience:'',market:'',sensitivities:'',competitors:''};
const block={display:'flex',flexDirection:'column' as const,gap:10};
function download(report:Review) {
  const url=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:'application/json'}));
  const a=document.createElement('a');a.href=url;a.download='creator-review-'+report.channel.id+'-'+report.checkedAt.slice(0,10)+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
export default function BrowserSafetyTab() {
  const keys=loadApiKeys();
  const [input,setInput]=useState('');const [brief,setBrief]=useState<Brief>(emptyBrief);
  const [mode,setMode]=useState<Mode>('test');const [includeSearch,setIncludeSearch]=useState(false);
  const [sources,setSources]=useState<Source[]>([]);const [url,setUrl]=useState('');const [title,setTitle]=useState('');const [text,setText]=useState('');const [kind,setKind]=useState<Source['kind']>('supplied text');const [date,setDate]=useState('');
  const [report,setReport]=useState<Review|null>(null);const [history,setHistory]=useState(loadReports);
  const [busy,setBusy]=useState(false);const [error,setError]=useState('');const [notice,setNotice]=useState('');const [confirmed,setConfirmed]=useState(false);
  const [reviewer,setReviewer]=useState('');const [decision,setDecision]=useState('Pending review');const [notes,setNotes]=useState('');
  function selectReport(r:Review){setReport(r);setReviewer(r.reviewer);setDecision(r.decision);setNotes(r.notes);setConfirmed(false);}
  async function scan(force=false) {
    setBusy(true);setError('');setNotice('');setReport(null);setConfirmed(false);
    try {const r=await runReview(input,brief,mode,sources,keys,includeSearch,force);selectReport(r);setHistory(loadReports());}
    catch(e:any){setError(e.message||'The review failed. No safe outcome was inferred.');}
    finally{setBusy(false);}
  }
  function addSource() {
    try {
      if(sources.length>=10)throw Error('Use at most ten supporting sources.');
      if(text.trim().length<40)throw Error('Add the relevant source text, not just a URL.');
      setSources(prev=>[...prev,{id:'supplied'+prev.length,url:publicUrl(url),title:title.trim().slice(0,180)||url,text:text.trim().slice(0,24000),kind,publishedAt:date,retrievedAt:new Date().toISOString(),supplied:true}]);setText('');setTitle('');setUrl('');setDate('');setNotice('Source added. A shorter excerpt may be used to respect the selected usage limit.');setError('');
    }catch(e:any){setError(e.message);}
  }
  async function fetchSource() {
    setBusy(true);setError('');setNotice('');
    try{const s=await readArticle(url);setText(s.text);setTitle(s.title);setDate(s.publishedAt.slice(0,10));setKind('article');setNotice('Text loaded. Check it against the original page, then add the source.');}
    catch{setError('This site did not allow readable browser access. Open the source and paste the relevant article or transcript text below. No external proxy was used.');}
    finally{setBusy(false);}
  }
  function signOff() {
    if(!report||!confirmed||!reviewer.trim()||decision==='Pending review')return;
    const updated={...report,reviewer:reviewer.trim(),decision,notes:notes.trim(),reviewedAt:new Date().toISOString()};
    try{saveReport(updated);setReport(updated);setHistory(loadReports());setNotice('Human review saved. The evidence assessment remains unchanged.');}catch{setError('Could not save the sign off. Download the report and retain your review separately.');}
  }
  return <div className="card" style={block}>
    <h2>Creator evidence review</h2>
    <p>Check an exact YouTube channel, assess a defined text sample and record a human decision. Reputational concerns, content suitability and commercial suitability are reported separately.</p>
    <p className="text-muted">Uses the keys already saved in <Link to="/settings">Settings</Link> on this browser. YouTube: {youtubeKey(keys)?'saved key found':'key needed'}. OpenAI: {keys.openAiApiKey?'saved key found':'key needed'}. No Influencers Club connection is required.</p>
    <fieldset disabled={busy} style={block}>
      <legend>Channel and campaign</legend>
      <label>Exact YouTube channel URL, @handle or channel ID<input style={{width:'100%'}} value={input} maxLength={300} onChange={e=>setInput(e.target.value)} placeholder="https://www.youtube.com/@creator" /></label>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(210px,1fr))',gap:12}}>
        {([['brand','Client or brand'],['audience','Audience and age'],['market','Market'],['sensitivities','Restrictions and sensitive topics'],['competitors','Competitors and relevant partnerships']] as [keyof Brief,string][]).map(([key,label])=><label key={key}>{label}<textarea maxLength={600} style={{display:'block',width:'100%'}} value={brief[key]} onChange={e=>setBrief({...brief,[key]:e.target.value})} /></label>)}
      </div>
      <label>Review depth <select value={mode} onChange={e=>setMode(e.target.value as Mode)}><option value="test">Testing: five uploads, one GPT call</option><option value="standard">Standard: twenty uploads, one GPT call</option></select></label>
      <p className="text-muted">A fresh review normally makes two YouTube list requests. No broad YouTube search, automatic retries, comments or transcript downloads. Public data and identical assessments are reused for 24 hours. GPT output is capped at {mode==='test'?'1,800':'3,200'} tokens; source text is bounded too. A forced rescan bypasses both caches.</p>
      <label><input type="checkbox" checked={includeSearch} onChange={e=>setIncludeSearch(e.target.checked)} /> Include Google public reputation search ({mode==='test'?'one request':'up to three requests'}) using saved Search key and CX</label>
      <p className="text-muted">Google Custom Search is optional and closes on 1 January 2027. Without it, supply independent article evidence below. YouTube uploads alone do not establish public reputation coverage.</p>
    </fieldset>
    <details>
      <summary>Supporting articles, transcripts and responses ({sources.length}/10)</summary>
      <div style={block}>
        <p>For deeper checks, add original reporting, a creator response or a transcript. Reading a source here only works when that site permits browser access. YouTube API keys cannot download arbitrary creators’ captions. Supplied text is treated as user provided evidence, not independent verification.</p>
        <label>Source URL<input value={url} maxLength={2000} onChange={e=>setUrl(e.target.value)} style={{width:'100%'}} /></label>
        <div style={{display:'flex',gap:12,flexWrap:'wrap'}}><button disabled={busy||!url} onClick={fetchSource}>Read accessible article</button>{url&&(()=>{try{return <a href={publicUrl(url)} target="_blank" rel="noreferrer">Open original source</a>;}catch{return null;}})()}</div>
        <label>Source title<input value={title} maxLength={180} onChange={e=>setTitle(e.target.value)} /></label>
        <label>Source type <select value={kind} onChange={e=>setKind(e.target.value as Source['kind'])}><option value="supplied text">Pasted article or response</option><option value="article">Article text</option><option value="transcript">Video transcript</option></select></label>
        <label>Publication date, if known<input type="date" value={date} onChange={e=>setDate(e.target.value)} /></label>
        <label>Relevant text<textarea rows={7} maxLength={24000} value={text} onChange={e=>setText(e.target.value)} style={{width:'100%'}} /></label>
        <button disabled={busy} onClick={addSource}>Add source</button>
        {sources.map((s,i)=><div key={i}><a href={s.url} target="_blank" rel="noreferrer">{s.title}</a> ({s.kind}, {s.text.length.toLocaleString()} characters) <button disabled={busy} onClick={()=>setSources(prev=>prev.filter((_,n)=>n!==i))}>Remove</button></div>)}
      </div>
    </details>
    <div style={{display:'flex',gap:12,flexWrap:'wrap'}}>
      <button disabled={busy||!input.trim()||!keys.openAiApiKey||!youtubeKey(keys)} onClick={()=>scan()}>{busy?'Collecting and assessing evidence...':'Run review'}</button>
      <button className="secondary" disabled={busy||!input.trim()||!keys.openAiApiKey||!youtubeKey(keys)} onClick={()=>scan(true)}>Force fresh review</button>
    </div>
    {error&&<p role="alert" className="badge red">{error}</p>}{notice&&<p role="status">{notice}</p>}
    {report&&<section style={block}>
      <h3><a href={report.channel.url} target="_blank" rel="noreferrer">{report.channel.title}</a></h3><p>Channel ID: {report.channel.id}. Checked {new Date(report.checkedAt).toLocaleString()}.</p>
      <p>{report.summary}</p>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(210px,1fr))',gap:12}}>{Object.entries(report.outcomes).map(([area,outcome])=><div className="card" key={area}><strong>{area==='reputation'?'Public reputation':area==='content'?'Content suitability':'Commercial suitability'}</strong><p>{outcome}</p><small>Within reviewed evidence only. Human decision required.</small></div>)}</div>
      <h4>Evidence coverage</h4><p>{report.sources.filter(s=>s.kind==='video metadata').length} uploads, {report.sources.filter(s=>s.kind==='search snippet').length} search snippets, {report.sources.filter(s=>s.kind==='article'||s.kind==='supplied text').length} article or response excerpts, {report.sources.filter(s=>s.kind==='transcript').length} transcripts.</p>
      <ul>{report.warnings.map((w,i)=><li key={i}>{w}</li>)}</ul>
      <h4>Findings and context</h4>
      {!report.findings.length&&<p>No material findings were identified in the text provided. Check the coverage above before interpreting this result.</p>}
      {report.findings.map((f,i)=><article className="card" key={i}><h4>{f.topic}</h4><p>{f.area} · {f.status} · {f.concern}</p><p>{f.explanation}</p>{f.evidence.map((e,j)=>{const s=report.sources.find(x=>x.id===e.sourceId)!;return <div key={j}><blockquote>{e.quote}</blockquote><a href={s.url} target="_blank" rel="noreferrer">{s.title}</a><p className="text-muted">{s.kind}. Publication: {s.publishedAt||'unknown'}. Retrieved: {new Date(s.retrievedAt).toLocaleString()}. {s.supplied?'User supplied text.':''}</p></div>;})}</article>)}
      <details><summary>All reviewed source text</summary>{report.sources.map(s=><article key={s.id}><h4><a href={s.url} target="_blank" rel="noreferrer">{s.title}</a></h4><p>{s.kind} · {s.id}</p><p style={{whiteSpace:'pre-wrap'}}>{s.text}</p></article>)}</details>
      <h4>Usage for this run</h4><p>YouTube: {report.usage.youtubeRequests} requests (normally one quota unit each). Google Search: {report.usage.googleRequests} requests. OpenAI: {report.usage.openAiRequests} requests, {report.usage.inputTokens.toLocaleString()} input tokens and {report.usage.outputTokens.toLocaleString()} output tokens. Cache hits: {report.usage.cacheHits}. Model: {report.usage.model}.</p>
      <p className="text-muted">Token counts are returned by OpenAI. The app does not read your billing account. Failed requests may still consume provider usage.</p>
      <fieldset style={block}><legend>Human review</legend><p>Automated outcomes remain separate from your approval decision.</p><label>Reviewer<input value={reviewer} maxLength={150} onChange={e=>setReviewer(e.target.value)} /></label><label>Decision <select value={decision} onChange={e=>setDecision(e.target.value)}><option>Pending review</option><option>Approved for this campaign</option><option>Escalate for further review</option><option>Not approved for this campaign</option></select></label><label>Notes<textarea value={notes} maxLength={5000} onChange={e=>setNotes(e.target.value)} /></label><label><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)} /> I confirmed the channel identity, reviewed relevant original sources and checked content outside the automated text sample where needed.</label><button disabled={!confirmed||!reviewer.trim()||decision==='Pending review'} onClick={signOff}>Save human decision</button>{report.reviewedAt&&<p>Saved decision: {report.decision}, by {report.reviewer}, {new Date(report.reviewedAt).toLocaleString()}.</p>}</fieldset>
      <button onClick={()=>download(report)}>Download evidence report</button>
    </section>}
    <details><summary>Saved reviews on this browser ({history.length})</summary><p>Reports are held locally on this PC and browser. Download reports you need to retain. API keys are never included.</p>{history.map(r=><div key={r.id} style={{marginBottom:10}}><button onClick={()=>selectReport(r)}>{r.channel.title} · {new Date(r.checkedAt).toLocaleString()}</button> <button onClick={()=>download(r)}>Download</button></div>)}</details>
  </div>;
}
