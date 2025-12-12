import { useEffect, useState } from 'react';
import { loadApiKeys, saveApiKeys } from '../api/apiKeyStorage';
import { ApiKeys } from '../types';

export default function SettingsTab() {
  const [formState, setFormState] = useState<ApiKeys>({});
  const [status, setStatus] = useState<string>('');

  useEffect(() => {
    const stored = loadApiKeys();
    setFormState(stored);
  }, []);

  function handleChange<K extends keyof ApiKeys>(key: K, value: ApiKeys[K]) {
    setFormState((prev) => ({ ...prev, [key]: value }));
  }

  function handleSave() {
    const merged = saveApiKeys(formState);
    setFormState(merged);
    setStatus('API keys saved locally. Brand Safety runs entirely in your browser.');
    setTimeout(() => setStatus(''), 2500);
  }

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
      </div>

      <button type="button" className="button" onClick={handleSave}>
        Save settings
      </button>
      {status && <p className="status-text success">{status}</p>}
    </div>
  );
}
