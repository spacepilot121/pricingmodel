import { useEffect, useState } from 'react';
import { loadApiKeys, saveApiKeys } from '../api/apiKeyStorage';
import { getApiBase, loadStoredApiBase, saveApiBase } from '../api/backendConfig';
import { testApiKeys, ApiKeyTestResults } from '../api/apiKeyTests';
import { ApiKeys } from '../types';
import InfluencersClubTester from './InfluencersClubTester';

export default function SettingsTab() {
  const [formState, setFormState] = useState<ApiKeys>({});
  const [status, setStatus] = useState<string>('');
  const [testResults, setTestResults] = useState<ApiKeyTestResults | null>(null);
  const [isTesting, setIsTesting] = useState(false);
  const [apiBaseInput, setApiBaseInput] = useState('');

  useEffect(() => {
    const stored = loadApiKeys();
    setFormState(stored);
    setApiBaseInput(loadStoredApiBase());
  }, []);

  function handleChange<K extends keyof ApiKeys>(key: K, value: ApiKeys[K]) {
    setFormState((prev) => ({ ...prev, [key]: value }));
    setTestResults(null);
  }

  function handleSaveApiBase() {
    const resolved = saveApiBase(apiBaseInput);
    setApiBaseInput(resolved);
    setStatus(`API endpoint set to ${resolved || '[relative /api]'}.`);
    setTimeout(() => setStatus(''), 2500);
  }

  function handleSave() {
    if (!allValid) return;
    const merged = saveApiKeys(formState);
    setFormState(merged);
    setStatus('API keys saved locally. Brand Safety runs entirely in your browser.');
    setTimeout(() => setStatus(''), 2500);
  }

  function handleSaveInfluencersKey() {
    const merged = saveApiKeys({ influencersClubApiKey: formState.influencersClubApiKey });
    setFormState((prev) => ({ ...prev, influencersClubApiKey: merged.influencersClubApiKey }));
    setStatus('Influencers.club key saved locally for Commercial Momentum.');
    setTimeout(() => setStatus(''), 2500);
  }

  async function handleTest() {
    setIsTesting(true);
    setStatus('');
    setTestResults(null);
    try {
      const results = await testApiKeys(formState);
      setTestResults(results);
    } catch (err: any) {
      setStatus(err?.message || 'Unable to run tests.');
    } finally {
      setIsTesting(false);
    }
  }

  const allValid = Boolean(testResults?.googleTest.ok && testResults?.openAiTest.ok);

  return (
    <div className="card">
      <h2>Settings</h2>
      <p className="text-muted">
        Brand Safety checks now run fully in the browser using Google Programmable Search and OpenAI. Keys are stored in
        localStorage and never sent to a backend.
      </p>

      <div className="settings-form">
        <section className="setting-block">
          <div className="setting-header">
            <div>
              <h3>Google Programmable Search</h3>
              <p className="text-muted">Used to gather recent news and reputation signals.</p>
            </div>
          </div>

          <label>
            Google Search API Key
            <input
              type="text"
              placeholder="AIza..."
              value={formState.googleCseApiKey || ''}
              onChange={(e) => handleChange('googleCseApiKey', e.target.value)}
            />
          </label>

          <label>
            Search Engine ID (CX)
            <input
              type="text"
              placeholder="Custom search CX"
              value={formState.googleCseCx || ''}
              onChange={(e) => handleChange('googleCseCx', e.target.value)}
            />
          </label>
        </section>

        <section className="setting-block">
          <div className="setting-header">
            <div>
              <h3>OpenAI</h3>
              <p className="text-muted">Classifies incidents and writes the final summary.</p>
            </div>
          </div>

          <label>
            OpenAI API Key
            <input
              type="text"
              placeholder="sk-..."
              value={formState.openAiApiKey || ''}
              onChange={(e) => handleChange('openAiApiKey', e.target.value)}
            />
          </label>

          <label>
            OpenAI Model (optional)
            <input
              type="text"
              placeholder="gpt-4o-mini"
              value={formState.openAiModel || ''}
              onChange={(e) => handleChange('openAiModel', e.target.value)}
            />
          </label>
        </section>

        <section className="setting-block">
          <div className="setting-header">
            <div>
              <h3>YouTube Data API (optional)</h3>
              <p className="text-muted">Kept for future use by other tabs.</p>
            </div>
          </div>

          <label>
            YouTube Data API Key
            <input
              type="text"
              placeholder="AIza..."
              value={formState.youtubeApiKey || ''}
              onChange={(e) => handleChange('youtubeApiKey', e.target.value)}
            />
          </label>
        </section>

        <section className="setting-block">
          <div className="setting-header">
            <div>
              <h3>API endpoint</h3>
              <p className="text-muted">
                Override the backend base URL used for <code>/api/*</code> calls (brand safety &amp; Influencers.club proxy).
              </p>
            </div>
          </div>

          <label>
            Base URL
            <input
              type="text"
              placeholder="https://your-host.example.com"
              value={apiBaseInput}
              onChange={(e) => setApiBaseInput(e.target.value)}
            />
            <span className="text-muted" style={{ display: 'block', marginTop: 4 }}>
              Defaults to VITE_API_BASE or relative <code>/api</code>. Also accepts <code>?apiBase=</code> in the URL.
            </span>
          </label>
          <button type="button" className="button secondary" onClick={handleSaveApiBase}>
            Save API endpoint
          </button>
        </section>

        <section className="setting-block">
          <div className="setting-header">
            <div>
              <h3>Influencers.club API</h3>
              <p className="text-muted">Required to unlock Commercial Momentum analysis. Key is stored locally.</p>
            </div>
          </div>

          <label>
            Influencers.club API Key
            <input
              type="text"
              placeholder="iclive_..."
              value={formState.influencersClubApiKey || ''}
              onChange={(e) => handleChange('influencersClubApiKey', e.target.value)}
            />
          </label>
          <details className="helper">
            <summary>Influencers.club API guide</summary>
            <ol style={{ marginTop: 8, marginBottom: 8, paddingLeft: 18 }}>
              <li>Visit the Influencers.club dashboard and open the API access page.</li>
              <li>Create or copy an API key that starts with <code>iclive_</code>.</li>
              <li>Paste the key above, then use “Test API Keys” to verify connectivity.</li>
            </ol>
            <p className="text-muted" style={{ marginBottom: 0 }}>
              The test performs a lightweight profile lookup. If it fails, double-check the key,
              confirm your plan includes API access, or retry later if you recently generated the key.
            </p>
          </details>
          <button type="button" className="button secondary" onClick={handleSaveInfluencersKey}>
            Save Influencers.club key
          </button>
        </section>
      </div>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <button type="button" className="button secondary" onClick={handleTest} disabled={isTesting}>
          {isTesting ? 'Testing...' : 'Test API Keys'}
        </button>
        <button type="button" className="button" onClick={handleSave} disabled={!allValid || isTesting}>
          Save settings
        </button>
        {!allValid && testResults && (
          <span className="status-text">Fix errors above before saving.</span>
        )}
      </div>

      {testResults && (
        <div className="card" style={{ marginTop: 12 }}>
          <h4 style={{ marginTop: 0 }}>Test results</h4>
          <ul style={{ listStyle: 'none', paddingLeft: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
            <li className={testResults.googleTest.keyOk && testResults.googleTest.ok ? 'status-text success' : 'status-text error'}>
              Google Search API: {testResults.googleTest.ok ? 'OK' : testResults.googleTest.message}
            </li>
            <li className={testResults.googleTest.cxOk && testResults.googleTest.ok ? 'status-text success' : 'status-text error'}>
              Google CX: {testResults.googleTest.ok ? 'OK' : testResults.googleTest.message}
            </li>
            <li className={testResults.openAiTest.ok ? 'status-text success' : 'status-text error'}>
              OpenAI API: {testResults.openAiTest.ok ? 'OK' : testResults.openAiTest.message}
            </li>
            <li className={testResults.influencersClubTest.ok ? 'status-text success' : 'status-text error'}>
              Influencers.club API:{' '}
              {testResults.influencersClubTest.ok ? 'OK' : testResults.influencersClubTest.message}
            </li>
          </ul>
        </div>
      )}

      <InfluencersClubTester
        apiKey={formState.influencersClubApiKey}
        onApiKeyChange={(value) => handleChange('influencersClubApiKey', value)}
      />

      {status && <p className="status-text success">{status}</p>}
    </div>
  );
}
