import { useEffect, useState } from 'react';

const ago = t => { const s = Math.round((Date.now() - t) / 1000); return s < 60 ? `${s}s ago` : `${Math.round(s / 60)}m ago`; };
const isOnline = n => Date.now() - n.last_seen < 10000;

export default function App() {
  const [nodes, setNodes] = useState([]);
  const [live, setLive] = useState(false);
  const [, tick] = useState(0);

  useEffect(() => {
    let ws, timer, closed = false;
    const connect = () => {
      ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
      ws.onopen = () => setLive(true);
      ws.onmessage = e => { const m = JSON.parse(e.data); if (m.type === 'nodes') setNodes(m.nodes); };
      ws.onclose = () => { setLive(false); if (!closed) timer = setTimeout(connect, 2000); };
    };
    connect();
    const t = setInterval(() => tick(x => x + 1), 1000); // refresh "last seen" and online status
    return () => { closed = true; clearTimeout(timer); clearInterval(t); ws && ws.close(); };
  }, []);

  const online = nodes.filter(isOnline);
  const gateways = online.filter(n => n.role === 'gateway').length;
  const batt = online.length ? Math.round(online.reduce((s, n) => s + (n.battery_percent || 0), 0) / online.length) : 0;

  return (
    <>
      <h1>MESHNET Dashboard</h1>
      <div className="sub">{live ? 'Live: connected to control plane' : 'Disconnected: retrying…'}</div>
      <div className="cards">
        <div className="card"><b>{online.length}/{nodes.length}</b><span>Nodes online</span></div>
        <div className="card"><b>{gateways}</b><span>Active gateways</span></div>
        <div className="card"><b>{batt}%</b><span>Avg battery</span></div>
      </div>
      <div className="tw"><table>
        <thead><tr><th>Node</th><th>Role</th><th>Network</th><th>Mbps</th><th>Latency</th><th>Battery</th><th>Last seen</th></tr></thead>
        <tbody>{nodes.map(n => (
          <tr key={n.node_id}>
            <td><span className="dot" style={{ background: isOnline(n) ? 'var(--ok)' : 'var(--bad)' }} /><code>{n.node_id.slice(0, 8)}</code></td>
            <td>{n.role}</td><td>{n.network_type ?? '-'}</td><td>{n.estimated_bandwidth ?? '-'}</td>
            <td>{n.latency_ms != null ? `${n.latency_ms} ms` : '-'}</td><td>{n.battery_percent != null ? `${n.battery_percent}%` : '-'}</td>
            <td>{ago(n.last_seen)}</td>
          </tr>))}</tbody>
      </table></div>
    </>
  );
}
