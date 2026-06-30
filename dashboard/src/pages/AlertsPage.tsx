import { useEffect, useState } from 'react';
import { fetchRecentAlerts } from '../api';
import type { PostCallAlertHistoryEntry } from '../types';

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<PostCallAlertHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchRecentAlerts(50)
      .then((response) => setAlerts(response.alerts))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="empty-state"><span className="spinner" /></div>;
  }

  return (
    <>
      <p className="page-title">Recent Post-Call Alerts</p>
      <p className="page-sub">
        Latest alert decisions recorded by the post-call monitor or manual notifier tests.
      </p>

      <div className="card">
        {alerts.length === 0 ? (
          <div className="empty-state">No alert history recorded yet.</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Call</th>
                  <th>Subject</th>
                  <th>Provider</th>
                  <th>Sent</th>
                  <th>Reason</th>
                </tr>
              </thead>
              <tbody>
                {alerts.map((alert) => (
                  <tr key={alert.id}>
                    <td className="ts">{new Date(alert.created_at).toLocaleString('de-DE')}</td>
                    <td style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>
                      {alert.call_id ?? '—'}
                    </td>
                    <td title={alert.email_text ?? ''}>{alert.subject ?? '—'}</td>
                    <td>{alert.provider ?? 'none'}</td>
                    <td>
                      <span className={`badge ${alert.email_sent ? 'badge-safe' : 'badge-info'}`}>
                        {alert.email_sent ? 'sent' : 'not sent'}
                      </span>
                    </td>
                    <td title={alert.biggest_problem ?? ''}>{alert.reason ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
