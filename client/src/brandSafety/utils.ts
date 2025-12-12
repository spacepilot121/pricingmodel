export function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function normaliseScore(score: number): number {
  if (Number.isNaN(score)) return 0;
  return Math.max(0, Math.min(100, score));
}

export function countBy<T extends string>(items: T[]): Partial<Record<T, number>> {
  return items.reduce((acc, item) => {
    acc[item] = (acc[item] || 0) + 1;
    return acc;
  }, {} as Partial<Record<T, number>>);
}
