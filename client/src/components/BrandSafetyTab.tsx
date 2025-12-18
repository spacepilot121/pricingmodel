import { useEffect, useMemo, useState } from 'react';
import { loadApiKeys } from '../api/apiKeyStorage';
import { loadCachedResults, scanManyCreators, scanSingleCreator } from '../api/brandSafetyApi';
import { ApiKeys, BrandSafetyResult, CommercialMomentumResult, Creator } from '../types';
import {
  buildCategoryHeatmap,
  exportToCsv,
  formatRiskLabel,
  riskBadgeClass,
  topSevereEvidence
} from '../brandSafety/brandSafetyUI';
import * as localCache from '../brandSafety/localCache';
import { loadCachedCommercialResults, runCommercialMomentum } from '../commercialMomentum/commercialMomentumEngine';
import * as commercialCache from '../commercialMomentum/localCache';

const DEFAULT_PLATFORM: Creator['platform'] = 'Other';

function stripTrailingSlash(value?: string) {
  return value?.replace(/\/+$/, '');
}

function tryParseUrl(candidate?: string): URL | null {
  if (!candidate) return null;
  const trimmed = candidate.trim();
  if (!trimmed) return null;
  try {
    return new URL(trimmed);
  } catch (err) {
    // Support schemeless inputs like "youtube.com/@handle".
    try {
      return new URL(`https://${trimmed}`);
    } catch (err) {
      return null;
    }
  }
}

function inferPlatformFromUrl(urlObj: URL): {
  platform: Creator['platform'];
  handle?: string;
  channelId?: string;
  channelUrl: string;
} {
  const hostname = urlObj.hostname.toLowerCase();
  const pathSegments = urlObj.pathname.split('/').filter(Boolean);
  let platform: Creator['platform'] = DEFAULT_PLATFORM;
  let handle: string | undefined;
  let channelId: string | undefined;

  const normaliseHandle = (value?: string) => {
    const cleaned = value?.replace(/\/+$/, '').replace(/^@/, '');
    return cleaned ? `@${cleaned}` : undefined;
  };

  if (hostname.includes('youtube.com') || hostname === 'youtu.be') {
    platform = 'YouTube';
    const atSegment = pathSegments.find((segment) => segment.startsWith('@'));
    if (atSegment) {
      handle = normaliseHandle(atSegment);
    } else if (pathSegments[0] === 'channel' && pathSegments[1]) {
      channelId = pathSegments[1];
    } else if (['c', 'user'].includes(pathSegments[0]) && pathSegments[1]) {
      handle = normaliseHandle(pathSegments[1]);
    } else if (pathSegments[0] && hostname !== 'youtu.be' && !['watch', 'shorts'].includes(pathSegments[0])) {
      handle = normaliseHandle(pathSegments[0]);
    }
  } else if (hostname.includes('tiktok.com')) {
    platform = 'TikTok';
    const userSegment = pathSegments.find((segment) => segment.startsWith('@')) || pathSegments[0];
    handle = normaliseHandle(userSegment);
  } else if (hostname.includes('instagram.com')) {
    platform = 'Instagram';
    handle = normaliseHandle(pathSegments[0]);
  }

  return {
    platform,
    handle,
    channelId,
    channelUrl: urlObj.href
  };
}

function deriveName(
  providedName: string | undefined,
  handle?: string,
  channelId?: string,
  fallback?: string
) {
  if (providedName) return providedName;
  if (handle) return handle.replace(/^@/, '');
  if (channelId) return channelId;
  return fallback || '';
}

type ScanningStatus = Record<string, 'Pending' | 'Scanning' | 'Done' | 'Error' | 'Cached' | 'Stale'>;

type Stage = 'idle' | 'searching' | 'classifying' | 'commercial';

