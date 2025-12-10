import { useEffect, useMemo, useState } from 'react';
import { scanManyCreators, getAllBrandSafetyResults } from '../api/brandSafetyApi';
import { BrandSafetyResult, Creator, Incident } from '../types';

const riskColors: Record<string, string> = {
  Green: 'badge green',
  Amber: 'badge amber',
  Red: 'badge red'
};

type ScanningStatus = Record<string, 'Pending' | 'Scanning' | 'Done' | 'Error'>;

export default function BrandSafetyTab() {
  const [pastedUrls, setPastedUrls] = useState('');
  const [creators, setCreators] = useState<Creator[]>([]);
  const [resultsByCreatorId, setResultsByCreatorId] = useState<Record<string, BrandSafetyResult>>({});
  const [isScanning, setIsScanning] = useState(false);
  const [filterRiskLevel, setFilterRiskLevel] = useState<'All' | 'Green' | 'Amber' | 'Red'>('All');
  const [error, setError] = useState<string | null>(null);
  const [detailsModalCreatorId, setDetailsModalCreatorId] = useState<string | null>(null);
  const [scanningStatus, setScanningStatus] = useState<ScanningStatus>({});

  useEffect(() => {
    // Attempt to load cached results on mount
    getAllBrandSafetyResults()
      .then((results) => {
        const map: Record<string, BrandSafetyResult> = {};
        results.forEach((r) => (map[r.creatorId] = r));
        setResultsByCreatorId(map);
      })
      .catch(() => {});
  }, []);

  const filteredCreators = useMemo(() => {
    if (filterRiskLevel === 'All') return creators;
    return creators.filter((creator) => resultsByCreatorId[creator.id]?.riskLevel === filterRiskLevel);
  }, [creators, filterRiskLevel, resultsByCreatorId]);

  function parseUrls(): string[] {
    return pastedUrls
      .split(/\r?\n/) // split on newlines
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
  }

  function loadUrls() {
    const urls = Array.from(new Set(parseUrls()));
    if (!urls.length) {
      setError('Paste at least one URL to scan.');
      return;
    }
    const preparedCreators: Creator[] = urls.map((url) => ({
      id: `url-${encodeURIComponent(url)}`,
      name: url,
      platform: 'Other',
      channelUrl: url
    }));
    setError(null);
    setCreators(preparedCreators);
    setScanningStatus({});
  }

  async function handleScan(targetCreators: Creator[]) {
    if (!targetCreators.length) {
      setError('Paste URLs and press Load URLs before scanning.');
      return;
    }
    setIsScanning(true);
    setError(null);
    const status: ScanningStatus = {};
    targetCreators.forEach((c) => (status[c.id] = 'Scanning'));
    setScanningStatus(status);
    try {
      const results = await scanManyCreators(targetCreators);
      const nextMap = { ...resultsByCreatorId } as Record<string, BrandSafetyResult>;
      const nextStatus = { ...status } as ScanningStatus;
      results.forEach((r: any) => {
        if (r.error) {
          nextStatus[r.creatorId] = 'Error';
          return;
        }
        nextStatus[r.creatorId] = 'Done';
        nextMap[r.creatorId] = r as BrandSafetyResult;
      });
      setResultsByCreatorId(nextMap);
      setScanningStatus(nextStatus);
    } catch (err: any) {
      setError(err.message || 'Scan failed. Check server logs.');
    } finally {
      setIsScanning(false);
    }
  }

  return (
    <div className="card">
      <h2>Brand Safety</h2>
      <p className="text-muted">
        Indicative reputational scan using public search and platform metadata. Scores are not
        determinations of fact.
      </p>

      {error && <div className="badge red">{error}</div>}

      <div className="flex-row" style={{ gap: 12, marginTop: 12, alignItems: 'flex-start' }}>
        <div style={{ flex: 1 }}>
          <label className="text-muted" style={{ display: 'block', marginBottom: 4 }}>
            Paste creator profile URLs (one per line)
          </label>
          <textarea
            value={pastedUrls}
            onChange={(e) => setPastedUrls(e.target.value)}
            placeholder="https://www.youtube.com/@example\nhttps://www.tiktok.com/@example"
            style={{ width: '100%', minHeight: 140, padding: 12 }}
          />
        </div>
        <div style={{ width: 260, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button className="button" onClick={loadUrls} disabled={isScanning}>
            Load URLs
          </button>
          <button className="button secondary" onClick={() => handleScan(creators)} disabled={isScanning || !creators.length}>
            Scan loaded URLs
          </button>
          <label>
            Risk filter:
            <select
              style={{ marginLeft: 8 }}
              value={filterRiskLevel}
              onChange={(e) => setFilterRiskLevel(e.target.value as any)}
            >
              <option value="All">All</option>
              <option value="Green">Green</option>
              <option value="Amber">Amber</option>
              <option value="Red">Red</option>
            </select>
          </label>
        </div>
      </div>

      {isScanning && <p className="status-text">Scanning... please wait.</p>}

      <table className="table">
        <thead>
          <tr>
            <th>URL</th>
            <th>Platform</th>
            <th>Last checked</th>
            <th>Risk score</th>
            <th>Risk level</th>
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
                <td>{creator.channelUrl || creator.name}</td>
                <td>{creator.platform}</td>
                <td>{result?.lastChecked ? new Date(result.lastChecked).toLocaleString() : '—'}</td>
                <td>{result?.riskScore ?? '—'}</td>
                <td>
                  {result ? (
                    <span className={riskColors[result.riskLevel]}>{result.riskLevel}</span>
                  ) : status ? (
                    <span className="status-text">{status}</span>
                  ) : (
                    '—'
                  )}
                </td>
                <td style={{ maxWidth: 280 }}>{result?.summary || 'No scan yet'}</td>
                <td>
                  <div className="table-actions">
                    <button
                      className="button secondary"
                      onClick={() => handleScan([creator])}
                      disabled={isScanning}
                    >
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
              <td colSpan={7} className="text-muted">
                No URLs loaded yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {detailsModalCreatorId && resultsByCreatorId[detailsModalCreatorId] && (
        <DetailsModal
          result={resultsByCreatorId[detailsModalCreatorId]}
          onClose={() => setDetailsModalCreatorId(null)}
        />
      )}
    </div>
  );
}

function DetailsModal({ result, onClose }: { result: BrandSafetyResult; onClose: () => void }) {
  const incidentsByCategory = result.incidents.reduce<Record<string, Incident[]>>((acc, incident) => {
    const key = incident.category || 'other';
    acc[key] = acc[key] ? [...acc[key], incident] : [incident];
    return acc;
  }, {});

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3>Details for {result.creatorProfile.primaryName}</h3>
          <button className="button secondary" onClick={onClose}>
            Close
          </button>
        </div>
        <p className="text-muted">
          Platform: {result.creatorProfile.platform} | Risk: {result.riskLevel} ({result.riskScore})
        </p>
        <p>{result.summary}</p>
        <h4>Incidents</h4>
        {Object.entries(incidentsByCategory).map(([category, incidents]) => (
          <div key={category} style={{ marginBottom: 12 }}>
            <strong>{category}</strong>
            <ul>
              {incidents.map((incident, idx) => (
                <li key={idx}>
                  <div>{incident.summary}</div>
                  <div className="text-muted">
                    {incident.approxYear ? `Year: ${incident.approxYear} | ` : ''}
                    Source: <a href={incident.sourceUrl} target="_blank" rel="noreferrer">{incident.sourceDomain}</a>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
