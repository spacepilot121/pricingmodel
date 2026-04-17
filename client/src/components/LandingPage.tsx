import { Link } from 'react-router-dom';

export default function LandingPage() {
  return (
    <div className="landing-page">
      <div className="landing-card">
        <h1 className="landing-title">Welcome</h1>
        <p className="landing-subtitle">Choose a workflow to get started</p>
        <div className="landing-actions">
          <Link to="/campaigns" className="button">
            Pricing Calculator
          </Link>
          <Link to="/brand-safety" className="button secondary">
            Brand Safety Tool
          </Link>
          <Link to="/margin-calculator" className="button secondary">
            Margin Calculator
          </Link>
        </div>
      </div>
    </div>
  );
}
