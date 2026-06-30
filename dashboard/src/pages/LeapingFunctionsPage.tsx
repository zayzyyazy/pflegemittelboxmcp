import { useEffect, useState } from 'react';
import { fetchLeapingFunctions } from '../api';
import type { LeapingFunction } from '../types';

export default function LeapingFunctionsPage() {
  const [fns, setFns] = useState<LeapingFunction[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'safe' | 'risky'>('all');
  const [showTechnicalDetails, setShowTechnicalDetails] = useState(false);

  useEffect(() => {
    fetchLeapingFunctions()
      .then((r) => setFns(r.functions))
      .finally(() => setLoading(false));
  }, []);

  const visible = fns.filter((f) => {
    if (filter === 'safe') return f.safe;
    if (filter === 'risky') return !f.safe;
    return true;
  });

  if (loading) return <div className="empty-state"><span className="spinner" /></div>;

  return (
    <>
      <p className="page-title">Leaping Functions Reference</p>
      <p className="page-sub">
        These are the API functions already configured inside Leaping for Marie. Read-only reference — nothing here calls production.
      </p>

      <div className="notice notice-info">
        <strong>Note:</strong> These functions live inside Leaping. They are listed here so you can plan which ones to expose as MCP tools later.
        Functions marked <strong>production-changing</strong> write data or initiate calls — do not add those to MCP without a confirmation step.
      </div>

      {/* ── Filter bar ──────────────────────────────────────────── */}
      <div className="gap-2" style={{ marginBottom: 16 }}>
        {(['all', 'safe', 'risky'] as const).map((f) => (
          <button
            key={f}
            className={`btn btn-sm ${filter === f ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setFilter(f)}
          >
            {f === 'all' ? `All (${fns.length})` : f === 'safe' ? `✓ Safe (${fns.filter((x) => x.safe).length})` : `⚠ Risky (${fns.filter((x) => !x.safe).length})`}
          </button>
        ))}
        <button
          className={`btn btn-sm ${showTechnicalDetails ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => setShowTechnicalDetails((value) => !value)}
        >
          {showTechnicalDetails ? 'Hide technical details' : 'Show technical details'}
        </button>
      </div>

      <div className="card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Function Name</th>
                <th>Type</th>
                <th>Method</th>
                <th>Parameters</th>
                <th>Notes</th>
                <th>Safe?</th>
                <th>Prod-changing?</th>
                {showTechnicalDetails ? <th>URL / Endpoint</th> : null}
              </tr>
            </thead>
            <tbody>
              {visible.map((fn) => (
                <tr key={fn.name}>
                  <td>
                    <code style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--accent)' }}>
                      {fn.name}
                    </code>
                  </td>
                  <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{fn.type}</td>
                  <td>
                    <span className={`badge ${fn.method === 'GET' ? 'badge-safe' : 'badge-info'}`}>
                      {fn.method}
                    </span>
                  </td>
                  <td>
                    {fn.parameters.map((p) => (
                      <code
                        key={p}
                        style={{ display: 'inline-block', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 4, padding: '1px 5px', fontSize: 11, marginRight: 4, marginBottom: 2 }}
                      >
                        {p}
                      </code>
                    ))}
                  </td>
                  <td style={{ fontSize: 12, maxWidth: 220 }}>{fn.notes}</td>
                  <td>
                    <span className={`badge ${fn.safe ? 'badge-safe' : 'badge-risky'}`}>
                      {fn.safe ? '✓ safe' : '⚠ risky'}
                    </span>
                  </td>
                  <td>
                    {fn.productionChanging ? (
                      <span className="badge badge-prod">⚠ yes</span>
                    ) : (
                      <span className="badge badge-safe">no</span>
                    )}
                  </td>
                  {showTechnicalDetails ? (
                    <td style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text-muted)', maxWidth: 200, wordBreak: 'break-all' }}>
                      {fn.url}
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="notice notice-warning" style={{ marginTop: 8 }}>
        <strong>Adding to MCP later:</strong> Before wiring a production-changing function into MCP, add a confirmation step.
        For example: <code>create_ticket</code> should confirm intent before posting. Start with read-only functions like
        <code> get_customer_by_insurance_number</code> and <code>check_birthday</code>.
      </div>
    </>
  );
}
