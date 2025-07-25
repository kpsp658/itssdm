// config/database.js
const { Pool } = require('pg');

const pool = new Pool({
  user: process.env.DB_USER || 'itssdm',
  host: process.env.DB_HOST || '10.10.10.107',
  database: process.env.DB_NAME || 'itssdm_db',
  password: process.env.DB_PASSWORD || 'Its@pg01',
  port: process.env.DB_PORT || 5432,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Test connection
pool.on('connect', () => {
  console.log('✅ Connected to PostgreSQL database');
});

pool.on('error', (err) => {
  console.error('❌ Database connection error:', err);
});

module.exports = pool;