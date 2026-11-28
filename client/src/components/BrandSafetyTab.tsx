  function formatCompactNumber(value?: number | null) {
    if (value === null || value === undefined) return '';
    try {
      return value.toLocaleString(undefined, { notation: 'compact', maximumFractionDigits: 1 });
    } catch {
      return String(value);
    }
  }

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
import { loadCachedCommercialResults, runCommercialMomentum, resolveClubIdentity, creatorCacheKey } from '../commercialMomentum/commercialMomentumEngine';
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
    const parsed = new URL(trimmed);
    return ['http:','https:'].includes(parsed.protocol) ? parsed : null;
  } catch (err) {
    // Support schemeless inputs like "youtube.com/@handle".
    try {
      if (!/^(?:www\.)?(?:youtube\.com|youtu\.be|instagram\.com|tiktok\.com)\//i.test(trimmed)) return null;
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
  const hostname = urlObj.hostname.toLowerCase().replace(/^www\./, '');
  const pathSegments = urlObj.pathname.split('/').filter(Boolean);
  let platform: Creator['platform'] = DEFAULT_PLATFORM;
  let handle: string | undefined;
  let channelId: string | undefined;

  const normaliseHandle = (value?: string) => {
    const cleaned = value?.replace(/\/+$/, '').replace(/^@/, '');
    return cleaned ? `@${cleaned}` : undefined;
  };

  if (hostname === 'youtube.com' || hostname === 'youtu.be') {
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
  } else if (hostname === 'tiktok.com') {
    platform = 'TikTok';
    const userSegment = pathSegments.find((segment) => segment.startsWith('@')) || pathSegments[0];
    handle = normaliseHandle(userSegment);
  } else if (hostname === 'instagram.com') {
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
        let finalHandle = handle && stripTrailingSlash(handle);
        if (finalHandle && !finalHandle.startsWith('@') && !tryParseUrl(finalHandle)) finalHandle = '@' + finalHandle;
        if (platform === 'Other' && finalHandle && !channelUrl) platform = 'YouTube';
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
      const cached = localCache.get(creatorCacheKey(creator));
      if (cached && localCache.isFresh(creatorCacheKey(creator), 30)) {
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

      const cachedCommercial = commercialCache.get(creatorCacheKey(creator));
      if (cachedCommercial && commercialCache.isFresh(creatorCacheKey(creator), 1)) {
        nextCommercialResults[creator.id] = {
          ...cachedCommercial.data,
          creatorId: creator.id,
          status: cachedCommercial.data.status
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

  async function handleScan(targetCreators: Creator[], force = false) {
    if (!targetCreators.length) {setError('Add at least one creator.');return;}
    setIsScanning(true); setError(null); setCommercialError(null);
    try {
      for (const creator of targetCreators) {
        setScanningStatus(prev=>({...prev,[creator.id]:'Scanning'}));
        let resolved=creator;
        let profile: any;
        let identityWarning='';
        if (apiKeys.influencersClubApiKey) {
          setStage('commercial');
          try {const identity=await resolveClubIdentity(creator,apiKeys,force);resolved=identity.creator;profile=identity.profile;}
          catch (error: any) {identityWarning=error.message;setCommercialError(error.message);}
        }
        if (!missingKeys) {
          setStage('searching');
          try {
            const result=await scanSingleCreator(resolved,apiKeys,undefined,()=>setStage('classifying'));
            const mapped={...result,creatorName:creator.name,warnings:[...(result.warnings || []),...(identityWarning ? ['Profile enrichment unavailable: '+identityWarning] : [])]};
            setResultsByCreatorId(prev=>({...prev,[creator.id]:mapped}));
            localCache.set(creatorCacheKey(creator),mapped);
            setScanningStatus(prev=>({...prev,[creator.id]:'Done'}));
          } catch(error: any) {
            const failed: BrandSafetyResult={creatorId:creator.id,creatorName:creator.name,riskLevel:'unknown',riskScore:null,finalScore:null,confidence:0,evidence:[],categoriesDetected:{},summary:error.message,lastChecked:new Date().toISOString(),status:'error'};
            setResultsByCreatorId(prev=>({...prev,[creator.id]:failed}));
            setScanningStatus(prev=>({...prev,[creator.id]:'Error'}));
          }
        } else {
          setScanningStatus(prev=>({...prev,[creator.id]:'Pending'}));
          setError('Reputation scan needs Google Search and OpenAI credentials. Creator data can still be fetched.');
        }
        if (apiKeys.influencersClubApiKey && profile) {
          setStage('commercial');setCommercialStatus(prev=>({...prev,[creator.id]:'Scanning'}));
          try {
            const result=await runCommercialMomentum(creator,apiKeys,{force,profile});
            setCommercialResultsByCreatorId(prev=>({...prev,[creator.id]:result}));
            setCommercialStatus(prev=>({...prev,[creator.id]:'Done'}));
          } catch(error: any) {
            setCommercialError(error.message);
            setCommercialResultsByCreatorId(prev=>{const next={...prev};delete next[creator.id];return next;});
            setCommercialStatus(prev=>({...prev,[creator.id]:'Error'}));
          }
        } else if (apiKeys.influencersClubApiKey) {
          setCommercialResultsByCreatorId(prev=>{const next={...prev};delete next[creator.id];return next;});
          setCommercialStatus(prev=>({...prev,[creator.id]:'Error'}));
        }
      }
    } finally {setIsScanning(false);setStage('idle');}
  }
  async function handleRescan(creator: Creator) {await handleScan([creator],true);}

  function renderScanState(creator: Creator, result?: BrandSafetyResult) {
    const status = scanningStatus[creator.id];
    const cachedFresh = status !== 'Error' && (status === 'Cached' || localCache.isFresh(creatorCacheKey(creator), 30));

    if (status === 'Scanning') {
      return (
        <span className="status-text" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span className="spinner" aria-label="Scanning" /> Scanning...
        </span>
      );
    }

    if (status === 'Error') return <span className="status-text error">Scan failed. Please retry.</span>;

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

    const isFresh = commercialCache.isFresh(creatorCacheKey(creator), 1);

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div>
          <strong>{result.score === null ? 'Insufficient data' : result.score + ' / 100'}</strong>
        </div>
        <div className="text-muted">{new Date(result.lastChecked).toLocaleString()}</div>
        {result.coverage && <div className="text-muted">{result.coverage.postCount} posts checked. {result.coverage.complete ? '90 day collection complete' : 'Partial date coverage'}</div>}
        {!isFresh && <span className="badge amber">Out of date</span>}
      </div>
    );
  }

  function renderContactCell(creator: Creator, result?: CommercialMomentumResult) {
    if (!apiKeys.influencersClubApiKey) {
      return <span className="text-muted">{commercialDisabledMessage}</span>;
    }

    const status = commercialStatus[creator.id];
    if (status === 'Scanning') {
      return (
        <span className="status-text" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span className="spinner" aria-label="Scanning contact info" /> Pulling contact...
        </span>
      );
    }

    const email = result?.primaryEmail || result?.profileInsights?.emails?.[0];
    if (email) {
      return (
        <a href={`mailto:${email}`}>
          {email}
        </a>
      );
    }

    if (!result) return <span className="text-muted">Pending scan</span>;
    return <span className="text-muted">No email found</span>;
  }

  function renderTopLineStats(result?: CommercialMomentumResult) {
    const insights = result?.profileInsights;
    if (!insights) return <span className="text-muted">No stats yet</span>;

    const parts: string[] = [];
    if (insights.subscriberCount !== undefined || insights.followerCount !== undefined) {
      const count = insights.subscriberCount ?? insights.followerCount;
      if (count !== undefined) parts.push(`Followers ${formatCompactNumber(count)}`);
    }
    if (insights.viewCount !== undefined) parts.push(`Views ${formatCompactNumber(insights.viewCount)}`);
    if (insights.videoCount !== undefined) parts.push(`Posts ${formatCompactNumber(insights.videoCount)}`);
    if (insights.country) parts.push(insights.country);

    return parts.length ? <span>{parts.join(' • ')}</span> : <span className="text-muted">No stats yet</span>;
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
          Influencers Club key loaded. Profile identity is checked before reputation and commercial analysis.
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
              disabled={isScanning || !creators.length || (missingKeys && !apiKeys.influencersClubApiKey)}
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
                ? 'Searching public reputation sources...'
                : stage === 'classifying'
                  ? 'Assessing search snippets with OpenAI...'
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
            <th>Contact</th>
            <th>Top-line stats</th>
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
                <td>{renderContactCell(creator, commercialResult)}</td>
                <td>{renderTopLineStats(commercialResult)}</td>
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
              <td colSpan={12} className="text-muted">
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
            {result.warnings?.map((warning, idx) => <p key={idx} className="text-muted">{warning}</p>)}
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
        {commercialResult?.summary && <p>{commercialResult.summary}</p>}
        {commercialResult?.coverage && <p>{commercialResult.coverage.postCount} posts checked across {commercialResult.coverage.pages} pages. {commercialResult.coverage.complete ? '90 day collection complete.' : 'Partial coverage.'}</p>}
        {commercialResult ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div>
              <strong>{commercialResult.score === null ? 'Insufficient data' : commercialResult.score + ' / 100'}</strong> • {commercialResult.recommendation}
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
                <strong>Caption tone:</strong> {commercialResult.semanticSummary.audienceSummary}
              </div>
            )}
            {commercialResult.keyDrivers?.length ? (
              <ul>
                {commercialResult.keyDrivers.map((driver, idx) => (
                  <li key={idx}>{driver}</li>
                ))}
              </ul>
            ) : null}

            {commercialResult.profileInsights ? (
              <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
                <h5 style={{ margin: 0 }}>Creator basics</h5>
                {commercialResult.primaryEmail ? (
                  <div>
                    Contact:{' '}
                    <a href={`mailto:${commercialResult.primaryEmail}`}>
                      {commercialResult.primaryEmail}
                    </a>
                  </div>
                ) : (
                  <div className="text-muted">No contact email available.</div>
                )}
                <div className="text-muted">
                  {commercialResult.profileInsights.country ? `${commercialResult.profileInsights.country} • ` : ''}
                  {commercialResult.profileInsights.platformHandle || commercialResult.creatorHandle || 'Handle unknown'}
                </div>
                <div className="text-muted">
                  Followers:{' '}
                  {formatCompactNumber(
                    commercialResult.profileInsights.subscriberCount ?? commercialResult.profileInsights.followerCount
                  ) || 'n/a'}{' '}
                  • Views: {formatCompactNumber(commercialResult.profileInsights.viewCount) || 'n/a'} • Posts:{' '}
                  {formatCompactNumber(commercialResult.profileInsights.videoCount) || 'n/a'}
                </div>
                {commercialResult.profileInsights.description && (
                  <div className="text-muted" style={{ whiteSpace: 'pre-wrap' }}>
                    {commercialResult.profileInsights.description}
                  </div>
                )}
                {commercialResult.profileInsights.link && (
                  <a href={commercialResult.profileInsights.link} target="_blank" rel="noreferrer">
                    {commercialResult.profileInsights.link}
                  </a>
                )}
              </div>
            ) : null}
          </div>
        ) : (
          <p className="text-muted">Commercial Momentum not yet run for this creator.</p>
        )}
      </div>
    </div>
  );
}

