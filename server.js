require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const crypto = require('crypto');
const https = require('https');
const express = require('express');

const app = express();
const port = process.env.PORT || 3000;
const startedAt = new Date();

app.disable('x-powered-by');

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime_seconds: Math.round(process.uptime()),
    started_at: startedAt.toISOString(),
  });
});

async function dbSelect1() {
  const client = (process.env.DB_CLIENT || '').toLowerCase();
  const cfg = {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT ? Number(process.env.DB_PORT) : undefined,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  };

  if (client === 'mysql') {
    const mysql = require('mysql2/promise');
    const conn = await mysql.createConnection({ ...cfg, connectTimeout: 5000 });
    try {
      const [rows] = await conn.query('SELECT 1 AS ok');
      return { client, result: rows[0].ok };
    } finally {
      await conn.end();
    }
  }

  if (client === 'postgres') {
    const { Client } = require('pg');
    const conn = new Client({ ...cfg, connectionTimeoutMillis: 5000 });
    await conn.connect();
    try {
      const r = await conn.query('SELECT 1 AS ok');
      return { client, result: r.rows[0].ok };
    } finally {
      await conn.end();
    }
  }

  const err = new Error('DB_CLIENT must be "mysql" or "postgres"');
  err.code = 'DB_CLIENT_INVALID';
  throw err;
}

app.get('/health/db', async (req, res) => {
  try {
    res.json({ status: 'ok', ...(await dbSelect1()) });
  } catch (e) {
    res.status(500).json({ status: 'error', error: e.code || e.name, message: e.message });
  }
});

function probe(host) {
  return new Promise((resolve) => {
    const started = Date.now();
    const r = https.request(
      { host, path: '/', method: 'GET', timeout: 8000 },
      (resp) => {
        resp.resume();
        resolve({ host, ok: true, status: resp.statusCode, ms: Date.now() - started });
      }
    );
    r.on('timeout', () => r.destroy(new Error('timeout')));
    r.on('error', (e) => resolve({ host, ok: false, error: e.code || e.message, ms: Date.now() - started }));
    r.end();
  });
}

app.get('/health/outbound', async (req, res) => {
  const results = await Promise.all(
    ['sg.storage.bunnycdn.com', 'fcm.googleapis.com'].map(probe)
  );
  res.json({ status: results.every((r) => r.ok) ? 'ok' : 'degraded', results });
});

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

app.get('/cron-test', (req, res) => {
  const expected = process.env.CRON_SECRET;
  if (!expected) return res.status(503).json({ error: 'CRON_SECRET not configured' });
  const given = req.get('x-cron-secret');
  if (!given || !safeEqual(given, expected)) return res.status(403).json({ error: 'forbidden' });
  res.json({ status: 'ok', ran_at: new Date().toISOString() });
});

app.listen(port, () => {
  console.log(`listening on ${port}`);
});
