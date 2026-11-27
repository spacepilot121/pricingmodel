import {useState} from 'react';
import {influencersRequest} from '../api/influencersClubClient';
export default function InfluencersClubTester({apiKey,onApiKeyChange}:{apiKey?:string;onApiKeyChange:(value:string)=>void}) {
  const [handle,setHandle]=useState('');const [platform,setPlatform]=useState('youtube');
  const [response,setResponse]=useState('');const [busy,setBusy]=useState(false);
  async function run() {
    setBusy(true);setResponse('');
    try {const data=await influencersRequest('profile',{handle:handle.trim(),platform,email_required:'preferred'},apiKey,{force:true});setResponse(JSON.stringify(data,null,2));}
    catch(error:any){setResponse(error.message);}
    finally{setBusy(false);}
  }
  return <section className="card" style={{marginTop:16}}>
    <h3>Check a creator connection</h3>
    <p>This uses the same connection as the scan. A successful profile lookup consumes Influencers Club credits.</p>
    <label>Influencers Club API key<input type="password" value={apiKey || ''} onChange={e=>onApiKeyChange(e.target.value)}/></label>
    <label>Platform<select value={platform} onChange={e=>setPlatform(e.target.value)}><option value="youtube">YouTube</option><option value="instagram">Instagram</option><option value="tiktok">TikTok</option></select></label>
    <label>Creator handle or profile URL<input value={handle} onChange={e=>setHandle(e.target.value)}/></label>
    <button className="button" onClick={run} disabled={busy || !handle.trim() || !apiKey?.trim()}>{busy ? 'Checking...' : 'Check profile'}</button>
    {response && <pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere',maxHeight:400,overflow:'auto'}}>{response}</pre>}
  </section>;
}
