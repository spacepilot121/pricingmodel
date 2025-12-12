import { BrandSafetyResult, RiskLevel } from '../types';

export function riskBadgeClass(level: RiskLevel): string {
  switch (level) {
    case 'red':
      return 'badge red';
    case 'amber':
      return 'badge amber';
    case 'unknown':
      return 'badge secondary';
    default:
      return 'badge green';
  }
}

export function formatRiskLabel(level: RiskLevel): string {
  if (level === 'red') return 'High (Red)';
  if (level === 'amber') return 'Medium (Amber)';
  if (level === 'unknown') return 'Unknown';
  return 'Low (Green)';
}

export function buildCategoryHeatmap(result?: BrandSafetyResult) {
  if (!result) return [] as { category: string; count: number }[];
  return Object.entries(result.categoriesDetected || {})
    .map(([category, count]) => ({ category, count: count || 0 }))
    .sort((a, b) => b.count - a.count);
}

export function exportToCsv(results: BrandSafetyResult[]) {
  const headers = [
    'Creator',
    'Risk Level',
    'Score',
    'Confidence',
    'Category',
    'Evidence URL',
    'Summary',
    'Recency'
  ];
  const rows = results.flatMap((result) =>
    result.evidence.map((ev) => [
      result.creatorName,
      result.riskLevel,
      result.finalScore ?? '',
      result.confidence,
      ev.classification.category,
      ev.url,
      ev.classification.summary,
      ev.recency
    ])
  );

  const csv = [headers, ...rows]
    .map((row) => row.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(','))
    .join('\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', 'brand-safety-results.csv');
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export function topSevereEvidence(result?: BrandSafetyResult, limit = 5) {
  if (!result) return [];
  return [...result.evidence]
    .sort((a, b) => b.riskContribution - a.riskContribution)
    .slice(0, limit);
}
