export type ClubCoverage = {complete:boolean;pages:number;postCount:number;warning:string};
export function influencersRequest(endpoint:string,payload:Record<string,unknown>,apiKey?:string,options?:{force?:boolean}):Promise<any>;
export function fetchCreatorProfile(handle:string,platform:string,apiKey?:string,options?:{force?:boolean}):Promise<any>;
export function fetchRecentPosts(handle:string,platform:string,apiKey?:string,options?:{force?:boolean}):Promise<{posts:any[];coverage:ClubCoverage}>;
export function postDate(post:any):number;
export function clearInfluencersClubCache():void;
