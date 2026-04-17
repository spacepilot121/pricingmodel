import { useMemo, useState } from 'react';

type MarginField = 'cost' | 'revenue' | 'margin';

function roundToTwo(value: number) {
  return Math.round(value * 100) / 100;
}

export default function MarginCalculatorTab() {
  const [cost, setCost] = useState<number>(100);
  const [revenue, setRevenue] = useState<number>(150);
  const [marginPct, setMarginPct] = useState<number>(33.33);
  const [lastEdited, setLastEdited] = useState<MarginField>('revenue');

  const computed = useMemo(() => {
    if (lastEdited === 'cost') {
      const safeMargin = Math.min(Math.max(marginPct, -99.99), 99.99);
      const nextRevenue = cost / (1 - safeMargin / 100);
      return {
        cost,
        revenue: Number.isFinite(nextRevenue) ? roundToTwo(nextRevenue) : 0,
        marginPct: safeMargin
      };
    }

    if (lastEdited === 'margin') {
      const safeMargin = Math.min(Math.max(marginPct, -99.99), 99.99);
      const nextRevenue = cost / (1 - safeMargin / 100);
      return {
        cost,
        revenue: Number.isFinite(nextRevenue) ? roundToTwo(nextRevenue) : 0,
        marginPct: safeMargin
      };
    }

    const nextMargin = revenue === 0 ? 0 : ((revenue - cost) / revenue) * 100;
    return {
      cost,
      revenue,
      marginPct: roundToTwo(nextMargin)
    };
  }, [cost, revenue, marginPct, lastEdited]);

  const profit = roundToTwo(computed.revenue - computed.cost);
  const markupPct = computed.cost === 0 ? 0 : roundToTwo((profit / computed.cost) * 100);

  return (
    <div className="card margin-card">
      <h2 style={{ marginTop: 0 }}>Margin Calculator</h2>
      <p className="text-muted" style={{ marginTop: 0 }}>
        Enter any two values to calculate profit margin and markup.
      </p>

      <div className="margin-grid">
        <label>
          Cost
          <input
            type="number"
            min="0"
            step="0.01"
            value={cost}
            onChange={(event) => {
              setCost(Number(event.target.value));
              setLastEdited('cost');
            }}
          />
        </label>

        <label>
          Revenue
          <input
            type="number"
            min="0"
            step="0.01"
            value={lastEdited === 'cost' || lastEdited === 'margin' ? computed.revenue : revenue}
            onChange={(event) => {
              setRevenue(Number(event.target.value));
              setLastEdited('revenue');
            }}
          />
        </label>

        <label>
          Margin (%)
          <input
            type="number"
            min="-99.99"
            max="99.99"
            step="0.01"
            value={lastEdited === 'revenue' ? computed.marginPct : marginPct}
            onChange={(event) => {
              setMarginPct(Number(event.target.value));
              setLastEdited('margin');
            }}
          />
        </label>
      </div>

      <div className="margin-results">
        <div className="margin-stat">
          <span>Profit</span>
          <strong>${roundToTwo(profit).toLocaleString()}</strong>
        </div>
        <div className="margin-stat">
          <span>Markup</span>
          <strong>{markupPct.toLocaleString()}%</strong>
        </div>
        <div className="margin-stat">
          <span>Margin</span>
          <strong>{computed.marginPct.toLocaleString()}%</strong>
        </div>
      </div>

      <p className="text-muted" style={{ marginBottom: 0 }}>
        Formula: margin = (revenue - cost) / revenue × 100.
      </p>
    </div>
  );
}
