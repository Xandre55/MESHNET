// Simulates a MESHNET node against the local API. Run the server first (npm start), then: npm run test:client
const crypto = require('crypto');
const BASE = process.env.API || 'http://localhost:4000';

const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
const raw = publicKey.export({ format: 'der', type: 'spki' }).subarray(-32); // raw 32-byte key
const post = (path, body, headers = {}) => fetch(BASE + path, {
  method: 'POST', headers: { 'content-type': 'application/json', ...headers },
  body: typeof body === 'string' ? body : JSON.stringify(body),
}).then(async r => ({ status: r.status, data: await r.json() }));

function signed(nodeId, path, bodyStr, ts = Date.now()) {
  const bodyHash = crypto.createHash('sha256').update(bodyStr).digest('hex');
  const msg = Buffer.from(`POST\n${path}\n${ts}\n${bodyHash}`);
  const sig = crypto.sign(null, msg, privateKey).toString('base64');
  return { 'x-node-id': nodeId, 'x-timestamp': String(ts), 'x-signature': sig };
}
const check = (name, got, want) => console.log(`${got === want ? 'PASS' : 'FAIL'}  ${name} (HTTP ${got}, expected ${want})`);

(async () => {
  const c = await post('/api/auth/challenge', { public_key: raw.toString('base64'), role: 'client' });
  check('challenge issued', c.status, 200);
  const sig = crypto.sign(null, Buffer.from(c.data.nonce, 'base64'), privateKey).toString('base64');
  const v = await post('/api/auth/verify', { node_id: c.data.node_id, signature: sig });
  check('node registered', v.status, 201);
  const id = c.data.node_id, body = JSON.stringify({ battery_percent: 81, load: 0.23 });

  const h = signed(id, '/api/telemetry', body);
  check('valid signed telemetry', (await post('/api/telemetry', body, h)).status, 200);
  check('replayed request rejected', (await post('/api/telemetry', body, h)).status, 401);
  check('tampered payload rejected', (await post('/api/telemetry', JSON.stringify({ battery_percent: 100 }), signed(id, '/api/telemetry', body))).status, 401);
  check('stale timestamp rejected', (await post('/api/telemetry', body, signed(id, '/api/telemetry', body, Date.now() - 120000))).status, 401);
  check('unsigned request rejected', (await post('/api/telemetry', body)).status, 401);
  console.log('Nodes:', await fetch(BASE + '/api/nodes').then(r => r.json()));
})().catch(e => { console.error('Could not reach the API. Is the server running?', e.message); process.exit(1); });
