// Stateless relay: callers supply their own provider key on every request.
// Never configure a shared upstream API key or log headers/bodies here.
const PATHS = {
  credits: '/accounts/credits/', profile: '/creators/enrich/handle/profile/', discovery: '/discovery/',
  posts: '/creators/content/posts/', content: '/creators/content/details/'
};
export default {
  async fetch(request, env = {}) {
    const origin = request.headers.get('Origin');
    const allowed = (env.ALLOWED_ORIGINS || 'https://spacepilot121.github.io').split(',').map(x => x.trim());
    if (!origin || !allowed.includes(origin)) return new Response('Origin not allowed', {status:403});
    const headers = {
      'Access-Control-Allow-Origin': origin, 'Vary':'Origin',
      'Access-Control-Allow-Methods':'POST, OPTIONS',
      'Access-Control-Allow-Headers':'Authorization, Content-Type',
      'Access-Control-Expose-Headers':'Retry-After', 'Cache-Control':'no-store'
    };
    const json = (body,status) => new Response(JSON.stringify(body), {status,headers:{...headers,'Content-Type':'application/json'}});
    const pathname=new URL(request.url).pathname;
    if (pathname === '/api/health' && request.method === 'GET') return json({status:'ok',service:'influencers-club-relay'},200);
    const match=pathname.match(/^\/api\/influencers-club\/(credits|profile|discovery|posts|content)$/);
    if (!match) return json({error:'Unknown route'},404);
    if (request.method === 'OPTIONS') return new Response(null,{status:204,headers});
    if (request.method !== 'POST') return json({error:'POST required'},405);
    const auth=request.headers.get('Authorization') || '';
    if (!/^Bearer\s+\S+$/.test(auth)) return json({error:'Supply your Influencers Club key in the Authorization header.'},401);
    if (!request.headers.get('Content-Type')?.includes('application/json')) return json({error:'JSON body required'},415);
    const reader=request.body?.getReader();
    const chunks=[]; let length=0;
    if (!reader) return json({error:'Request body required'},400);
    while (true) {
      const {value,done}=await reader.read(); if(done) break;
      length+=value.byteLength;
      if(length>65536) {await reader.cancel();return json({error:'Request too large'},413);}
      chunks.push(value);
    }
    let payload;
    try {
      const bytes=new Uint8Array(length);let offset=0;
      for(const chunk of chunks) {bytes.set(chunk,offset);offset+=chunk.byteLength;}
      payload=JSON.parse(new TextDecoder().decode(bytes));
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw Error();
      delete payload.apiKey;
      if (match[1] !== 'credits' && !['youtube','instagram','tiktok'].includes(payload.platform)) return json({error:'Supported platforms: youtube, instagram, tiktok.'},400);
    } catch {return json({error:'Invalid JSON request'},400);}
    const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),25000);
    try {
      const upstream=await fetch('https://api-dashboard.influencers.club/public/v1'+PATHS[match[1]],{
        method:match[1] === 'credits' ? 'GET' : 'POST',headers:{Authorization:auth,'Content-Type':'application/json',Accept:'application/json'},
        ...(match[1] === 'credits' ? {} : {body:JSON.stringify(payload)}),redirect:'error',signal:controller.signal
      });
      const body=await upstream.text();
      let data;try {data=JSON.parse(body);} catch {return json({error:'Provider returned an unexpected response'},502);}
      if (!upstream.ok) data={error:upstream.status === 401 || upstream.status === 403 ? 'Influencers Club rejected the key or API permissions.' : upstream.status === 429 ? 'Influencers Club limit reached. Retry later or check your credits.' : 'Influencers Club request failed ('+upstream.status+').'};
      const response=json(data,upstream.status);
      const retryAfter=upstream.headers.get('Retry-After');if(retryAfter)response.headers.set('Retry-After',retryAfter);
      return response;
    } catch {return json({error:'Unable to reach Influencers Club. Please retry later.'},502);}
    finally {clearTimeout(timer);}
  }
};
