// Exercise the built app in isolated Chrome with mocked providers, never the user's credentials.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const require=createRequire(new URL('../client/package.json',import.meta.url));
const {chromium}=require('playwright');
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','preview','--host','127.0.0.1','--port','4173'],{cwd:fileURLToPath(new URL('../client/',import.meta.url)),stdio:'ignore'});
let browser;
try{
  for(let i=0;i<40;i++){try{if((await fetch('http://127.0.0.1:4173/pricingmodel/docs/')).ok)break;}catch{}await new Promise(r=>setTimeout(r,250));}
  browser=await chromium.launch({executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',headless:true,args:['--no-sandbox']});
  const page=await browser.newPage({viewport:{width:1360,height:1000}});const errors=[];page.on('pageerror',e=>{errors.push(e.message);console.log('BROWSER_ERROR:'+e.message);});
  await page.addInitScript(()=>{if(!localStorage.getItem('ui-seeded')){localStorage.setItem('brandSafety_openAiKey','test-gpt-key');localStorage.setItem('brand_safety_api_keys',JSON.stringify({youtubeApiKey:'test-youtube-key',openAiApiKey:'old-key',openAiModel:'gpt-4o-mini'}));localStorage.setItem('ui-seeded','yes');}});
  let yt=0,gpt=0,health=0,other=0;
  await page.route('https://www.googleapis.com/**',route=>{
    const u=new URL(route.request().url());assert.equal(u.searchParams.get('key'),'test-youtube-key');
    if(u.searchParams.get('id')==='UCBR8-60-B28hp2BmDPdntcQ'){health++;return route.fulfill({json:{items:[{id:'UCBR8-60-B28hp2BmDPdntcQ'}]}});}
    yt++;let json;
    if(u.pathname.endsWith('/channels')){
      const handle=u.searchParams.get('forHandle');const two=handle==='@BrowserTwo';const invalid=handle==='@InvalidRef';
      const id=two?'UC2222222222222222222222':invalid?'UC3333333333333333333333':'UC1234567890123456789012';
      json={items:[{id,snippet:{title:two?'Second Creator':invalid?'Invalid Reference Creator':'Browser Test Creator',description:'Creator channel'},contentDetails:{relatedPlaylists:{uploads:id}}}]};
    }else json={items:[{snippet:{title:'Camera review',description:'I tested a camera outdoors.',resourceId:{videoId:'abcdefghijk'},videoOwnerChannelId:u.searchParams.get('playlistId'),publishedAt:'2026-11-01'}}]};
    return route.fulfill({json});
  });
  await page.route('https://api.openai.com/**',route=>{
    if(route.request().headers().authorization!=='Bearer test-gpt-key')return route.fulfill({status:401,json:{error:{message:'Invalid API key'}}});
    if(route.request().method()==='GET'){health++;return route.fulfill({json:{id:'gpt-4o-mini'}});}
    gpt++;const body=route.request().postDataJSON();assert.equal(body.max_completion_tokens,1800);
    const prompt=JSON.parse(body.messages[1].content);assert(prompt.sources.every(s=>Array.isArray(s.passages)));
    const evidence={sourceId:prompt.channel.title==='Invalid Reference Creator'?'missing-source':'video0',passageId:0};
    const finding={area:'commercial',concern:'context',status:'content observation',topic:'Product content in sample',explanation:'A camera appears in the upload text. This does not establish sponsorship.',evidence:[evidence]};
    return route.fulfill({json:{usage:{prompt_tokens:750,completion_tokens:140},choices:[{finish_reason:'stop',message:{content:JSON.stringify({summary:'A limited text sample was assessed.',findings:[finding]})}}]}});
  });
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
  await page.getByRole('link',{name:'GPT: connected',exact:true}).waitFor();
  await page.getByRole('link',{name:'YouTube: connected',exact:true}).waitFor();
  assert.equal(await page.getByText(/Uses the keys already saved/).count(),0);
  console.log('REVIEW_DESKTOP_IMAGE:'+ (await page.screenshot({type:'jpeg',quality:65,fullPage:true})).toString('base64'));
  await page.setViewportSize({width:390,height:900});
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  console.log('REVIEW_MOBILE_IMAGE:'+ (await page.screenshot({type:'jpeg',quality:65,fullPage:true})).toString('base64'));
  await page.setViewportSize({width:1360,height:1000});
  await page.getByLabel('YouTube channels',{exact:true}).fill('@BrowserTest\nhttps://www.youtube.com/@browsertest\n@BrowserTwo\nnot-a-channel');
  await page.getByRole('button',{name:'Run review',exact:true}).click();
  await page.getByText('2 of 3 ready',{exact:true}).waitFor();
  await page.getByRole('heading',{name:'Browser Test Creator',exact:true}).waitFor();
  assert.equal(yt,4);assert.equal(gpt,2);assert.equal(health,2);assert.equal(other,0);
  assert.equal(await page.locator('.review-citation blockquote').innerText(),'Camera review I tested a camera outdoors.');
  assert(await page.getByText('Insufficient evidence',{exact:true}).count()>=2);
  await page.getByRole('button',{name:'Run review',exact:true}).click();
  await page.getByText('2 of 3 ready',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Run review',exact:true}).waitFor();
  assert.equal(yt,4);assert.equal(gpt,2);
  await page.getByLabel('Reviewer',{exact:true}).fill('Test Reviewer');
  await page.getByLabel('Decision',{exact:true}).selectOption({label:'Escalate for further review'});
  assert(await page.getByRole('button',{name:'Save human decision',exact:true}).isDisabled());
  await page.getByLabel('I confirmed the channel identity, reviewed relevant original sources and checked content outside the automated text sample where needed.',{exact:true}).check();
  await page.getByRole('button',{name:'Save human decision',exact:true}).click();
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('precisify_review_reports_v1'))[0].reviewer),'Test Reviewer');
  await page.getByLabel('YouTube channels',{exact:true}).fill('@InvalidRef');
  await page.getByRole('button',{name:'Run review',exact:true}).click();
  await page.getByText('Some findings could not be linked to source evidence. Only verified findings are shown; this assessment is incomplete.',{exact:true}).waitFor();
  assert.equal(await page.getByRole('alert').count(),0);
  assert.equal(await page.getByText('Insufficient evidence',{exact:true}).count(),3);
  await page.evaluate(()=>localStorage.setItem('brandSafety_openAiKey','bad-key'));
  await page.reload();await page.getByRole('link',{name:'GPT: error',exact:true}).waitFor();
  assert.equal(await page.getByRole('link',{name:'GPT: connected',exact:true}).count(),0);
  await page.evaluate(()=>localStorage.setItem('brandSafety_openAiKey','test-gpt-key'));
  await page.getByRole('link',{name:'Settings',exact:true}).first().click();
  await page.getByRole('button',{name:'Download pricing backup',exact:true}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Download pricing backup',exact:true}).count(),1);
  assert.equal(await page.evaluate(()=>localStorage.getItem('brandSafety_openAiKey')),'test-gpt-key');
  assert.deepEqual(errors,[]);
  console.log('PASS Built UI: layout, mobile overflow, live connection states, pasted batches, deterministic citations, partial evidence, caching and sign off');
}finally{await browser?.close();server.kill();}
