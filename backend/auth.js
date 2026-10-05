// MESHNET Stage 2 - node identity & signed requests (Ed25519 via Node's built-in crypto; no custom cryptography)
const crypto = require('crypto');
const express = require('express');
const events = new (require('events'))();

const nodes = new Map();       // node_id -> {node_id, role, public_key, last_seen}
const challenges = new Map();  // node_id -> {nonce, raw, role, exp}
const seen = new Map();        // signature -> expiry (replay cache)
const SPKI = Buffer.from('302a300506032b6570032100', 'hex'); // Ed25519 SPKI prefix
const toKey = raw => crypto.createPublicKey({ key: Buffer.concat([SPKI, raw]), format: 'der', type: 'spki' });
const idOf = raw => crypto.createHash('sha256').update(raw).digest('hex').slice(0, 32);
const verify = (raw, msg, sig) => { try { return crypto.verify(null, msg, toKey(raw), sig); } catch { return false; } };

setInterval(() => { const t = Date.now(); for (const [k, e] of seen) if (e < t) seen.delete(k); }, 30000).unref();

const router = express.Router();

// 1) Node presents its public key; node_id is derived from it (no phone number / personal identity)
router.post('/challenge', (req, res) => {
  const raw = Buffer.from(String(req.body.public_key || ''), 'base64');
  if (raw.length !== 32) return res.status(400).json({ error: 'public_key must be a base64 32-byte Ed25519 key' });
  const node_id = idOf(raw);
  const nonce = crypto.randomBytes(32).toString('base64');
  challenges.set(node_id, { nonce, raw, role: req.body.role || 'client', exp: Date.now() + 60000 });
  res.json({ node_id, nonce });
});

// 2) Node proves it holds the private key by signing the nonce (mutual-auth step 1)
router.post('/verify', (req, res) => {
  const c = challenges.get(req.body.node_id);
  if (!c || c.exp < Date.now()) return res.status(400).json({ error: 'no valid challenge' });
  challenges.delete(req.body.node_id);
  const sig = Buffer.from(String(req.body.signature || ''), 'base64');
  if (!verify(c.raw, Buffer.from(c.nonce, 'base64'), sig)) return res.status(401).json({ error: 'bad signature' });
  const node = { node_id: req.body.node_id, role: c.role, public_key: c.raw.toString('base64'), last_seen: Date.now() };
  nodes.set(node.node_id, node);
  events.emit('node', node);
  res.status(201).json({ node_id: node.node_id, role: node.role });
});

// 3) Every later request is signed: METHOD \n URL \n timestamp \n sha256(body)
function requireSigned(req, res, next) {
  const id = req.get('x-node-id'), ts = Number(req.get('x-timestamp')), sig = req.get('x-signature') || '';
  const node = nodes.get(id);
  if (!node) return res.status(401).json({ error: 'unknown node' });
  if (!ts || Math.abs(Date.now() - ts) > 30000) return res.status(401).json({ error: 'stale timestamp' });
  if (seen.has(sig)) return res.status(401).json({ error: 'replay detected' });
  const bodyHash = crypto.createHash('sha256').update(req.rawBody || '').digest('hex');
  const msg = Buffer.from(`${req.method}\n${req.originalUrl}\n${ts}\n${bodyHash}`);
  if (!verify(Buffer.from(node.public_key, 'base64'), msg, Buffer.from(sig, 'base64')))
    return res.status(401).json({ error: 'invalid signature' });
  seen.set(sig, Date.now() + 60000);
  node.last_seen = Date.now();
  req.node = node;
  next();
}

module.exports = { router, requireSigned, nodes, events };