export default function BrandSafetyTab() {
  const [creatorInput, setCreatorInput] = useState('');
  const [creators, setCreators] = useState<Creator[]>([]);
  const [resultsByCreatorId, setResultsByCreatorId] = useState<Record<string, BrandSafetyResult>>({});
  const [commercialResultsByCreatorId, setCommercialResultsByCreatorId] = useState<
    Record<string, CommercialMomentumResult>
  >({});
  const [isScanning, setIsScanning] = useState(false);
  const [filterRiskLevel, setFilterRiskLevel] = useState<'All' | 'green' | 'amber' | 'red' | 'unknown'>(
    'All'
  );
  const [error, setError] = useState<string | null>(null);
  const [commercialError, setCommercialError] = useState<string | null>(null);
  const [detailsModalCreatorId, setDetailsModalCreatorId] = useState<string | null>(null);
  const [scanningStatus, setScanningStatus] = useState<ScanningStatus>({});
  const [commercialStatus, setCommercialStatus] = useState<ScanningStatus>({});
  const [apiKeys, setApiKeys] = useState<ApiKeys>({});
  const [stage, setStage] = useState<Stage>('idle');
  const currentlyScanning = useMemo(
    () => Object.values(scanningStatus).filter((status) => status === 'Scanning').length,
    [scanningStatus]
  );

  useEffect(() => {
    const storedResults = loadCachedResults();
    const map: Record<string, BrandSafetyResult> = {};
    storedResults.forEach((r) => (map[r.creatorId] = r));
    setResultsByCreatorId(map);

    const storedCommercial = loadCachedCommercialResults();
    const commercialMap: Record<string, CommercialMomentumResult> = {};
    storedCommercial.forEach((r) => (commercialMap[r.creatorId] = r));
    setCommercialResultsByCreatorId(commercialMap);

    setApiKeys(loadApiKeys());
  }, []);

  const missingKeys = useMemo(() => {
    return !apiKeys.googleCseApiKey || !apiKeys.googleCseCx || !apiKeys.openAiApiKey;
  }, [apiKeys]);

  const commercialDisabledMessage = useMemo(() => {
    if (!apiKeys.influencersClubApiKey) return 'Add Influencers.club API key in Settings to enable Commercial Momentum analysis';
    return '';
  }, [apiKeys]);

  const filteredCreators = useMemo(() => {
    if (filterRiskLevel === 'All') return creators;
    return creators.filter((creator) => resultsByCreatorId[creator.id]?.riskLevel === filterRiskLevel);
  }, [creators, filterRiskLevel, resultsByCreatorId]);

  function parseCreators(): Creator[] {
    return creatorInput
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line, idx) => {
        const [namePart, handlePart] = line.split(',');
        let name = stripTrailingSlash(namePart?.trim());
        let handle = stripTrailingSlash(handlePart?.trim());
        let platform: Creator['platform'] = DEFAULT_PLATFORM;
        let channelUrl: string | undefined;
        let channelId: string | undefined;

        const urlFromName = tryParseUrl(name);
        if (urlFromName) {
          const platformData = inferPlatformFromUrl(urlFromName);
          platform = platformData.platform;
          channelUrl = platformData.channelUrl;
          channelId = platformData.channelId;
          if (platformData.handle) handle = platformData.handle;
          name = undefined;
        }

        const urlFromHandle = tryParseUrl(handle);
        if (!channelUrl && urlFromHandle) {
          const platformData = inferPlatformFromUrl(urlFromHandle);
          platform = platformData.platform;
          channelUrl = platformData.channelUrl;
          channelId = platformData.channelId;
          if (platformData.handle) handle = platformData.handle;
        }

        const finalName = deriveName(name, handle, channelId, line);
        const finalHandle = handle && stripTrailingSlash(handle);
        return {
          id: `creator-${idx}-${encodeURIComponent(line)}`,
          name: finalName,
          handle: finalHandle || undefined,
          platform,
          channelUrl,
          channelId
        } as Creator;
      });
  }

  function loadCreators() {
    const parsed = parseCreators();
    if (!parsed.length) {
      setError('Enter at least one creator name.');
      return;
    }
    setError(null);
    setCreators(parsed);
    const nextStatus: ScanningStatus = {};
    const nextResults: Record<string, BrandSafetyResult> = {};
    const nextCommercialStatus: ScanningStatus = {};
    const nextCommercialResults: Record<string, CommercialMomentumResult> = {};

    parsed.forEach((creator) => {
      const cached = localCache.get(creator.name);
      if (cached && localCache.isFresh(creator.name, 30)) {
        // Preserve UI mapping to the current creator row while reusing cached evidence.
        nextResults[creator.id] = {
          ...cached.data,
          creatorId: creator.id,
          creatorName: creator.name,
          creatorHandle: creator.handle
        };
        nextStatus[creator.id] = 'Cached';
      } else {
        nextStatus[creator.id] = 'Stale';
      }

      const cachedCommercial = commercialCache.get(creator.name);
      if (cachedCommercial && commercialCache.isFresh(creator.name, 7)) {
        nextCommercialResults[creator.id] = {
          ...cachedCommercial.data,
          creatorId: creator.id,
          status: 'ok'
        } as CommercialMomentumResult;
        nextCommercialStatus[creator.id] = 'Cached';
      } else if (cachedCommercial) {
        nextCommercialResults[creator.id] = { ...cachedCommercial.data, creatorId: creator.id, status: 'stale' };
        nextCommercialStatus[creator.id] = 'Stale';
      } else {
        nextCommercialStatus[creator.id] = 'Stale';
      }
    });

    setResultsByCreatorId(nextResults);
    setScanningStatus(nextStatus);
    setCommercialResultsByCreatorId(nextCommercialResults);
    setCommercialStatus(nextCommercialStatus);
  }

  async function handleScan(targetCreators: Creator[]) {
    if (!targetCreators.length) {
      setError('Add at least one creator before scanning.');
      return;
    }
    if (missingKeys) {
      setError('Enter your API keys in Settings to run brand safety checks.');
      return;
    }
    setIsScanning(true);
    setStage('searching');
    setError(null);
    setCommercialError(null);
    const status: ScanningStatus = {};
    targetCreators.forEach((c) => (status[c.id] = 'Scanning'));
    setScanningStatus((prev) => ({ ...prev, ...status }));
    try {
      const resultsPromise = scanManyCreators(targetCreators, apiKeys);
      setStage('classifying');
      const results = await resultsPromise;
      const nextMap = { ...resultsByCreatorId } as Record<string, BrandSafetyResult>;
      const nextStatus = { ...scanningStatus, ...status } as ScanningStatus;
      results.forEach((r: BrandSafetyResult) => {
        if (!r.evidence.length && (r.riskScore === 0 || r.riskScore === null) && r.summary.includes('failed')) {
          nextStatus[r.creatorId] = 'Error';
          return;
        }
        nextStatus[r.creatorId] = 'Done';
        nextMap[r.creatorId] = r;
        localCache.set(r.creatorName, r);
      });
      setResultsByCreatorId(nextMap);
      setScanningStatus(nextStatus);

      if (apiKeys.influencersClubApiKey) {
        setStage('commercial');
        await runCommercialScans(targetCreators);
      } else {
        setCommercialError(commercialDisabledMessage || null);
      }
    } catch (err: any) {
      setError(err.message || 'Scan failed.');
    } finally {
      setIsScanning(false);
      setStage('idle');
    }
  }

  async function runCommercialScans(targetCreators: Creator[]) {
    if (!apiKeys.influencersClubApiKey) return;
    const status: ScanningStatus = {};
    targetCreators.forEach((c) => (status[c.id] = 'Scanning'));
    setCommercialStatus((prev) => ({ ...prev, ...status }));

    for (const creator of targetCreators) {
      try {
        const result = await runCommercialMomentum(creator, apiKeys);
        setCommercialResultsByCreatorId((prev) => ({ ...prev, [creator.id]: result }));
        commercialCache.set(creator.name, result);
        setCommercialStatus((prev) => ({ ...prev, [creator.id]: 'Done' }));
      } catch (err: any) {
        setCommercialError(err?.message || 'Commercial Momentum scan failed.');
        setCommercialStatus((prev) => ({ ...prev, [creator.id]: 'Error' }));
      }
    }
  }

  async function handleRescan(creator: Creator) {
    if (missingKeys) {
      setError('Enter your API keys in Settings to run brand safety checks.');
      return;
    }

    setStage('searching');
    setIsScanning(true);
    setScanningStatus((prev) => ({ ...prev, [creator.id]: 'Scanning' }));
    try {
      const result = await scanSingleCreator(creator, apiKeys);
      const mappedResult = { ...result, creatorId: creator.id } as BrandSafetyResult;
      setResultsByCreatorId((prev) => ({ ...prev, [creator.id]: mappedResult }));
      localCache.set(creator.name, mappedResult);
      setScanningStatus((prev) => ({ ...prev, [creator.id]: 'Done' }));

      if (apiKeys.influencersClubApiKey) {
        setStage('commercial');
        setCommercialStatus((prev) => ({ ...prev, [creator.id]: 'Scanning' }));
        try {
          const commercialResult = await runCommercialMomentum(creator, apiKeys);
          setCommercialResultsByCreatorId((prev) => ({ ...prev, [creator.id]: commercialResult }));
          commercialCache.set(creator.name, commercialResult);
          setCommercialStatus((prev) => ({ ...prev, [creator.id]: 'Done' }));
        } catch (err: any) {
          setCommercialError(err?.message || 'Commercial Momentum scan failed.');
          setCommercialStatus((prev) => ({ ...prev, [creator.id]: 'Error' }));
        }
      } else {
        setCommercialError(commercialDisabledMessage || null);
      }
    } catch (err: any) {
      setError(err.message || 'Scan failed.');
      setScanningStatus((prev) => ({ ...prev, [creator.id]: 'Error' }));
    } finally {
      setIsScanning(false);
      setStage('idle');
    }
  }

  function renderScanState(creator: Creator, result?: BrandSafetyResult) {
    const status = scanningStatus[creator.id];
    const cachedFresh = status === 'Cached' || localCache.isFresh(creator.name, 30);

    if (status === 'Scanning') {
      return (
        <span className="status-text" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span className="spinner" aria-label="Scanning" /> Scanning...
        </span>
      );
    }

    if (cachedFresh && result?.lastChecked) {
      return (
        <span className="status-text success" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span aria-hidden>🟢</span> Last scanned on {new Date(result.lastChecked).toLocaleString()}
        </span>
      );
    }

    if (status === 'Stale' || !result) {
      return (
        <span className="status-text" style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#b26a00' }}>
          <span aria-hidden>🟠</span> Not scanned in last 30 days
        </span>
      );
    }

    return result?.lastChecked ? new Date(result.lastChecked).toLocaleString() : '—';
  }

  function renderCommercialCell(creator: Creator, result?: CommercialMomentumResult) {
    const status = commercialStatus[creator.id];

    if (!apiKeys.influencersClubApiKey) {
      return <span className="text-muted">{commercialDisabledMessage}</span>;
    }

    if (status === 'Scanning') {
      return (
        <span className="status-text" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span className="spinner" aria-label="Scanning" /> Commercial layer
        </span>
      );
    }

    if (status === 'Error') {
      return <span className="badge red">Commercial scan failed</span>;
    }

    if (!result) {
      return <span className="text-muted">No Commercial Momentum scan</span>;
    }

    const isFresh = commercialCache.isFresh(creator.name, 7);

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div>
          <strong>{result.score}</strong> / 100
        </div>
        <div className="text-muted">{new Date(result.lastChecked).toLocaleString()}</div>
        {!isFresh && <span className="badge amber">Out of date</span>}
      </div>
    );
  }

  const exportableResults = useMemo(() => Object.values(resultsByCreatorId), [resultsByCreatorId]);

  return (
    <div className="card">
      <h2>Brand Safety</h2>
      <p className="text-muted">
        Indicative reputational scan using public search and platform metadata. Scores are not determinations of fact.
      </p>

      {missingKeys ? (
        <div className="badge red" style={{ marginBottom: 12 }}>
          Missing Google Search or OpenAI credentials. Add them in Settings to enable scanning.
        </div>
      ) : (
        <div className="badge green" style={{ marginBottom: 12 }}>
          Keys loaded from Settings. Scans run fully in your browser.
        </div>
      )}

      {commercialDisabledMessage ? (
        <div className="badge amber" style={{ marginBottom: 12 }}>
          {commercialDisabledMessage}
        </div>
      ) : (
        <div className="badge green" style={{ marginBottom: 12 }}>
          Influencers.club key loaded. Commercial Momentum will run after Brand Safety.
        </div>
      )}

      {error && <div className="badge red">{error}</div>}
      {commercialError && <div className="badge red">{commercialError}</div>}

      <div className="flex-row" style={{ gap: 12, marginTop: 12, alignItems: 'stretch' }}>
        <div style={{ flex: 1 }}>
          <label className="text-muted" style={{ display: 'block', marginBottom: 4 }}>
            Creator names (one per line). Add a comma to include a handle or URL.
          </label>
          <textarea
            value={creatorInput}
            onChange={(e) => setCreatorInput(e.target.value)}
            placeholder="Example Person, @handle or https://www.youtube.com/@handle"
            style={{ width: 'calc(100% - 20px)', minHeight: 140, padding: 12 }}
          />
          <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
            <button className="button" onClick={loadCreators} disabled={isScanning || missingKeys}>
              Load creators
            </button>
            <button
              className="button secondary"
              onClick={() => handleScan(creators)}
              disabled={isScanning || !creators.length || missingKeys}
              title={missingKeys ? 'Add Google and OpenAI keys first' : undefined}
            >
              Scan loaded creators
            </button>
            <button
              className="button secondary"
              onClick={() => exportToCsv(exportableResults)}
              disabled={!exportableResults.length}
            >
              Export CSV
            </button>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              Risk filter:
              <select value={filterRiskLevel} onChange={(e) => setFilterRiskLevel(e.target.value as any)}>
                <option value="All">All</option>
                <option value="green">Low</option>
                <option value="amber">Medium</option>
                <option value="red">High</option>
                <option value="unknown">Unknown</option>
              </select>
            </label>
          </div>
          {missingKeys && (
            <p className="status-text" style={{ marginTop: 8 }}>
              Add your Google and OpenAI credentials in Settings to enable scanning.
            </p>
          )}
          {isScanning && (
            <p className="status-text">
              {stage === 'searching'
                ? 'Running enriched Google queries...'
                : stage === 'classifying'
                  ? 'Classifying articles with GPT...'
                  : 'Building Commercial Momentum signals...'}
            </p>
          )}
        </div>

        <div style={{ width: 320, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div className="card" style={{ padding: 12 }}>
            <h4 style={{ marginTop: 0 }}>Status</h4>
            <p className="status-text" style={{ marginTop: 4 }}>
              {isScanning ? `Scanning ${currentlyScanning || creators.length} creators...` : 'Idle'}
            </p>
            <p className="text-muted" style={{ marginTop: 4 }}>
              Stage:
              {stage === 'idle'
                ? 'Ready'
                : stage === 'searching'
                  ? 'Search enrichment'
                  : stage === 'classifying'
                    ? 'Semantic classification'
                    : 'Commercial momentum'}
            </p>
          </div>
        </div>
      </div>

      <table className="table" style={{ marginTop: 16 }}>
        <thead>
          <tr>
            <th>Creator</th>
            <th>Handle/ID</th>
            <th>Last checked</th>
            <th>Risk score</th>
            <th>Risk level</th>
            <th>Confidence</th>
            <th>Commercial Momentum</th>
            <th>Recommendation</th>
            <th>Summary</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {filteredCreators.map((creator) => {
            const result = resultsByCreatorId[creator.id];
            const commercialResult = commercialResultsByCreatorId[creator.id];
            const status = scanningStatus[creator.id];
            return (
              <tr key={creator.id}>
                <td>{creator.name}</td>
                <td>{creator.handle || '—'}</td>
                <td>{renderScanState(creator, result)}</td>
                <td>
                  {result?.finalScore?.toFixed
                    ? result.finalScore.toFixed(1)
                    : result?.finalScore ?? '—'}
                </td>
                <td>
                  {result ? (
                    <span className={riskBadgeClass(result.riskLevel)}>{formatRiskLabel(result.riskLevel)}</span>
                  ) : status ? (
                    <span className="status-text">{status}</span>
                  ) : (
                    '—'
                  )}
                </td>
                <td>{result ? `${Math.round((result.confidence || 0) * 100)}%` : '—'}</td>
                <td>{renderCommercialCell(creator, commercialResult)}</td>
                <td>
                  {commercialResult?.recommendation ||
                    (!apiKeys.influencersClubApiKey ? commercialDisabledMessage : '—')}
                </td>
                <td style={{ maxWidth: 280 }}>{result?.summary || 'No scan yet'}</td>
                <td>
                  <div className="table-actions">
                    <button
                      className="button secondary"
                      onClick={() => handleRescan(creator)}
                      disabled={missingKeys || status === 'Scanning' || isScanning}
                    >
                      Rescan
                    </button>
                    <button
                      className="button secondary"
                      onClick={() => setDetailsModalCreatorId(creator.id)}
                      disabled={!result && !commercialResult}
                    >
                      View details
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
          {!filteredCreators.length && (
            <tr>
              <td colSpan={10} className="text-muted">
                No creators loaded yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {detailsModalCreatorId &&
        (resultsByCreatorId[detailsModalCreatorId] || commercialResultsByCreatorId[detailsModalCreatorId]) && (
          <DetailsModal
            result={resultsByCreatorId[detailsModalCreatorId]}
            commercialResult={commercialResultsByCreatorId[detailsModalCreatorId]}
            onClose={() => setDetailsModalCreatorId(null)}
          />
        )}
    </div>
  );
}

function DetailsModal({
  result,
  commercialResult,
  onClose
}: {
  result?: BrandSafetyResult;
  commercialResult?: CommercialMomentumResult;
  onClose: () => void;
}) {
  const heatmap = result ? buildCategoryHeatmap(result) : [];
  const topEvidence = result ? topSevereEvidence(result, 5) : [];
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3>Details for {result?.creatorName || commercialResult?.creatorName}</h3>
          <button className="button secondary" onClick={onClose}>
            Close
          </button>
        </div>
        {result && (
          <>
            <p className="text-muted">
              Risk: {formatRiskLabel(result.riskLevel)} (
              {result.finalScore?.toFixed ? result.finalScore.toFixed(1) : 'n/a'})
            </p>
            <p className="text-muted">Confidence: {Math.round((result.confidence || 0) * 100)}%</p>
            <p>{result.summary}</p>
          </>
        )}

        {result ? (
          <>
            <h4>Category heatmap</h4>
            {heatmap.length ? (
              <div className="heatmap">
                {heatmap.map((row) => (
                  <div key={row.category} className="heatmap-row">
                    <span>{row.category}</span>
                    <div className="heatmap-bar" style={{ width: `${Math.min(row.count * 20, 100)}%` }} />
                    <span className="text-muted">{row.count}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-muted">No flagged categories.</p>
            )}

            <h4>Top severity evidence</h4>
            {topEvidence.length ? (
              <ul className="evidence-list">
                {topEvidence.map((item, idx) => (
                  <li key={idx}>
                    <div className="evidence-header">
                      <strong>{item.title}</strong>
                      <span className="badge secondary">Score +{item.riskContribution.toFixed(1)}</span>
                    </div>
                    <div className="text-muted" style={{ marginBottom: 4 }}>
                      {item.snippet}
                    </div>
                    <div className="text-muted" style={{ marginBottom: 4 }}>
                      {item.classification.stance} • {item.classification.category || 'unclassified'} • Severity {item.classification.severity}
                    </div>
                    <div className="timeline-bar">
                      <div className="timeline-fill" style={{ width: `${item.recency * 100}%` }} />
                      <span className="text-muted">Recency weight {item.recency.toFixed(2)}</span>
                    </div>
                    <a href={item.url} target="_blank" rel="noreferrer">
                      {item.url}
                    </a>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted">No evidence collected for this scan.</p>
            )}

            <h4>All evidence</h4>
            {result.evidence.length ? (
              <ul>
                {result.evidence.map((item, idx) => (
                  <li key={idx} style={{ marginBottom: 8 }}>
                    <div style={{ fontWeight: 600 }}>{item.title}</div>
                    <div className="text-muted" style={{ marginBottom: 4 }}>
                      {item.snippet}
                    </div>
                    <div className="text-muted" style={{ marginBottom: 4 }}>
                      {item.classification.summary}
                    </div>
                    <a href={item.url} target="_blank" rel="noreferrer">
                      {item.url}
                    </a>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted">No evidence collected for this scan.</p>
            )}
          </>
        ) : (
          <p className="text-muted">No Brand Safety scan available for this creator.</p>
        )}

        <h4>Commercial Momentum</h4>
        {commercialResult ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div>
              <strong>{commercialResult.score}</strong> / 100 • {commercialResult.recommendation}
            </div>
            <div className="text-muted">Last sponsored: {commercialResult.lastSponsoredPostDate || 'Not seen'}</div>
            <div className="text-muted">
              Sponsorship cadence: {commercialResult.signals.sponsoredPostsLast30Days} (30d) /{' '}
              {commercialResult.signals.sponsoredPostsLast60Days} (60d) / {commercialResult.signals.sponsoredPostsLast90Days} (90d)
            </div>
            <div className="text-muted">
              Engagement ratio: {commercialResult.signals.engagementRatio.toFixed(2)}x • Avg sponsored eng.{' '}
              {commercialResult.signals.avgSponsoredEngagement.toFixed(1)}
            </div>
            {commercialResult.signals.followerGrowthRate !== undefined && commercialResult.signals.followerGrowthRate !== null && (
              <div className="text-muted">
                Follower growth: {(commercialResult.signals.followerGrowthRate * 100).toFixed(1)}%
              </div>
            )}
            {commercialResult.semanticSummary?.audienceSummary && (
              <div>
                <strong>Semantic summary:</strong> {commercialResult.semanticSummary.audienceSummary}
              </div>
            )}
            {commercialResult.keyDrivers?.length ? (
              <ul>
                {commercialResult.keyDrivers.map((driver, idx) => (
                  <li key={idx}>{driver}</li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : (
          <p className="text-muted">Commercial Momentum not yet run for this creator.</p>
        )}
      </div>
    </div>
  );
}
