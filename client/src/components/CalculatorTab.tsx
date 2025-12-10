import { Link } from 'react-router-dom';

export default function CalculatorTab() {
  return (
    <div className="card" style={{ padding: 0 }}>
      <div style={{ padding: '16px 16px 0 16px' }}>
        <h2>Pricing Calculator</h2>
        <p className="text-muted">
          This is the original Precise Influencer Calculator experience we built together. It
          includes campaign planning, pricing variables, CSV exports, and all of the tooling you
          expect.
        </p>
        <div style={{ marginTop: 12, marginBottom: 12 }}>
          <Link to="/brand-safety" className="button secondary">
            Switch to brand safety tool
          </Link>
        </div>
      </div>
      <iframe
        src="/legacy-calculator.html"
        title="Pricing calculator"
        style={{ border: 'none', width: '100%', height: '80vh', borderTop: '1px solid #334155' }}
      />
    </div>
  );
}
