import { useMemo, useState } from 'react';
import { getApiBase } from '../api/backendConfig';

type EndpointKey = 'discovery' | 'posts';

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
  {
    label: string;
    url: string;
    legacyUrl: string;
    description: string;
    defaultPayload: Record<string, any>;
    proxyPath: 'discovery' | 'posts';
    docSample?: Record<string, any>;
  }
> = {
  discovery: {
    label: 'Discovery (/public/v1/discovery/)',
    url: 'https://api-dashboard.influencers.club/public/v1/discovery/',
    legacyUrl: 'https://api.influencers.club/v1/discovery/',
    description: 'POST only. Provide platform plus optional targeting filters.',
    proxyPath: 'discovery',
    defaultPayload: {
      platform: 'youtube',
      paging: { limit: 5, page: 0 },
      sort: { sort_by: 'relevancy', sort_order: 'desc' },
      filters: {
        location: [''],
        gender: '',
        profile_language: [''],
        number_of_followers: { min: null, max: null }
      }
    },
    docSample: {
      platform: 'youtube',
      paging: { limit: 5, page: 0 },
      sort: { sort_by: 'relevancy', sort_order: 'desc' },
      filters: {
        location: [''],
        type: '',
        gender: '',
        profile_language: [''],
        ai_search: '',
        number_of_followers: { min: null, max: null },
        engagement_percent: { min: null, max: null },
        exclude_role_based_emails: false,
        exclude_previous: false,
        posting_frequency: null
      }
    }
  },
  posts: {
    label: 'Posts (/public/v1/creators/content/posts/)',
    url: 'https://api-dashboard.influencers.club/public/v1/creators/content/posts/',
    legacyUrl: 'https://api.influencers.club/v1/creators/content/posts/',
    description: 'POST only. Provide platform, handle, count, and pagination_token.',
    proxyPath: 'posts',
    defaultPayload: {
      platform: 'youtube',
      handle: 'MrBeast',
      count: 12,
      pagination_token: ''
    }
  }
};


function formatBodyPreview(body: string) {
  const maxLength = 5000;
  if (body.length <= maxLength) return body;
  return `${body.slice(0, maxLength)}\n\n[truncated]`;
}

function isLikelyNetworkError(err: any) {
  return err?.message === 'Failed to fetch' || err?.name === 'TypeError' || !err?.status;
}

function shouldFallbackToProxy(err: any) {
  const status = Number(err?.status || 0);
  if (isLikelyNetworkError(err)) return true;
  return status === 404 || status === 405;
}

function buildProxyUrl(path: string) {
  const base = getApiBase() || '';
  return `${base}/api/influencers-club/${path}`;
}

async function postJsonAndFormat(
  url: string,
  payload: Record<string, any>,
  headers: Record<string, string>
): Promise<ResponseState> {
  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload)
  });
  const raw = await res.text();
  const prettyBody = (() => {
    try {
      return JSON.stringify(JSON.parse(raw), null, 2);
    } catch {
      return raw || '[empty body]';
    }
  })();

  const formatted = {
    status: res.status,
    ok: res.ok,
    body: formatBodyPreview(prettyBody),
    endpoint: url
  };

  if (!res.ok) {
    const error = new Error(`Request failed with ${res.status}`);
    (error as any).status = res.status;
    (error as any).response = formatted;
    (error as any).body = formatted.body;
    throw error;
  }

  return formatted;
}

export default function InfluencersClubTester({ apiKey, onApiKeyChange }: InfluencersClubTesterProps) {
  const [selectedEndpoint, setSelectedEndpoint] = useState<EndpointKey>('discovery');
  const [payloadTextByEndpoint, setPayloadTextByEndpoint] = useState<Record<EndpointKey, string>>(() => ({
    discovery: JSON.stringify(ENDPOINTS.discovery.defaultPayload, null, 2),
    posts: JSON.stringify(ENDPOINTS.posts.defaultPayload, null, 2)
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

  function useDocSample() {
    if (!endpointMeta.docSample) return;
    setPayloadTextByEndpoint((prev) => ({
      ...prev,
      [selectedEndpoint]: JSON.stringify(endpointMeta.docSample, null, 2)
    }));
  }

  async function handleSend() {
    setError(null);
    setResponse(null);

    const trimmedKey = apiKey?.trim();
    if (!trimmedKey) {
      setError('Add your Influencers.club API key above (raw key only; Bearer is added automatically).');
      return;
    }

    let parsedPayload: Record<string, any>;
    try {
      parsedPayload = JSON.parse(payloadText);
    } catch (err: any) {
      setError('Payload must be valid JSON before sending.');
      return;
    }

    const headers = {
      Authorization: `Bearer ${trimmedKey}`,
      'x-api-key': trimmedKey,
      'api-key': trimmedKey,
      'Content-Type': 'application/json',
      Accept: 'application/json'
    };
    const directTargets = [endpointMeta.url, endpointMeta.legacyUrl].filter(Boolean);
    const proxyTarget = buildProxyUrl(endpointMeta.proxyPath);
    let lastDirectError: any = null;

    setIsSending(true);
    try {
      for (const target of directTargets) {
        try {
          const formatted = await postJsonAndFormat(target, parsedPayload, headers);
          setResponse(formatted);
          return;
        } catch (err: any) {
          lastDirectError = err;
          if (!shouldFallbackToProxy(err)) {
            throw err;
          }
        }
      }

      if (!proxyTarget) {
        throw lastDirectError || new Error('Request failed. Check your connection and try again.');
      }

      const proxied = await postJsonAndFormat(
        proxyTarget,
        { ...parsedPayload, apiKey: trimmedKey },
        headers
      );
      setResponse(proxied);
    } catch (err: any) {
      const directResponseBody = lastDirectError?.response?.body || lastDirectError?.body;
      const proxyResponseBody = err?.response?.body || err?.body;
      if (proxyResponseBody || directResponseBody) {
        setResponse(
          err?.response ||
            lastDirectError?.response || {
              status: err?.status || lastDirectError?.status || null,
              ok: false,
              body: formatBodyPreview(proxyResponseBody || directResponseBody),
              endpoint: err?.response?.endpoint || lastDirectError?.response?.endpoint || proxyTarget || endpointMeta.url
            }
        );
      }

      const proxyMessage = err?.message || 'Proxy request failed.';
      const directMessage =
        lastDirectError?.message || (!proxyTarget ? proxyMessage : 'Failed to reach Influencers.club.');
      const combined = [
        `Direct request: ${directMessage}`,
        proxyTarget ? `Proxy: ${proxyMessage}` : null,
        'If you are using a static host (e.g. GitHub Pages), start the backend server and ensure /api/influencers-club/* routes are reachable.'
      ]
        .filter(Boolean)
        .join(' ');

      setError(combined);
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
            placeholder="Paste your dashboard API key"
            value={apiKey || ''}
            onChange={(e) => onApiKeyChange(e.target.value)}
          />
          <span className="text-muted" style={{ display: 'block', marginTop: 4 }}>
            Paste the raw key only; the tester automatically sends <code>Authorization: Bearer &lt;your-key&gt;</code>.
          </span>
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
          {endpointMeta.docSample && (
            <button type="button" className="button secondary" onClick={useDocSample} disabled={isSending}>
              Load docs sample
            </button>
          )}
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
