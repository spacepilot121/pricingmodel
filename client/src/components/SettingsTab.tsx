import { useEffect, useState } from 'react';
import { loadApiKeys, saveApiKeys } from '../api/apiKeyStorage';
import { ApiKeyService, testApiKey } from '../api/brandSafetyApi';
import { ApiKeys } from '../types';

type ServiceStatus = {
  message: string;
  tone: 'info' | 'success' | 'error';
};

export default function SettingsTab() {
  const [formState, setFormState] = useState<ApiKeys>({});
  const [statusByService, setStatusByService] = useState<Partial<Record<ApiKeyService, ServiceStatus>>>({});
  const [activeTest, setActiveTest] = useState<ApiKeyService | null>(null);

  useEffect(() => {
    setFormState(loadApiKeys());
  }, []);

  function handleChange<K extends keyof ApiKeys>(key: K, value: ApiKeys[K]) {
    setFormState((prev) => ({ ...prev, [key]: value }));
  }

  function setServiceStatus(service: ApiKeyService, tone: ServiceStatus['tone'], message: string) {
    setStatusByService((prev) => ({ ...prev, [service]: { tone, message } }));
  }

  function persistKeys(partial: ApiKeys): ApiKeys {
    const merged = saveApiKeys(partial);
    setFormState(merged);
    return merged;
  }

  async function handleSaveAndTest(service: ApiKeyService) {
    setActiveTest(service);
    try {
      let merged: ApiKeys;

      if (service === 'google') {
        merged = persistKeys({
          googleCseApiKey: formState.googleCseApiKey,
          googleCseCx: formState.googleCseCx
        });
        if (!merged.googleCseApiKey || !merged.googleCseCx) {
          setServiceStatus('google', 'error', 'Add both the Google Custom Search API key and CX before testing.');
          return;
        }
      } else if (service === 'openai') {
        merged = persistKeys({ openAiApiKey: formState.openAiApiKey, openAiModel: formState.openAiModel });
        if (!merged.openAiApiKey) {
          setServiceStatus('openai', 'error', 'Add an OpenAI API key before testing.');
          return;
        }
      } else {
        merged = persistKeys({ youtubeApiKey: formState.youtubeApiKey });
        if (!merged.youtubeApiKey) {
          setServiceStatus('youtube', 'error', 'Add a YouTube Data API key before testing.');
          return;
        }
      }

      setServiceStatus(service, 'info', 'Saving and testing...');
      const response = await testApiKey(service);
      setServiceStatus(service, 'success', response.message || 'Key saved and validated.');
    } catch (err: any) {
      setServiceStatus(service, 'error', err?.message || 'Key test failed.');
    } finally {
      setActiveTest(null);
    }
  }

  function renderStatus(service: ApiKeyService) {
    const status = statusByService[service];
    if (!status) return null;
    return <p className={`status-text ${status.tone}`}>{status.message}</p>;
  }

  return (
    <div className="card">
      <h2>Settings</h2>
      <p className="text-muted">
        Provide the API credentials needed for the influencer safety checker. Keys stay in your browser and are sent
        with each scan and test request.
      </p>

      <div className="settings-form">
        <section className="setting-block">
          <div className="setting-header">
            <div>
              <h3>Google Custom Search</h3>
              <p className="text-muted">Used to gather recent news and reputation signals.</p>
            </div>
          </div>

          <label>
            Google Custom Search API Key
            <input
              type="password"
              placeholder="AIza..."
              value={formState.googleCseApiKey || ''}
              onChange={(e) => handleChange('googleCseApiKey', e.target.value)}
            />
          </label>

          <label>
            Google Custom Search Engine ID (CX)
            <input
              type="text"
              placeholder="Search engine CX"
              value={formState.googleCseCx || ''}
              onChange={(e) => handleChange('googleCseCx', e.target.value)}
            />
          </label>

          <button
            type="button"
            className="button"
            onClick={() => handleSaveAndTest('google')}
            disabled={activeTest === 'google'}
          >
            {activeTest === 'google' ? 'Testing Google...' : 'Save & Test Google Search'}
          </button>
          {renderStatus('google')}
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
              type="password"
              placeholder="sk-..."
              value={formState.openAiApiKey || ''}
              onChange={(e) => handleChange('openAiApiKey', e.target.value)}
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

          <button
            type="button"
            className="button"
            onClick={() => handleSaveAndTest('openai')}
            disabled={activeTest === 'openai'}
          >
            {activeTest === 'openai' ? 'Testing OpenAI...' : 'Save & Test OpenAI'}
          </button>
          {renderStatus('openai')}
        </section>

        <section className="setting-block">
          <div className="setting-header">
            <div>
              <h3>YouTube Data API (optional)</h3>
              <p className="text-muted">Enables channel metadata checks for apology/controversy signals.</p>
            </div>
          </div>

          <label>
            YouTube Data API Key
            <input
              type="password"
              placeholder="AIza..."
              value={formState.youtubeApiKey || ''}
              onChange={(e) => handleChange('youtubeApiKey', e.target.value)}
            />
          </label>

          <button
            type="button"
            className="button"
            onClick={() => handleSaveAndTest('youtube')}
            disabled={activeTest === 'youtube'}
          >
            {activeTest === 'youtube' ? 'Testing YouTube...' : 'Save & Test YouTube'}
          </button>
          {renderStatus('youtube')}
        </section>
      </div>
    </div>
  );
}
