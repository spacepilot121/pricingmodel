import {CreatorEntityData} from '../types';
export type IdentitySignals={titleMatch:boolean;urlMatch:boolean;fuzzyTitle:boolean;contextualFuzzyTitle:boolean;matched:boolean};
export function detectTitleOrUrlIdentity(context:any,creatorData:CreatorEntityData):IdentitySignals;
export function isLikelyAboutCreator(context:any,creatorData:CreatorEntityData):boolean;
export function verifyEntityWithGPT(context:any,creatorData:CreatorEntityData,options:{apiKey?:string;model?:string}):Promise<{matchesCreator:boolean;reason:string}>;
