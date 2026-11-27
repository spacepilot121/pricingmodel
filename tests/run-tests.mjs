import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
const require=createRequire(new URL('../client/package.json',import.meta.url));
const {build}=require('esbuild');
const root=path.resolve(new URL('..',import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1'));
const out=path.join(root,'.test-build');fs.mkdirSync(out,{recursive:true});
async function moduleAt(source,name) {
 const outfile=path.join(out,name+'.mjs');
 await build({entryPoints:[path.join(root,source)],outfile,bundle:true,platform:'node',format:'esm',define:{'import.meta.env':'{}'}});
 return import('file:///'+outfile.replaceAll('\\','/'));
}
class Storage {
 constructor(entries={}){this.map=new Map(Object.entries(entries));this.failKey=null;this.failed=false;}
 getItem(k){return this.map.get(k)??null;}
 setItem(k,v){if(k===this.failKey&&!this.failed){this.failed=true;throw Error('quota');}this.map.set(k,String(v));}
 removeItem(k){this.map.delete(k);}
 clear(){this.map.clear();}
}
globalThis.localStorage=new Storage();globalThis.window={localStorage,location:{search:''}};
let passed=0;async function test(name,fn){await fn();passed++;console.log('PASS',name);}
await test('API key persistence and pricing code remain unchanged',()=>{
 const hashes=JSON.parse(fs.readFileSync(path.join(root,'tests/preserved-files.json'),'utf8'));
 for(const [file,expected] of Object.entries(hashes)) {
   const content=fs.readFileSync(path.join(root,file),'utf8').replace(/\r\n/g,'\n').replace('  <script src="campaign-backup.js"></script>\n','').trimEnd();
   assert.equal(crypto.createHash('sha256').update(content).digest('hex'),expected,file);
 }
});
const ctx={};vm.runInNewContext(fs.readFileSync(path.join(root,'client/public/campaign-backup.js'),'utf8'),ctx);
const backup=ctx.PricingBackup;
const campaign={id:'a',name:'Existing',data:{deliverables:[{cost:123.45}],budget:321,currency:'GBP'}};
const key='pic-campaigns-v2';
await test('Backup preserves complete pricing and excludes API keys',()=>{
 const storage=new Storage({[key]:JSON.stringify([campaign]),brandSafety_openAiKey:'secret',influencersClub_apiKey:'secret2'});
 const b=backup.createBackup(storage);assert.equal(b.values[key],storage.getItem(key));assert.deepEqual(Object.keys(b.values),[key]);assert(!JSON.stringify(b).includes('secret'));
});
await test('Restore preserves existing campaigns and recovers conflicting versions as copies',()=>{
 const storage=new Storage({[key]:JSON.stringify([campaign]),brandSafety_openAiKey:'unchanged'});
 const altered={...campaign,data:{...campaign.data,budget:999}};
 const b={format:'precisify-pricing-backup',version:1,values:{[key]:JSON.stringify([altered])}};
 backup.applyRestore(storage,backup.planRestore(storage,b,()=> 'copy'));
 const rows=JSON.parse(storage.getItem(key));assert.deepEqual(rows[0],campaign);assert.equal(rows[1].id,'copy');assert.equal(rows[1].data.budget,999);assert.equal(storage.getItem('brandSafety_openAiKey'),'unchanged');
});
await test('Identical backup does not duplicate records',()=>{
 const storage=new Storage({[key]:JSON.stringify([campaign])});const b=backup.createBackup(storage);backup.applyRestore(storage,backup.planRestore(storage,b,()=> 'copy'));assert.equal(JSON.parse(storage.getItem(key)).length,1);
});
await test('Invalid or credential-bearing imports never mutate storage',()=>{
 const storage=new Storage({[key]:JSON.stringify([campaign])});const before=[...storage.map];
 for(const values of [{[key]:'not json'},{brandSafety_openAiKey:'"bad"'},{[key]:'[{}]'}])assert.throws(()=>backup.planRestore(storage,{format:'precisify-pricing-backup',version:1,values},()=> 'x'));
 assert.deepEqual([...storage.map],before);
});
await test('Quota failure rolls back every pricing change',()=>{
 const storage=new Storage({[key]:JSON.stringify([campaign]),'pic-templates-v1':'[]'});const before=[...storage.map];storage.failKey='pic-templates-v1';
 assert.throws(()=>backup.applyRestore(storage,{[key]:'[]','pic-templates-v1':'[{"deliverables":[]}]'}));assert.deepEqual([...storage.map],before);
});
await test('Active legacy campaign is recovered without replacing local active pricing',()=>{
 const storage=new Storage({'precise-influencer-calculator-v1':JSON.stringify(campaign.data)});
 const imported={deliverables:[{cost:456}],name:'Recovered'};
 const b={format:'precisify-pricing-backup',version:1,values:{'precise-influencer-calculator-v1':JSON.stringify(imported)}};
 backup.applyRestore(storage,backup.planRestore(storage,b,()=> 'recovered'));assert.equal(JSON.parse(storage.getItem(key))[0].data.name,'Recovered');assert.deepEqual(JSON.parse(storage.getItem('precise-influencer-calculator-v1')),campaign.data);
});
const risk=await moduleAt('client/src/brandSafety/riskScoring.ts','risk');
const evidence=(stance='Offender',category='fraudOrScam',severity=3)=>({title:'Report',snippet:'Reported incident',url:'https://example.com/report',classification:{stance,category,severity,sentiment:'negative',mitigation:false,summary:'Reported allegation'},recency:0.5,riskContribution:0});
await test('Victim and unrelated evidence contributes no risk',()=>{
 const items=risk.enrichEvidenceRisk([evidence('Victim'),evidence('Unrelated')]);assert(items.every(i=>i.riskContribution===0));assert.equal(risk.evaluateRiskOutcome(items).finalScore,0);
});
await test('Serious allegation never manufactures high confidence',()=>{
 const result=risk.evaluateRiskOutcome(risk.enrichEvidenceRisk([evidence('Offender','harmToMinors',4)]));assert.equal(result.riskLevel,'red');assert(result.confidence<0.9);
});
const club=await moduleAt('client/src/api/influencersClubClient.js','club');
let calls=[];const reply=data=>new Response(JSON.stringify(data),{status:200,headers:{'Content-Type':'application/json'}});
await test('Current profile endpoint uses Bearer auth with supplied unsaved key',async()=>{
 localStorage.clear();globalThis.fetch=async(url,init)=>{calls.push({url,init});return reply({result:{youtube:{username:'alice'},email:'a@example.com'}})};
 calls=[];await club.fetchCreatorProfile('@alice','YouTube','test-key');assert(calls[0].url.endsWith('/creators/enrich/handle/profile/'));assert.equal(calls[0].init.headers.Authorization,'Bearer test-key');assert.equal(JSON.parse(calls[0].init.body).platform,'youtube');assert(!('x-api-key' in calls[0].init.headers));
});
await test('Posts paginate with cursors until exhaustion',async()=>{
 calls=[];globalThis.fetch=async(url,init)=>{const b=JSON.parse(init.body);calls.push(b);return reply({result:{items:[{id:b.pagination_token?'2':'1',timestamp:Math.floor(Date.now()/1000)}],more_available:!b.pagination_token,next_token:b.pagination_token?'':'next'}})};
 const result=await club.fetchRecentPosts('@alice','YouTube','test-key',{force:true});assert.equal(calls.length,2);assert.equal(calls[1].pagination_token,'next');assert.equal(result.posts.length,2);assert.equal(result.coverage.complete,true);
});
await test('Page cap reports incomplete coverage',async()=>{
 let i=0;globalThis.fetch=async()=>reply({result:{items:[{id:String(++i),timestamp:Math.floor(Date.now()/1000)}],more_available:true,next_token:String(i)}});
 const result=await club.fetchRecentPosts('@busy','YouTube','test-key',{force:true});assert.equal(i,5);assert.equal(result.coverage.complete,false);
});
await test('Wrong posts format fails instead of becoming empty feed',async()=>{
 globalThis.fetch=async()=>reply({result:{unrecognised:[]}});await assert.rejects(()=>club.fetchRecentPosts('@wrong','YouTube','test-key',{force:true}),/format/);
});
await test('Rescan bypasses provider cache',async()=>{
 let count=0;globalThis.fetch=async()=>{count++;return reply({result:{youtube:{username:'fresh'}}})};await club.fetchCreatorProfile('@fresh','YouTube','key');await club.fetchCreatorProfile('@fresh','YouTube','key');await club.fetchCreatorProfile('@fresh','YouTube','key',{force:true});assert.equal(count,2);
});
await test('Configured relay is used first and key test uses the same connection',async()=>{
 localStorage.setItem('api_base_override','https://relay.example');
 // Bundle anew so endpoint configuration has not been memoised by prior tests.
 const via=await moduleAt('client/src/api/influencersClubClient.js','club-relay');
 calls=[];globalThis.fetch=async(url,init)=>{calls.push({url,init});return reply({credits_left:100})};await via.influencersRequest('credits',{},'key',{force:true});assert.equal(calls[0].url,'https://relay.example/api/influencers-club/credits');localStorage.removeItem('api_base_override');
});
const commercial=await moduleAt('client/src/commercialMomentum/commercialMomentumEngine.ts','commercial');
await test('Nested platform profile fields and contact data are read correctly',()=>{
 const result=commercial.normaliseProfileInsights({result:{email:'hello@example.com',location:'UK',youtube:{username:'alice',subscribers:12000,description:'Test bio'}}},'YouTube');assert.equal(result.subscriberCount,12000);assert.equal(result.emails[0],'hello@example.com');assert.equal(result.description,'Test bio');
});
await test('Empty feed returns insufficient data without a score',async()=>{
 globalThis.fetch=async()=>reply({result:{items:[],more_available:false}});
 const result=await commercial.runCommercialMomentum({id:'x',name:'Empty',platform:'YouTube',handle:'@empty'},{influencersClubApiKey:'key'},{force:true,profile:{result:{youtube:{username:'empty'}}}});assert.equal(result.score,null);assert.equal(result.status,'insufficient');
});
await test('Wrong creator handle is rejected before any score',async()=>{
 globalThis.fetch=async()=>reply({result:{youtube:{username:'somebody_else'}}});await assert.rejects(()=>commercial.resolveClubIdentity({id:'x',name:'Alice',platform:'YouTube',handle:'@alice'},{influencersClubApiKey:'key'},true),/different creator/);
});
const nlp=await moduleAt('client/src/brandSafety/nlpClassifier.ts','nlp');
await test('Failed OpenAI classification propagates instead of disappearing',async()=>{
 globalThis.fetch=async()=>new Response(JSON.stringify({error:{message:'Invalid key'}}),{status:401});await assert.rejects(()=>nlp.classifyEvidenceBatch([evidence()],{id:'a',name:'Alice',platform:'YouTube'},{openAiApiKey:'key'}),/Invalid key/);
});
await test('OpenAI batch requires a complete correctly mapped response',async()=>{
 globalThis.fetch=async()=>reply({choices:[{finish_reason:'stop',message:{content:JSON.stringify({items:[]})}}]});await assert.rejects(()=>nlp.classifyEvidenceBatch([evidence()],{id:'a',name:'Alice',platform:'YouTube'},{openAiApiKey:'key'}),/Incomplete/);
});
const worker=(await import('../relay/worker.mjs')).default;
await test('Relay refuses unknown origins, paths and missing credentials',async()=>{
 assert.equal((await worker.fetch(new Request('https://relay/api/influencers-club/profile',{method:'POST',headers:{Origin:'https://evil.example'}}))).status,403);
 assert.equal((await worker.fetch(new Request('https://relay/not-allowed',{headers:{Origin:'https://spacepilot121.github.io'}}))).status,404);
 assert.equal((await worker.fetch(new Request('https://relay/api/influencers-club/profile',{method:'POST',headers:{Origin:'https://spacepilot121.github.io'}}))).status,401);
});
await test('Relay forwards only to fixed provider with caller credentials',async()=>{
 let target;globalThis.fetch=async(url,init)=>{target={url,init};return reply({result:{youtube:{username:'alice'}}})};
 const request=new Request('https://relay/api/influencers-club/profile',{method:'POST',headers:{Origin:'https://spacepilot121.github.io',Authorization:'Bearer caller-key','Content-Type':'application/json'},body:JSON.stringify({platform:'youtube',handle:'alice'})});
 const response=await worker.fetch(request);assert.equal(response.status,200);assert.equal(target.init.headers.Authorization,'Bearer caller-key');assert(target.url.startsWith('https://api-dashboard.influencers.club/public/v1/'));assert.equal(response.headers.get('Access-Control-Allow-Origin'),'https://spacepilot121.github.io');
});
console.log(passed+' regression checks passed. No paid API requests were made.');
