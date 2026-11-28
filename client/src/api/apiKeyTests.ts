import {ApiKeys} from '../types';
import {requestJson} from './requestJson';
import {openAiJson} from './openAiJson';
import {influencersRequest} from './influencersClubClient';
export type ServiceTestResult={ok:boolean;message:string};
export type GoogleTestResult=ServiceTestResult & {keyOk:boolean;cxOk:boolean};
export type ApiKeyTestResults={googleTest:GoogleTestResult;openAiTest:ServiceTestResult;influencersClubTest:ServiceTestResult};
async function testGoogleKeys(keys:ApiKeys):Promise<GoogleTestResult>{
 const keyOk=Boolean(keys.googleCseApiKey?.trim());const cxOk=Boolean(keys.googleCseCx?.trim());
 if(!keyOk || !cxOk)return {ok:false,keyOk,cxOk,message:'Missing Google Search API key or CX'};
 try{const params=new URLSearchParams({q:'connectivity test',key:keys.googleCseApiKey!,cx:keys.googleCseCx!,num:'1'});await requestJson('https://www.googleapis.com/customsearch/v1?'+params);return {ok:true,keyOk,cxOk,message:'Valid'};}
 catch(error:any){return {ok:false,keyOk,cxOk,message:error.message};}
}
async function testOpenAiKey(keys:ApiKeys):Promise<ServiceTestResult>{
 try{await openAiJson(keys,'connection_test',{type:'object',additionalProperties:false,properties:{ok:{type:'boolean'}},required:['ok']},'Return {"ok":true}.');return {ok:true,message:'Configured model and structured output verified'};}
 catch(error:any){return {ok:false,message:error.message};}
}
async function testInfluencersClubKey(keys:ApiKeys):Promise<ServiceTestResult>{
 try{await influencersRequest('credits',{},keys.influencersClubApiKey,{force:true});return {ok:true,message:'Account connection verified'};}
 catch(error:any){return {ok:false,message:error.message};}
}
export async function testApiKeys(keys:ApiKeys):Promise<ApiKeyTestResults>{
 const [googleTest,openAiTest,influencersClubTest]=await Promise.all([testGoogleKeys(keys),testOpenAiKey(keys),testInfluencersClubKey(keys)]);return {googleTest,openAiTest,influencersClubTest};
}
