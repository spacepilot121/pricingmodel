import {ApiKeys} from '../types';
import {requestJson} from '../api/requestJson';
import {parseChannel,youtubeKey} from './reviewEngine';
export type Health={state:'missing'|'checking'|'connected'|'error';detail:string};
export type Connections={gpt:Health;youtube:Health;google:Health};
const recent=new Map<string,{time:number;value:Health}>();
export function initialConnections(keys:ApiKeys):Connections {
  const value=(present:boolean):Health=>({state:present?'checking':'missing',detail:present?'Checking connection':'Key not configured'});
  return {gpt:value(!!keys.openAiApiKey),youtube:value(!!youtubeKey(keys)),google:value(!!keys.googleCseApiKey&&!!keys.googleCseCx)};
}
export async function checkConnections(keys:ApiKeys,onUpdate:(service:keyof Connections,value:Health)=>void,force=false){
  const tasks:{service:keyof Connections;identity:string;url:string;init?:RequestInit}[]=[];
  if(keys.openAiApiKey)tasks.push({service:'gpt',identity:keys.openAiApiKey+':'+(keys.openAiModel||'gpt-4o-mini'),url:'https://api.openai.com/v1/models/'+encodeURIComponent(keys.openAiModel||import.meta.env.VITE_OPENAI_MODEL||'gpt-4o-mini'),init:{headers:{Authorization:'Bearer '+keys.openAiApiKey}}});
  const yt=youtubeKey(keys);if(yt)tasks.push({service:'youtube',identity:yt,url:'https://www.googleapis.com/youtube/v3/channels?'+new URLSearchParams({part:'id',id:'UCBR8-60-B28hp2BmDPdntcQ',key:yt,fields:'items/id'})});
  if(keys.googleCseApiKey&&keys.googleCseCx)tasks.push({service:'google',identity:keys.googleCseApiKey+':'+keys.googleCseCx,url:'https://www.googleapis.com/customsearch/v1?'+new URLSearchParams({key:keys.googleCseApiKey,cx:keys.googleCseCx,q:'YouTube',num:'1',fields:'items/link'})});
  await Promise.all(tasks.map(async t=>{const cacheKey=t.service+':'+t.identity;const hit=recent.get(cacheKey);if(!force&&hit&&Date.now()-hit.time<600000){onUpdate(t.service,hit.value);return;}onUpdate(t.service,{state:'checking',detail:'Checking connection'});let value:Health;try{const data=await requestJson(t.url,t.init,15000,1);if(t.service==='youtube'&&!Array.isArray(data.items))throw Error('Unexpected response');value={state:'connected',detail:t.service==='gpt'?'API key and model access verified':'API connection verified'};}catch{value={state:'error',detail:'Connection failed. Check Settings, provider permissions or quota.'};}recent.set(cacheKey,{time:Date.now(),value});onUpdate(t.service,value);}));
}
export function parseChannelList(input:string):{input:string;error?:string}[]{
  const tokens=input.replace(/^\s*[-*•]\s*/gm,'').split(/[\s,;]+/).map(s=>s.trim()).filter(Boolean);
  if(tokens.length>100)throw Error('Paste up to 20 channels per batch.');
  const seen=new Set<string>();const rows:{input:string;error?:string}[]=[];
  for(const token of tokens){try{const parsed=parseChannel(token);const canonical=parsed.id?'id:'+parsed.id:JSON.stringify(parsed).toLowerCase();if(seen.has(canonical))continue;seen.add(canonical);rows.push({input:token});}catch(e:any){if(seen.has(token))continue;seen.add(token);rows.push({input:token,error:e.message});}}
  if(rows.length>20)throw Error('Paste up to 20 different channels per batch.');
  return rows;
}
