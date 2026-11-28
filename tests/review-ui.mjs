// Browser regression test against the built app with isolated test storage and mocked providers.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const require=createRequire(new URL('../client/package.json',import.meta.url));
const {chromium}=require('playwright');
const client=fileURLToPath(new URL('../client/',import.meta.url));
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','preview','--host','127.0.0.1','--port','4173'],{cwd:client,stdio:'ignore'});
let browser;
try {
  for(let i=0;i<40;i++){try{if((await fetch('http://127.0.0.1:4173/pricingmodel/docs/')).ok)break;}catch{}await new Promise(r=>setTimeout(r,250));}
  browser=await chromium.launch({executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',headless:true,args:['--no-sandbox']});
  const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{if(!localStorage.getItem('ui-seeded')){localStorage.setItem('brandSafety_openAiKey','test-gpt-key');localStorage.setItem('brand_safety_api_keys',JSON.stringify({youtubeApiKey:'test-youtube-key',openAiApiKey:'old-key',openAiModel:'gpt-4o-mini'}));localStorage.setItem('ui-seeded','yes');}});
  let yt=0,gpt=0,other=0;
  await page.route('https://www.googleapis.com/**',route=>{const u=new URL(route.request().url());assert.equal(u.searchParams.get('key'),'test-youtube-key');yt++;const json=u.pathname.endsWith('/channels')?{items:[{id:'UC1234567890123456789012',snippet:{title:'Browser Test Creator',description:'Creator channel'},contentDetails:{relatedPlaylists:{uploads:'uploads'}}}]}:{items:[{snippet:{title:'Camera review',description:'I tested a camera outdoors.',resourceId:{videoId:'abcdefghijk'},videoOwnerChannelId:'UC1234567890123456789012',publishedAt:'2026-11-01'}}]};return route.fulfill({json});});
  await page.route('https://api.openai.com/**',route=>{gpt++;assert.equal(route.request().headers().authorization,'Bearer test-gpt-key');assert.equal(route.request().postDataJSON().max_completion_tokens,1800);return route.fulfill({json:{usage:{prompt_tokens:750,completion_tokens:90},choices:[{finish_reason:'stop',message:{content:JSON.stringify({summary:'This is a limited text sample.',findings:[]})}}]}});});
  await page.route('**/*influencers.club/**',route=>{other++;return route.abort();});
  const base='http://127.0.0.1:4173/pricingmodel/docs/';
  await page.goto(base+'#/settings');
  await page.getByRole('button',{name:'Download pricing backup',exact:true}).waitFor();
  assert.equal(await page.getByLabel('YouTube API key',{exact:true}).inputValue(),'test-youtube-key');
  assert.equal(await page.getByLabel('OpenAI API key',{exact:true}).inputValue(),'test-gpt-key');
  await page.getByRole('button',{name:'Save settings',exact:true}).click();
  await page.getByRole('link',{name:'Calculator',exact:true}).click();
  const frame=page.frameLocator('iframe');await frame.locator('#campaign-app').waitFor();await frame.getByText('Pricing backups',{exact:true}).waitFor({state:'hidden'});
  await page.getByRole('link',{name:'Brand Safety',exact:true}).click();
  await page.getByLabel('Exact YouTube channel URL, @handle or channel ID',{exact:true}).fill('@BrowserTest');
  await page.getByRole('button',{name:'Run review',exact:true}).click();
  await page.getByRole('heading',{name:'Browser Test Creator',exact:true}).waitFor();
  assert.equal(yt,2);assert.equal(gpt,1);assert.equal(other,0);
  assert(await page.getByText('Insufficient evidence',{exact:true}).count()>=2);
  await page.getByRole('button',{name:'Run review',exact:true}).click();await page.getByRole('heading',{name:'Browser Test Creator',exact:true}).waitFor();assert.equal(yt,2);assert.equal(gpt,1);
  await page.getByLabel('Reviewer',{exact:true}).fill('Test Reviewer');
  await page.getByLabel('Decision',{exact:true}).selectOption({label:'Escalate for further review'});
  assert(await page.getByRole('button',{name:'Save human decision',exact:true}).isDisabled());
  await page.getByLabel('I confirmed the channel identity, reviewed relevant original sources and checked content outside the automated text sample where needed.',{exact:true}).check();
  await page.getByRole('button',{name:'Save human decision',exact:true}).click();
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('precisify_review_reports_v1'))[0].reviewer),'Test Reviewer');
  await page.getByRole('link',{name:'Settings',exact:true}).first().click();
  await page.getByRole('button',{name:'Download pricing backup',exact:true}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Download pricing backup',exact:true}).count(),1);
  assert.equal(await page.evaluate(()=>localStorage.getItem('brandSafety_openAiKey')),'test-gpt-key');
  assert.deepEqual(errors,[]);
  console.log('PASS Built browser UI: saved keys, Settings backups, bounded review, caching and human sign off');
} finally {await browser?.close();server.kill();}
