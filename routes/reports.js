// routes/reports.js
const express = require('express');
const db = require('../config/database');
const moment = require('moment');
const router = express.Router();

// Authentication middleware
const requireAuth = (req, res, next) => {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  next();
};

router.use(requireAuth);

// รายงานอุปกรณ์ทดแทนรายวัน
router.get('/daily-replacement', async (req, res) => {
  const { date, station } = req.query;
  const targetDate = date || moment().format('YYYY-MM-DD');
  
  try {
    let query = `
      SELECT * FROM replacement_devices 
      WHERE date_used = $1
    `;
    let params = [targetDate];
    
    if (station) {
      query += ' AND station = $2';
      params.push(station);
    }
    
    query += ' ORDER BY station, device_type';
    
    const result = await db.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching daily replacement report:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// รายงานอุปกรณ์ทดแทนรายเดือน
router.get('/monthly-replacement', async (req, res) => {
  const { month, year, station } = req.query;
  const targetMonth = month || moment().format('MM');
  const targetYear = year || moment().format('YYYY');
  
  try {
    let query = `
      SELECT 
        station,
        device_type,
        device_model,
        COUNT(*) as usage_count,
        STRING_AGG(vehicle_license, ', ') as vehicles_used
      FROM replacement_devices 
      WHERE EXTRACT(MONTH FROM date_used) = $1 
      AND EXTRACT(YEAR FROM date_used) = $2
      AND date_used IS NOT NULL
    `;
    let params = [targetMonth, targetYear];
    
    if (station) {
      query += ' AND station = $3';
      params.push(station);
    }
    
    query += `
      GROUP BY station, device_type, device_model
      ORDER BY station, device_type, usage_count DESC
    `;
    
    const result = await db.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching monthly replacement report:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// รายงานเครื่องชำรุดรายวัน
router.get('/daily-damaged', async (req, res) => {
  const { date, station } = req.query;
  const targetDate = date || moment().format('YYYY-MM-DD');
  
  try {
    let query = `
      SELECT * FROM damaged_reports 
      WHERE report_date = $1
    `;
    let params = [targetDate];
    
    if (station) {
      query += ' AND station = $2';
      params.push(station);
    }
    
    query += ' ORDER BY station, device_type';
    
    const result = await db.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching daily damaged report:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// รายงานเครื่องชำรุดรายเดือน
router.get('/monthly-damaged', async (req, res) => {
  const { month, year, station } = req.query;
  const targetMonth = month || moment().format('MM');
  const targetYear = year || moment().format('YYYY');
  
  try {
    let query = `
      SELECT 
        station,
        device_type,
        COUNT(*) as damaged_count,
        STRING_AGG(DISTINCT vehicle_license, ', ') as affected_vehicles,
        STRING_AGG(DISTINCT issue_description, '; ') as common_issues
      FROM damaged_reports 
      WHERE EXTRACT(MONTH FROM report_date) = $1 
      AND EXTRACT(YEAR FROM report_date) = $2
    `;
    let params = [targetMonth, targetYear];
    
    if (station) {
      query += ' AND station = $3';
      params.push(station);
    }
    
    query += `
      GROUP BY station, device_type
      ORDER BY station, device_type, damaged_count DESC
    `;
    
    const result = await db.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching monthly damaged report:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// รายงานสถิติรวม
router.get('/statistics', async (req, res) => {
  const { station } = req.query;
  
  try {
    // สถิติอุปกรณ์ทดแทน
    let replacementQuery = `
      SELECT 
        COUNT(*) as total_devices,
        COUNT(CASE WHEN status = 'พร้อมใช้' THEN 1 END) as available_devices,
        COUNT(CASE WHEN status = 'ใช้งานแล้ว' THEN 1 END) as used_devices
      FROM replacement_devices
    `;
    let replacementParams = [];
    
    if (station) {
      replacementQuery += ' WHERE station = $1';
      replacementParams.push(station);
    }
    
    // สถิติเครื่องชำรุด
    let damagedQuery = `
      SELECT 
        COUNT(*) as total_reports,
        COUNT(CASE WHEN replacement_device_id IS NOT NULL THEN 1 END) as resolved_reports,
        COUNT(CASE WHEN replacement_device_id IS NULL THEN 1 END) as pending_reports
      FROM damaged_reports
    `;
    let damagedParams = [];
    
    if (station) {
      damagedQuery += ' WHERE station = $1';
      damagedParams.push(station);
    }
    
    const [replacementResult, damagedResult] = await Promise.all([
      db.query(replacementQuery, replacementParams),
      db.query(damagedQuery, damagedParams)
    ]);
    
    res.json({
      replacement: replacementResult.rows[0],
      damaged: damagedResult.rows[0]
    });
  } catch (err) {
    console.error('Error fetching statistics:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// รายงานการใช้งานตามช่วงเวลา
router.get('/usage-period', async (req, res) => {
  const { startDate, endDate, station } = req.query;
  
  if (!startDate || !endDate) {
    return res.status(400).json({ error: 'Start date and end date are required' });
  }
  
  try {
    let query = `
      SELECT 
        date_used,
        station,
        device_type,
        device_model,
        COUNT(*) as daily_usage,
        STRING_AGG(vehicle_license, ', ') as vehicles
      FROM replacement_devices 
      WHERE date_used BETWEEN $1 AND $2
      AND date_used IS NOT NULL
    `;
    let params = [startDate, endDate];
    
    if (station) {
      query += ' AND station = $3';
      params.push(station);
    }
    
    query += `
      GROUP BY date_used, station, device_type, device_model
      ORDER BY date_used DESC, station, device_type
    `;
    
    const result = await db.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching usage period report:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

module.exports = router;