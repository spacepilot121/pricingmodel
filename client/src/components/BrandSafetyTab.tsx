import { useEffect, useMemo, useState } from 'react';
import { loadApiKeys } from '../api/apiKeyStorage';
import { loadCachedResults, scanManyCreators } from '../api/brandSafetyApi';
import { ApiKeys, BrandSafetyResult, Creator } from '../types';
import {
  buildCategoryHeatmap,
  exportToCsv,
  formatRiskLabel,
  riskBadgeClass,
  topSevereEvidence
} from '../brandSafety/brandSafetyUI';

const DEFAULT_PLATFORM: Creator['platform'] = 'Other';

type ScanningStatus = Record<string, 'Pending' | 'Scanning' | 'Done' | 'Error'>;

type Stage = 'idle' | 'searching' | 'classifying';

export default function BrandSafetyTab() {
  const [creatorInput, setCreatorInput] = useState('');
  const [creators, setCreators] = useState<Creator[]>([]);
  const [resultsByCreatorId, setResultsByCreatorId] = useState<Record<string, BrandSafetyResult>>({});
  const [isScanning, setIsScanning] = useState(false);
  const [filterRiskLevel, setFilterRiskLevel] = useState<'All' | 'green' | 'amber' | 'red' | 'unknown'>(
    'All'
  );
  const [error, setError] = useState<string | null>(null);
  const [detailsModalCreatorId, setDetailsModalCreatorId] = useState<string | null>(null);
  const [scanningStatus, setScanningStatus] = useState<ScanningStatus>({});
  const [apiKeys, setApiKeys] = useState<ApiKeys>({});
  const [stage, setStage] = useState<Stage>('idle');

  useEffect(() => {
    const storedResults = loadCachedResults();
    const map: Record<string, BrandSafetyResult> = {};
    storedResults.forEach((r) => (map[r.creatorId] = r));
    setResultsByCreatorId(map);

    setApiKeys(loadApiKeys());
  }, []);

  const missingKeys = useMemo(() => {
    return !apiKeys.googleCseApiKey || !apiKeys.googleCseCx || !apiKeys.openAiApiKey;
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
        const name = namePart?.trim();
        const handle = handlePart?.trim();
        return {
          id: `creator-${idx}-${encodeURIComponent(line)}`,
          name: name || line,
          handle: handle || undefined,
          platform: DEFAULT_PLATFORM
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
    setScanningStatus({});
    handleScan(parsed);
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
    const status: ScanningStatus = {};
    targetCreators.forEach((c) => (status[c.id] = 'Scanning'));
    setScanningStatus(status);
    try {
      const resultsPromise = scanManyCreators(targetCreators, apiKeys);
      setStage('classifying');
      const results = await resultsPromise;
      const nextMap = { ...resultsByCreatorId } as Record<string, BrandSafetyResult>;
      const nextStatus = { ...status } as ScanningStatus;
      results.forEach((r: BrandSafetyResult) => {
        if (!r.evidence.length && (r.riskScore === 0 || r.riskScore === null) && r.summary.includes('failed')) {
          nextStatus[r.creatorId] = 'Error';
          return;
        }
        nextStatus[r.creatorId] = 'Done';
        nextMap[r.creatorId] = r;
      });
      setResultsByCreatorId(nextMap);
      setScanningStatus(nextStatus);
    } catch (err: any) {
      setError(err.message || 'Scan failed.');
    } finally {
      setIsScanning(false);
      setStage('idle');
    }
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

      {error && <div className="badge red">{error}</div>}

      <div className="flex-row" style={{ gap: 12, marginTop: 12, alignItems: 'stretch' }}>
        <div style={{ flex: 1 }}>
          <label className="text-muted" style={{ display: 'block', marginBottom: 4 }}>
            Creator names (one per line). Add a comma to include a handle or ID.
          </label>
          <textarea
            value={creatorInput}
            onChange={(e) => setCreatorInput(e.target.value)}
            placeholder="Example Person, @handle"
            style={{ width: '100%', minHeight: 140, padding: 12 }}
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
                : 'Classifying articles with GPT...'}
            </p>
          )}
        </div>

        <div style={{ width: 320, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div className="card" style={{ padding: 12 }}>
            <h3 style={{ marginTop: 0 }}>API configuration</h3>
            <p className="text-muted" style={{ marginBottom: 8 }}>
              Keys are managed in Settings and loaded from your browser storage.
            </p>
            {missingKeys ? (
              <p className="status-text error" style={{ marginTop: 0 }}>
                Missing Google or OpenAI credentials. Add them in Settings.
              </p>
            ) : (
              <p className="status-text success" style={{ marginTop: 0 }}>
                Keys loaded from browser storage. Ready to scan.
              </p>
            )}
            <p className="text-muted" style={{ marginBottom: 0 }}>
              Default model: gpt-4o-mini. Switch to gpt-4o in Settings for higher fidelity.
            </p>
          </div>
          <div className="card" style={{ padding: 12 }}>
            <h4 style={{ marginTop: 0 }}>Status</h4>
            <p className="status-text" style={{ marginTop: 4 }}>
              {isScanning ? `Scanning ${creators.length} creators...` : 'Idle'}
            </p>
            <p className="text-muted" style={{ marginTop: 4 }}>
              Stage: {stage === 'idle' ? 'Ready' : stage === 'searching' ? 'Search enrichment' : 'Semantic classification'}
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
            <th>Summary</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {filteredCreators.map((creator) => {
            const result = resultsByCreatorId[creator.id];
            const status = scanningStatus[creator.id];
            return (
              <tr key={creator.id}>
                <td>{creator.name}</td>
                <td>{creator.handle || '—'}</td>
                <td>{result?.lastChecked ? new Date(result.lastChecked).toLocaleString() : '—'}</td>
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
                <td style={{ maxWidth: 280 }}>{result?.summary || 'No scan yet'}</td>
                <td>
                  <div className="table-actions">
                    <button className="button secondary" onClick={() => handleScan([creator])} disabled={isScanning || missingKeys}>
                      Rescan
                    </button>
                    <button
                      className="button secondary"
                      onClick={() => setDetailsModalCreatorId(creator.id)}
                      disabled={!result}
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
              <td colSpan={8} className="text-muted">
                No creators loaded yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {detailsModalCreatorId && resultsByCreatorId[detailsModalCreatorId] && (
        <DetailsModal result={resultsByCreatorId[detailsModalCreatorId]} onClose={() => setDetailsModalCreatorId(null)} />
      )}
    </div>
  );
}

function DetailsModal({ result, onClose }: { result: BrandSafetyResult; onClose: () => void }) {
  const heatmap = buildCategoryHeatmap(result);
  const topEvidence = topSevereEvidence(result, 5);
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3>Details for {result.creatorName}</h3>
          <button className="button secondary" onClick={onClose}>
            Close
          </button>
        </div>
        <p className="text-muted">
          Risk: {formatRiskLabel(result.riskLevel)} (
          {result.finalScore?.toFixed ? result.finalScore.toFixed(1) : 'n/a'})
        </p>
        <p className="text-muted">Confidence: {Math.round((result.confidence || 0) * 100)}%</p>
        <p>{result.summary}</p>

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
      </div>
    </div>
  );
}
