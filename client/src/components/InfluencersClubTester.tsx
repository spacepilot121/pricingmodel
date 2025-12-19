import { useMemo, useState } from 'react';

type EndpointKey = 'discovery' | 'postData';

type ResponseState = {
  status: number | null;
  ok: boolean;
  body: string;
  endpoint: string;
};

type InfluencersClubTesterProps = {
  apiKey?: string;
  onApiKeyChange: (value: string) => void;
};

const ENDPOINTS: Record<
  EndpointKey,
  { label: string; url: string; description: string; defaultPayload: Record<string, any> }
> = {
  discovery: {
    label: 'Discovery (/public/v1/discovery/)',
    url: 'https://api-dashboard.influencers.club/public/v1/discovery/',
    description: 'POST only. Provide platform plus optional targeting filters.',
    defaultPayload: {
      platform: 'instagram',
      location: ['United States'],
      gender: 'any'
    }
  },
  postData: {
    label: 'Post data (/public/v1/creators/content/details/)',
    url: 'https://api-dashboard.influencers.club/public/v1/creators/content/details/',
    description: 'POST only. Provide platform, content_type, and post_id.',
    defaultPayload: {
      platform: 'instagram',
      content_type: 'comments',
      post_id: '12345'
    }
  }
};

function formatBodyPreview(body: string) {
  const maxLength = 5000;
  if (body.length <= maxLength) return body;
  return `${body.slice(0, maxLength)}\n\n[truncated]`;
}

export default function InfluencersClubTester({ apiKey, onApiKeyChange }: InfluencersClubTesterProps) {
  const [selectedEndpoint, setSelectedEndpoint] = useState<EndpointKey>('discovery');
  const [payloadTextByEndpoint, setPayloadTextByEndpoint] = useState<Record<EndpointKey, string>>(() => ({
    discovery: JSON.stringify(ENDPOINTS.discovery.defaultPayload, null, 2),
    postData: JSON.stringify(ENDPOINTS.postData.defaultPayload, null, 2)
  }));
  const [isSending, setIsSending] = useState(false);
  const [response, setResponse] = useState<ResponseState | null>(null);
  const [error, setError] = useState<string | null>(null);

  const payloadText = useMemo(() => payloadTextByEndpoint[selectedEndpoint], [payloadTextByEndpoint, selectedEndpoint]);
  const endpointMeta = ENDPOINTS[selectedEndpoint];

  function updatePayloadText(value: string) {
    setPayloadTextByEndpoint((prev) => ({ ...prev, [selectedEndpoint]: value }));
  }

  function resetPayload() {
    setPayloadTextByEndpoint((prev) => ({
      ...prev,
      [selectedEndpoint]: JSON.stringify(endpointMeta.defaultPayload, null, 2)
    }));
  }

  async function handleSend() {
    setError(null);
    setResponse(null);

    const trimmedKey = apiKey?.trim();
    if (!trimmedKey) {
      setError('Add your Influencers.club API key above (case-sensitive “Bearer <token>” format).');
      return;
    }

    let parsedPayload: Record<string, any>;
    try {
      parsedPayload = JSON.parse(payloadText);
    } catch (err: any) {
      setError('Payload must be valid JSON before sending.');
      return;
    }

    setIsSending(true);
    try {
      const res = await fetch(endpointMeta.url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${trimmedKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(parsedPayload)
      });
      const raw = await res.text();
      const prettyBody = (() => {
        try {
          return JSON.stringify(JSON.parse(raw), null, 2);
        } catch {
          return raw || '[empty body]';
        }
      })();

      setResponse({
        status: res.status,
        ok: res.ok,
        body: formatBodyPreview(prettyBody),
        endpoint: endpointMeta.url
      });
    } catch (err: any) {
      setError(err?.message || 'Request failed. Check your connection and try again.');
    } finally {
      setIsSending(false);
    }
  }

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <div className="setting-header" style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <h3 style={{ margin: 0 }}>Influencers.club API tester</h3>
          <p className="text-muted" style={{ marginTop: 4 }}>
            Run the documented POST requests directly to debug 405 errors. Method is hard-coded to <code>POST</code> for
            these endpoints.
          </p>
        </div>
        <div className="text-muted" style={{ minWidth: 200 }}>
          <div>Base: api-dashboard.influencers.club</div>
          <div>Method: POST</div>
          <div>Auth: Bearer YOUR_API_KEY</div>
        </div>
      </div>

      <div className="settings-form" style={{ gap: 12, marginTop: 12 }}>
        <label>
          Influencers.club API Key
          <input
            type="text"
            placeholder="iclive_..."
            value={apiKey || ''}
            onChange={(e) => onApiKeyChange(e.target.value)}
          />
        </label>

        <div className="flex-row" style={{ alignItems: 'flex-end' }}>
          <label style={{ flex: 1, minWidth: 220 }}>
            Endpoint
            <select value={selectedEndpoint} onChange={(e) => setSelectedEndpoint(e.target.value as EndpointKey)}>
              {Object.entries(ENDPOINTS).map(([key, meta]) => (
                <option key={key} value={key}>
                  {meta.label}
                </option>
              ))}
            </select>
          </label>
          <div className="text-muted" style={{ flex: 2, minWidth: 220 }}>
            {endpointMeta.description} A 405 means something forced this request away from POST (e.g., a proxy or
            incorrect client method).
          </div>
        </div>

        <label>
          Request body (JSON)
          <textarea
            value={payloadText}
            onChange={(e) => updatePayloadText(e.target.value)}
            rows={8}
            spellCheck={false}
            style={{ width: '100%', fontFamily: 'monospace' }}
          />
        </label>

        <div className="flex-row" style={{ gap: 10 }}>
          <button type="button" className="button secondary" onClick={resetPayload} disabled={isSending}>
            Reset to sample
          </button>
          <button type="button" className="button" onClick={handleSend} disabled={isSending}>
            {isSending ? 'Sending...' : 'Send POST'}
          </button>
          {error && <span className="status-text error">{error}</span>}
        </div>
      </div>

      {response && (
        <div className="card" style={{ marginTop: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
            <div>
              <strong>Response</strong> — {endpointMeta.label}
            </div>
            <div className="text-muted">
              Status: {response.status ?? 'n/a'} • Method: POST • {response.ok ? 'OK' : 'Error'}
            </div>
          </div>
          <pre
            style={{
              marginTop: 10,
              background: '#0f1226',
              border: '1px solid var(--border)',
              padding: 12,
              borderRadius: 10,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              maxHeight: 360,
              overflow: 'auto'
            }}
          >
            {response.body}
          </pre>
        </div>
      )}
    </div>
  );
}
