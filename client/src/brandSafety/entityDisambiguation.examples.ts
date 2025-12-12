import { isLikelyAboutCreator } from './entityDisambiguation';
import { calculateRiskContribution, deriveRiskLevel, detectRecencyWeight } from './riskScoring';
import { BrandSafetyEvidence, CreatorEntityData, RiskLevel } from '../types';

/**
 * Lightweight, dependency-free examples that exercise the disambiguation logic.
 * These are not wired into an automated runner but are easily invoked in a console for
 * manual verification during development.
 */

type ExampleCase = {
  creator: CreatorEntityData;
  positives: { context: any; note: string }[];
  negatives: { context: any; note: string }[];
};

const exampleCases: ExampleCase[] = [
  {
    creator: {
      primaryName: 'Ali-A',
      realName: 'Alastair Aiken',
      identifiers: ['Ali A', 'Ali-A', 'Alastair Aiken', 'MrAliA']
    },
    positives: [
      {
        note: 'YouTube context with clean identifier',
        context: {
          title: 'Ali-A uploads new Call of Duty video',
          url: 'https://www.youtube.com/watch?v=aliavideo1',
          snippet: 'The YouTuber Ali-A just dropped gameplay footage.'
        }
      },
      {
        note: 'Identifier appears in URL path',
        context: {
          title: 'Gameplay stream recap',
          url: 'https://gaming.site/creators/alia-livestream-recap',
          snippet: 'Recapping the latest stream from the Fortnite creator.'
        }
      }
    ],
    negatives: [
      {
        note: 'Misleading token "alias" should be rejected',
        context: {
          title: 'System alias configuration guide',
          url: 'https://linux.example.com/alias-setup',
          snippet: 'How to configure shell aliases for productivity.'
        }
      }
    ]
  },
  {
    creator: {
      primaryName: 'MrBeast',
      identifiers: ['MrBeast', 'Jimmy Donaldson', 'Beast Philanthropy'],
      realName: 'Jimmy Donaldson'
    },
    positives: [
      {
        note: 'Title and snippet mention creator with platform context',
        context: {
          title: 'MrBeast launches new influencer challenge',
          snippet: 'The YouTuber is back with another large-scale giveaway video.'
        }
      }
    ],
    negatives: [
      {
        note: 'Unrelated Mr Bean article should not match',
        context: {
          title: 'Mr Bean celebrates anniversary',
          snippet: 'Retrospective on the classic comedy character.'
        }
      }
    ]
  },
  {
    creator: {
      primaryName: 'Safiya Nygaard',
      identifiers: ['Safiya Nygaard', 'Safiya', 'Nygaard'],
      realName: 'Safiya Nygaard'
    },
    positives: [
      {
        note: 'Fashion context with fuzzy tolerance',
        context: {
          title: 'Safiya Nygaard tries viral fashion trends',
          snippet: 'The lifestyle YouTuber reviews the latest runway looks.'
        }
      }
    ],
    negatives: [
      {
        note: 'Surname inside analytical word should be ignored',
        context: {
          title: 'Statistical analysis of trends',
          snippet: 'An analytical approach to runway performance.'
        }
      }
    ]
  },
  {
    creator: {
      primaryName: 'Sssniperwolf',
      identifiers: ['SSSniperWolf', 'Sssniperwolf', 'Sniper Wolf'],
      realName: 'Alia Shelesh'
    },
    positives: [
      {
        note: 'Contextual match via gaming terms',
        context: {
          title: 'Popular gaming creator Sssniperwolf reacts to memes',
          snippet: 'The streamer covers new viral clips in her latest video.'
        }
      }
    ],
    negatives: [
      {
        note: 'Generic sniper training content should be rejected',
        context: {
          title: 'Army sniper training program announced',
          snippet: 'Details on the new marksman curriculum.'
        }
      }
    ]
  }
];

export function runEntityDisambiguationExamples() {
  return exampleCases.map((example) => ({
    creator: example.creator.primaryName,
    positives: example.positives.map((p) => ({
      note: p.note,
      accepted: isLikelyAboutCreator(p.context, example.creator)
    })),
    negatives: example.negatives.map((n) => ({
      note: n.note,
      accepted: isLikelyAboutCreator(n.context, example.creator)
    }))
  }));
}

export function demoRiskPipelineExample(): { evidence: BrandSafetyEvidence; riskLevel: RiskLevel } {
  const evidence: BrandSafetyEvidence = {
    title: 'MrBeast philanthropy video praised',
    snippet: 'Social media personality MrBeast donates to local shelters in his latest YouTube upload.',
    url: 'https://news.example.com/mrbeast-donation',
    classification: {
      stance: 'Offender',
      category: 'personalDrama',
      severity: 2,
      sentiment: 'positive',
      mitigation: false,
      summary: 'Demonstrates positive but notable behavior'
    },
    recency: detectRecencyWeight('2024 donation'),
    riskContribution: 0
  };

  const contribution = calculateRiskContribution(evidence.classification, evidence.recency, 0);
  const riskLevel = deriveRiskLevel(contribution);
  return { evidence: { ...evidence, riskContribution: contribution }, riskLevel };
}
