import {useEffect,useState} from 'react';
import {loadApiKeys,saveApiKeys} from '../api/apiKeyStorage';
import {requestJson} from '../api/requestJson';
import {ApiKeys} from '../types';
import {youtubeKey} from '../review/reviewEngine';
import PricingBackups from './PricingBackups';

export default function BrowserSettingsTab(){
  const [keys,setKeys]=useState<ApiKeys>({});const [message,setMessage]=useState('');const [busy,setBusy]=useState(false);
  useEffect(()=>{setKeys(loadApiKeys());},[]);
  function edit(key:keyof ApiKeys,value:string){setKeys(prev=>({...prev,[key]:value}));}
  function save(){setKeys(saveApiKeys(keys));setMessage('Settings saved on this browser using the existing API key storage.');}
  async function test(){
    setBusy(true);setMessage('');const results:string[]=[];
    try {
      const key=youtubeKey(keys);
      if(key){try{await requestJson('https://www.googleapis.com/youtube/v3/channels?'+new URLSearchParams({part:'id',id:'UCBR8-60-B28hp2BmDPdntcQ',key}),{},20000,1);results.push('YouTube connection succeeded (one list request).');}catch(e:any){results.push('YouTube: '+e.message);}}
      else results.push('No saved YouTube or Google key.');
      if(keys.openAiApiKey){try{const r=await requestJson('https://api.openai.com/v1/chat/completions',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+keys.openAiApiKey},body:JSON.stringify({model:keys.openAiModel||import.meta.env.VITE_OPENAI_MODEL||'gpt-4o-mini',max_completion_tokens:64,messages:[{role:'user',content:'Reply with OK.'}]})},30000,1);if(!r.choices?.length)throw Error('Unexpected model response.');results.push('OpenAI connection succeeded (output capped at 64 tokens).');}catch(e:any){results.push('OpenAI: '+e.message);}}
      else results.push('No saved OpenAI key.');
      setMessage(results.join(' '));
    }finally{setBusy(false);}
  }
  return <div className="card"><h2>Settings</h2><p>The creator review runs directly from GitHub Pages. It reads the API keys already saved on this PC and browser. Saving uses the same storage keys and format as before. Keys do not sync automatically between PCs.</p>
    <div className="settings-form">
      <section className="setting-block"><h3>YouTube Data API</h3><p>Resolves exact channels and reads a limited uploads sample. No broad YouTube search is required. If the saved YouTube field is empty, the existing Google key is tried; YouTube Data API must be enabled for that key.</p><label>YouTube API key<input type="password" autoComplete="off" value={keys.youtubeApiKey||''} onChange={e=>edit('youtubeApiKey',e.target.value)} /></label></section>
      <section className="setting-block"><h3>OpenAI</h3><p>One bounded evidence assessment per fresh review. Your saved model choice is retained. If the provider retires that model, select an available model supporting Chat Completions and structured JSON output.</p><label>OpenAI API key<input type="password" autoComplete="off" value={keys.openAiApiKey||''} onChange={e=>edit('openAiApiKey',e.target.value)} /></label><label>Model (optional)<input value={keys.openAiModel||''} placeholder="gpt-4o-mini" onChange={e=>edit('openAiModel',e.target.value)} /></label></section>
      <section className="setting-block"><h3>Google public search (optional)</h3><p>Only called when you select public reputation search. Existing keys are retained. Google has announced that Custom Search closes on 1 January 2027; article text can be supplied directly instead.</p><label>Google Search API key<input type="password" autoComplete="off" value={keys.googleCseApiKey||''} onChange={e=>edit('googleCseApiKey',e.target.value)} /></label><label>Search engine ID (CX)<input value={keys.googleCseCx||''} onChange={e=>edit('googleCseCx',e.target.value)} /></label></section>
    </div>
    <div style={{display:'flex',gap:12,flexWrap:'wrap'}}><button disabled={busy} onClick={save}>Save settings</button><button className="secondary" disabled={busy} onClick={test}>{busy?'Testing...':'Test YouTube and OpenAI'}</button></div>
    {message&&<p role="status">{message}</p>}
    <PricingBackups />
    <details style={{marginTop:20}}><summary>Retained legacy integration</summary><p>Influencers Club is no longer used by the creator review. Its saved key and the old endpoint setting have not been removed. There is no automatic call to that service.</p><label>Existing Influencers Club key<input type="password" autoComplete="off" value={keys.influencersClubApiKey||''} onChange={e=>edit('influencersClubApiKey',e.target.value)} /></label></details>
  </div>;
}
