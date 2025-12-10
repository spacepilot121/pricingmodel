import { useEffect, useMemo, useState } from 'react';
import { scanManyCreators, getAllBrandSafetyResults } from '../api/brandSafetyApi';
import { BrandSafetyResult, Creator, Incident } from '../types';
import { mockCreators } from '../mockCreators';

const riskColors: Record<string, string> = {
  Green: 'badge green',
  Amber: 'badge amber',
  Red: 'badge red'
};

type ScanningStatus = Record<string, 'Pending' | 'Scanning' | 'Done' | 'Error'>;

export default function BrandSafetyTab() {
  const [creators, setCreators] = useState<Creator[]>([]);
  const [resultsByCreatorId, setResultsByCreatorId] = useState<Record<string, BrandSafetyResult>>({});
  const [selectedCreatorIds, setSelectedCreatorIds] = useState<string[]>([]);
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

  function loadCreatorsFromCalculator() {
    setCreators(mockCreators);
    const map: Record<string, BrandSafetyResult> = {};
    Object.values(resultsByCreatorId).forEach((r) => {
      map[r.creatorId] = r;
    });
    setResultsByCreatorId(map);
  }

  function toggleSelection(id: string) {
    setSelectedCreatorIds((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]
    );
  }

  async function handleScan(targetCreators: Creator[]) {
    if (!targetCreators.length) return;
    setIsScanning(true);
    setError(null);
    const status: ScanningStatus = {};
    targetCreators.forEach((c) => (status[c.id] = 'Pending'));
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

  const selectedCreators = creators.filter((c) => selectedCreatorIds.includes(c.id));

  return (
    <div className="card">
      <h2>Brand Safety</h2>
      <p className="text-muted">
        Indicative reputational scan using public search and platform metadata. Scores are not
        determinations of fact.
      </p>

      {error && <div className="badge red">{error}</div>}

      <div className="flex-row" style={{ marginTop: 12, marginBottom: 12 }}>
        <button className="button" onClick={loadCreatorsFromCalculator} disabled={isScanning}>
          Load creators from calculator
        </button>
        <button className="button secondary" onClick={() => handleScan(creators)} disabled={isScanning || !creators.length}>
          Scan all creators
        </button>
        <button
          className="button secondary"
          onClick={() => handleScan(selectedCreators)}
          disabled={isScanning || !selectedCreators.length}
        >
          Scan selected
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

      {isScanning && <p className="status-text">Scanning... please wait.</p>}

      <table className="table">
        <thead>
          <tr>
            <th>Select</th>
            <th>Creator</th>
            <th>Platform</th>
            <th>Channel</th>
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
                <td>
                  <input
                    type="checkbox"
                    checked={selectedCreatorIds.includes(creator.id)}
                    onChange={() => toggleSelection(creator.id)}
                  />
                </td>
                <td>{creator.name}</td>
                <td>{creator.platform}</td>
                <td>{creator.channelId || creator.channelUrl || '—'}</td>
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
                      Scan
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
              <td colSpan={9} className="text-muted">
                No creators loaded yet.
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
