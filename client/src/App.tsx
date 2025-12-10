import { HashRouter as Router, Routes, Route, Link, useLocation } from 'react-router-dom';
import CalculatorTab from './components/CalculatorTab';
import BrandSafetyTab from './components/BrandSafetyTab';
import SettingsTab from './components/SettingsTab';
import LandingPage from './components/LandingPage';
import './app.css';

function NavTabs() {
  const location = useLocation();
  const tabs = [
    { path: '/', label: 'Home' },
    { path: '/campaigns', label: 'Calculator' },
    { path: '/brand-safety', label: 'Brand Safety' },
    { path: '/settings', label: 'Settings' }
  ];
  return (
    <div className="tab-bar">
      {tabs.map((tab) => (
        <Link
          key={tab.path}
          to={tab.path}
          className={location.pathname === tab.path ? 'tab active' : 'tab'}
        >
          {tab.label}
        </Link>
      ))}
    </div>
  );
}

export default function App() {
  return (
    <Router>
      <NavTabs />
      <div className="tab-content">
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route index element={<LandingPage />} />
          <Route path="/campaigns" element={<CalculatorTab />} />
          <Route path="/brand-safety" element={<BrandSafetyTab />} />
          <Route path="/settings" element={<SettingsTab />} />
          <Route path="*" element={<LandingPage />} />
        </Routes>
      </div>
    </Router>
  );
}
