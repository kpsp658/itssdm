// routes/stock.js
const express = require('express');
const db = require('../config/database');
const router = express.Router();

// Authentication middleware
const requireAuth = (req, res, next) => {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  next();
};

router.use(requireAuth);

// ดึงข้อมูลสต็อกสรุป
router.get('/summary', async (req, res) => {
  try {
    const result = await db.query(`
      SELECT * FROM stock_summary 
      ORDER BY station, device_model
    `);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching stock summary:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// ดึงข้อมูลสต็อกตามอู่
router.get('/by-station/:station', async (req, res) => {
  const { station } = req.params;
  
  try {
    const result = await db.query(`
      SELECT 
        device_model,
        COUNT(*) as total_stock,
        COUNT(CASE WHEN status = 'ใช้งานแล้ว' THEN 1 END) as used_stock,
        COUNT(CASE WHEN status = 'พร้อมใช้' THEN 1 END) as available_stock
      FROM replacement_devices 
      WHERE station = $1
      GROUP BY device_model
      ORDER BY device_model
    `, [station]);
    
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching station stock:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// ดึงข้อมูลสต็อกที่ต่ำกว่าขั้นต่ำ
router.get('/low-stock', async (req, res) => {
  try {
    const result = await db.query(`
      SELECT * FROM stock_summary 
      WHERE available_stock <= min_stock_notify
      ORDER BY available_stock ASC, station, device_model
    `);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching low stock:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// อัปเดตระดับแจ้งเตือนสต็อก
router.put('/notify-level', async (req, res) => {
  const { station, deviceModel, minStockNotify } = req.body;
  
  if (!station || !deviceModel || minStockNotify === undefined) {
    return res.status(400).json({ error: 'Station, device model, and notify level are required' });
  }
  
  try {
    const result = await db.query(`
      UPDATE stock_summary 
      SET min_stock_notify = $1, last_updated = CURRENT_TIMESTAMP
      WHERE station = $2 AND device_model = $3
      RETURNING *
    `, [minStockNotify, station, deviceModel]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Stock record not found' });
    }
    
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error updating stock notify level:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// รีเฟรชข้อมูลสต็อก
router.post('/refresh', async (req, res) => {
  try {
    const { updateStockSummary } = require('../scripts/setup-database');
    await updateStockSummary(db);
    
    const result = await db.query(`
      SELECT * FROM stock_summary 
      ORDER BY station, device_model
    `);
    
    res.json({ 
      success: true, 
      message: 'Stock refreshed successfully',
      data: result.rows 
    });
  } catch (err) {
    console.error('Error refreshing stock:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

module.exports = router;