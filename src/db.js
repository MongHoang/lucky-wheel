// src/db.js
import 'dotenv/config';
import pkg from 'pg';

const { Pool } = pkg;

function buildConfigFromUrl(urlStr) {
  if (!urlStr) throw new Error('Missing DATABASE_URL');

  const u = new URL(urlStr);

  // Ép kiểu & decode đầy đủ – tránh lỗi password không phải string
  const host = u.hostname || '127.0.0.1';
  const port = Number(u.port || 5432);
  const user = decodeURIComponent(u.username || '');
  const password = String(decodeURIComponent(u.password || '')); // <- quan trọng
  const database = (u.pathname || '/').replace(/^\//, '');

  // Bật SSL nếu bạn deploy nơi bắt buộc (Railway/Render/Heroku...) – local thì false
  const ssl =
      /^(true|require)$/i.test(process.env.PG_SSL || '') ? { rejectUnauthorized: false } : false;

  return { host, port, user, password, database, ssl, max: 10, idleTimeoutMillis: 30_000 };
}

const config = buildConfigFromUrl(process.env.DATABASE_URL);

// (tuỳ chọn) debug nhẹ – KHÔNG log password
if (process.env.DB_DEBUG) {
  console.log('[DB] host=%s port=%s db=%s user=%s ssl=%s',
      config.host, config.port, config.database, config.user, !!config.ssl);
}

export const pool = new Pool(config);
export const query = (text, params) => pool.query(text, params);
