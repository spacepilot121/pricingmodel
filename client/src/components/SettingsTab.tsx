import { FormEvent, useEffect, useState } from 'react';
import { loadApiKeys, saveApiKeys } from '../api/apiKeyStorage';
import { ApiKeys } from '../types';

export default function SettingsTab() {
  const [formState, setFormState] = useState<ApiKeys>({});
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    setFormState(loadApiKeys());
  }, []);

  function handleChange<K extends keyof ApiKeys>(key: K, value: ApiKeys[K]) {
    setStatus(null);
    setFormState((prev) => ({ ...prev, [key]: value }));
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    saveApiKeys(formState);
    setStatus('Saved. Brand safety checks will now use these keys.');
  }

  return (
    <div className="card">
      <h2>Settings</h2>
      <p className="text-muted">
        Provide the API credentials needed for the influencer safety checker. Keys are stored only in your
        browser and sent with each scan request.
      </p>

      <form onSubmit={handleSubmit} className="settings-form">
        <label>
          Google Custom Search API Key
          <input
            type="password"
            placeholder="AIza..."
            value={formState.googleCseApiKey || ''}
            onChange={(e) => handleChange('googleCseApiKey', e.target.value)}
            required
          />
        </label>

        <label>
          Google Custom Search Engine ID (CX)
          <input
            type="text"
            placeholder="Search engine CX"
            value={formState.googleCseCx || ''}
            onChange={(e) => handleChange('googleCseCx', e.target.value)}
            required
          />
        </label>

        <label>
          OpenAI API Key
          <input
            type="password"
            placeholder="sk-..."
            value={formState.openAiApiKey || ''}
            onChange={(e) => handleChange('openAiApiKey', e.target.value)}
            required
          />
        </label>

        <label>
          OpenAI Model (optional)
          <input
            type="text"
            placeholder="gpt-4.1-mini"
            value={formState.openAiModel || ''}
            onChange={(e) => handleChange('openAiModel', e.target.value)}
          />
        </label>

        <label>
          YouTube Data API Key (for channel checks)
          <input
            type="password"
            placeholder="AIza..."
            value={formState.youtubeApiKey || ''}
            onChange={(e) => handleChange('youtubeApiKey', e.target.value)}
          />
        </label>

        <button type="submit" className="button">
          Save API Keys
        </button>
      </form>

      {status && <p className="status-text">{status}</p>}
    </div>
  );
}
