import {ApiKeys,BrandSafetyEvidence,BrandSafetyResult,Creator,CreatorEntityData} from '../types';
import {openAiJson} from '../api/openAiJson';
import {classifyEvidenceBatch} from './nlpClassifier';
import {performSmartSearch} from './searchEngine';
import {countBy} from './utils';
import {enrichEvidenceRisk,evaluateRiskOutcome} from './riskScoring';
const RESULTS_STORAGE_KEY='brand_safety_results_cache_v4';
export function loadBrandSafetyCache():BrandSafetyResult[]{
 try{const results=JSON.parse(localStorage.getItem(RESULTS_STORAGE_KEY)||'[]');return Array.isArray(results)?results:[];}catch{return [];}
}
function persistResult(result:BrandSafetyResult){
 try{localStorage.setItem(RESULTS_STORAGE_KEY,JSON.stringify([...loadBrandSafetyCache().filter(r=>r.creatorId!==result.creatorId),result]));}catch{/* A full browser cache must not lose the result in view. */}
}
async function validateEntities(evidence:BrandSafetyEvidence[],creatorData:CreatorEntityData,keys:ApiKeys){
 const validated:BrandSafetyEvidence[]=[];
 for(let start=0;start<evidence.length;start+=10){
  const batch=evidence.slice(start,start+10);
  const response=await openAiJson(keys,'validate_creator_identity',{
   type:'object',additionalProperties:false,properties:{items:{type:'array',items:{type:'object',additionalProperties:false,properties:{id:{type:'integer'},matchesCreator:{type:'boolean'}},required:['id','matchesCreator']}}},required:['items']
  },JSON.stringify({task:'Decide which sources refer to this specific creator. A similar name, shared first name, fictional character or unrelated person is not a match. Use platform, handle and context. Return false when identity cannot be established. Return one entry for each id.',creatorData,sources:batch.map((e,id)=>({id,title:e.title,url:e.url,snippet:e.snippet}))}));
  if(!Array.isArray(response.items)||response.items.length!==batch.length)throw new Error('Incomplete creator identity assessment.');
  const ids=new Set();
  for(const item of response.items){
   if(!Number.isInteger(item.id)||item.id<0||item.id>=batch.length||ids.has(item.id)||typeof item.matchesCreator!=='boolean')throw new Error('Invalid creator identity mapping.');
   ids.add(item.id);if(item.matchesCreator)validated.push(batch[item.id]);
  }
 }
 return validated;
}
export async function runBrandSafetyEngine(creator:Creator,keys:ApiKeys,override?:CreatorEntityData,onClassifying?:()=>void):Promise<BrandSafetyResult>{
 const identifiers=[creator.name,creator.handle,creator.channelId,creator.channelUrl,...(override?.identifiers||[])].filter(Boolean) as string[];
 const creatorData:CreatorEntityData={primaryName:override?.primaryName||creator.name,realName:override?.realName,identifiers:Array.from(new Set(identifiers))};
 const base={creatorId:creator.id,creatorName:creator.name,creatorHandle:creator.handle,lastChecked:new Date().toISOString()};
 const search=await performSmartSearch(creator,keys);
 onClassifying?.();
 const unique=search.filter((e,i,all)=>all.findIndex(other=>other.url===e.url)===i);
 const validated=await validateEntities(unique,creatorData,keys);
 if(!validated.length){
  const result:BrandSafetyResult={...base,status:'partial',riskLevel:'unknown',riskScore:null,finalScore:null,summary:'Insufficient validated evidence to assess this creator.',evidence:[],confidence:0,categoriesDetected:{}};
  persistResult(result);return result;
 }
 const classified=await classifyEvidenceBatch(validated,creator,keys);
 const evidence=enrichEvidenceRisk(classified,['Offender']);
 const outcome=evaluateRiskOutcome(evidence);
 const offenders=evidence.filter(e=>e.classification.stance==='Offender');
 const top=[...offenders].sort((a,b)=>b.riskContribution-a.riskContribution).slice(0,3);
 const result:BrandSafetyResult={...base,status:'ok',riskLevel:outcome.riskLevel,riskScore:outcome.finalScore,finalScore:outcome.finalScore,confidence:outcome.confidence,evidence,categoriesDetected:countBy(offenders.map(e=>e.classification.category as any)),summary:top.length?top.map(e=>e.classification.summary).join(' '):'No concerning conduct identified in the reviewed search snippets.',warnings:['Assessment uses public search snippets. Full articles, video content and comments were not reviewed.']};
 persistResult(result);return result;
}
