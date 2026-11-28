import {CommercialMomentumSignals} from '../types';
export function computeCommercialMomentumScore(signals:CommercialMomentumSignals):number;
export function mapRecommendation(score:number):string;
export function describeDrivers(signals:CommercialMomentumSignals):string[];
