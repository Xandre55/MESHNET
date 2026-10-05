// MESHNET control plane - Stage 3 (live updates over WebSocket, optional Postgres)
const http = require('http');
const express = require('express');
const cors = require('cors');
const { WebSocketServer } = require('ws');
const { router: auth, requireSigned, nodes, events } = require('./auth');
const store = require('./store');

const app = express();
app.use(cors());
app.use(express.json({ verify: (req, _res, buf) => { req.rawBody = buf; } }));
app.use('/api/auth', auth);

const W = { bw: 1.0, lat: 0.05, loss: 8, load: 20, batt: 0.2, hop: 4 }; // white paper s6
const linkScore = l => W.bw * l.bandwidth - W.lat * l.latency_ms - W.loss * l.loss_pct
  - W.load * l.load - W.batt * (100 - l.battery_percent) / 10;
const routeScore = links => links.reduce((s, l) => s + linkScore(l), 0) - W.hop * links.length;

const view = () => [...nodes.values()].map(({ public_key, ...n }) => n); // never expose keys
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });
const push = () => { const m = JSON.stringify({ type: 'nodes', nodes: view() });
  wss.clients.forEach(c => c.readyState === 1 && c.send(m)); };
wss.on('connection', ws => ws.send(JSON.stringify({ type: 'nodes', nodes: view() })));
events.on('node', n => { store.save(n); push(); });

app.post('/api/telemetry', requireSigned, (req, res) => {
  const { role, node_id, public_key, ...status } = req.body; // identity/role not self-assignable
  Object.assign(req.node, status);
  events.emit('node', req.node);
  res.json({ ok: true });
});
app.get('/api/nodes', (_req, res) => res.json(view()));
app.post('/api/routes/score', requireSigned, (req, res) =>
  res.json({ score: Number(routeScore(req.body.links || []).toFixed(2)) }));
app.get('/api/health', (_req, res) => res.json({ status: 'ok', nodes: nodes.size }));

store.init(nodes).then(() => server.listen(process.env.PORT || 4000, () => console.log('MESHNET API + WS on :4000')));
