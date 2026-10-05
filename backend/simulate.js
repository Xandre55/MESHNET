// Starts 4 fake nodes that register and send signed telemetry every 2s, so the dashboard has live data.
const crypto = require('crypto');
const BASE = process.env.API || 'http://localhost:4000';
const post = (p, b, h = {}) => fetch(BASE + p, { method: 'POST', headers: { 'content-type': 'application/json', ...h }, body: b }).then(r => r.json());
const j = (v, s) => +(v + (Math.random() - 0.5) * s).toFixed(1);

async function startNode(role) {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  const raw = publicKey.export({ format: 'der', type: 'spki' }).subarray(-32);
  const c = await post('/api/auth/challenge', JSON.stringify({ public_key: raw.toString('base64'), role }));
  const sig = crypto.sign(null, Buffer.from(c.nonce, 'base64'), privateKey).toString('base64');
  await post('/api/auth/verify', JSON.stringify({ node_id: c.node_id, signature: sig }));
  let battery = 60 + Math.random() * 40;
  setInterval(() => {
    battery = Math.max(5, battery - 0.1);
    const body = JSON.stringify({ internet: role === 'gateway', network_type: role === 'gateway' ? '4G' : 'mesh',
      estimated_bandwidth: role === 'gateway' ? j(18, 6) : j(6, 3), latency_ms: j(role === 'gateway' ? 42 : 70, 15),
      battery_percent: Math.round(battery), load: Math.max(0, j(0.3, 0.3)) });
    const ts = Date.now(), h = crypto.createHash('sha256').update(body).digest('hex');
    const s = crypto.sign(null, Buffer.from(`POST\n/api/telemetry\n${ts}\n${h}`), privateKey).toString('base64');
    post('/api/telemetry', body, { 'x-node-id': c.node_id, 'x-timestamp': String(ts), 'x-signature': s }).catch(() => {});
  }, 2000);
  console.log(`${role} node ${c.node_id.slice(0, 8)} online`);
}
['gateway', 'relay', 'client', 'gateway'].forEach(startNode);
