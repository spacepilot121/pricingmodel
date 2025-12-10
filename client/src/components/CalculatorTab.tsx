import { Link } from 'react-router-dom';

export default function CalculatorTab() {
  return (
    <div className="card">
      <h2>Campaigns</h2>
      <p className="text-muted">
        Build and review your campaign plans. Add creators, set budgets, and export scenarios
        for approval.
      </p>

      <div style={{ marginTop: 16 }}>
        <Link to="/brand-safety" className="button">
          Open brand safety tool
        </Link>
      </div>
    </div>
  );
}
