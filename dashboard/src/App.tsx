import { useEffect, useState } from 'react';
import { Routes, Route, NavLink, useLocation } from 'react-router-dom';
import { fetchStatus } from './api';
import type { ServerStatus } from './types';
import ToolsPage from './pages/ToolsPage';
import LeapingFunctionsPage from './pages/LeapingFunctionsPage';
import LogsPage from './pages/LogsPage';
import SettingsPage from './pages/SettingsPage';

const PAGE_TITLES: Record<string, string> = {
  '/': 'MCP Tools',
  '/leaping': 'Leaping Functions Reference',
  '/logs': 'Call Logs',
  '/settings': 'Settings',
};

export default function App() {
  const location = useLocation();
  const [status, setStatus] = useState<ServerStatus | null>(null);
  const [serverUp, setServerUp] = useState<boolean | null>(null);

  useEffect(() => {
    const check = () =>
      fetchStatus()
        .then((s) => { setStatus(s); setServerUp(true); })
        .catch(() => { setStatus(null); setServerUp(false); });

    check();
    const id = setInterval(check, 15_000);
    return () => clearInterval(id);
  }, []);

  const title = PAGE_TITLES[location.pathname] ?? 'Pflegemittelbox MCP';
  const envLabel = status?.env ?? 'local';

  return (
    <div className="layout">
      {/* ── Sidebar ─────────────────────────────────────────────── */}
      <aside className="sidebar">
        <div className="sidebar-logo">
          <h1>Pflegemittelbox</h1>
          <p>MCP Tools Dashboard</p>
        </div>

        <ul className="sidebar-nav">
          <li>
            <NavLink to="/" end>
              <span className="icon">🔧</span> MCP Tools
            </NavLink>
          </li>
          <li>
            <NavLink to="/leaping">
              <span className="icon">🔗</span> Leaping Functions
            </NavLink>
          </li>
          <li>
            <NavLink to="/logs">
              <span className="icon">📋</span> Call Logs
            </NavLink>
          </li>
          <li>
            <NavLink to="/settings">
              <span className="icon">⚙️</span> Settings
            </NavLink>
          </li>
        </ul>

        <div className="sidebar-footer">
          MCP Server v0.1.0
        </div>
      </aside>

      {/* ── Main ────────────────────────────────────────────────── */}
      <div className="main">
        <header className="topbar">
          <h2>{title}</h2>

          <span className="env-badge">{envLabel}</span>

          <div className="server-pill">
            <span
              className={`status-dot ${serverUp === true ? 'up' : serverUp === false ? 'down' : ''}`}
            />
            {serverUp === true
              ? `server up · ${status?.uptime_s}s`
              : serverUp === false
              ? 'server unreachable'
              : 'connecting…'}
          </div>
        </header>

        <div className="content">
          <Routes>
            <Route path="/" element={<ToolsPage />} />
            <Route path="/leaping" element={<LeapingFunctionsPage />} />
            <Route path="/logs" element={<LogsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Routes>
        </div>
      </div>
    </div>
  );
}
