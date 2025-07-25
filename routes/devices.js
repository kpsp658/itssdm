// routes/devices.js
const express = require('express');
const db = require('../config/database');
const { updateStockSummary } = require('../scripts/setup-database');
const router = express.Router();

// Authentication middleware
const requireAuth = (req, res, next) => {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  next();
};

router.use(requireAuth);

// ดึงรายการอุปกรณ์ทดแทนทั้งหมด
router.get('/replacement', async (req, res) => {
  try {
    const result = await db.query(`
      SELECT * FROM replacement_devices 
      ORDER BY date_added DESC, station, device_type
    `);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching replacement devices:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// เพิ่มอุปกรณ์ทดแทนใหม่
router.post('/replacement', async (req, res) => {
  const {
    station,
    deviceType,
    deviceModel,
    deviceId,
    serialNumber
  } = req.body;
  
  if (!station || !deviceType || !deviceModel || !deviceId || !serialNumber) {
    return res.status(400).json({ error: 'All fields are required' });
  }
  
  try {
    const result = await db.query(`
      INSERT INTO replacement_devices 
      (date_added, station, device_type, device_model, device_id, serial_number, status)
      VALUES (CURRENT_DATE, $1, $2, $3, $4, $5, 'พร้อมใช้')
      RETURNING *
    `, [station, deviceType, deviceModel, deviceId, serialNumber]);
    
    // อัปเดตสต็อกสรุป
    await updateStockSummary(db);
    
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error adding replacement device:', err);
    if (err.code === '23505') { // Duplicate key error
      res.status(409).json({ error: 'Device ID already exists' });
    } else {
      res.status(500).json({ error: 'Database error' });
    }
  }
});

// อัปเดตสถานะอุปกรณ์ทดแทน
router.put('/replacement/:id', async (req, res) => {
  const { id } = req.params;
  const {
    status,
    vehicleLicense,
    installationPosition
  } = req.body;
  
  try {
    let query, params;
    
    if (status === 'ใช้งานแล้ว') {
      query = `
        UPDATE replacement_devices 
        SET status = $1, date_used = CURRENT_DATE, vehicle_license = $2, 
            installation_position = $3, updated_at = CURRENT_TIMESTAMP
        WHERE id = $4 RETURNING *
      `;
      params = [status, vehicleLicense, installationPosition, id];
    } else {
      query = `
        UPDATE replacement_devices 
        SET status = $1, date_used = NULL, vehicle_license = NULL, 
            installation_position = NULL, updated_at = CURRENT_TIMESTAMP
        WHERE id = $2 RETURNING *
      `;
      params = [status, id];
    }
    
    const result = await db.query(query, params);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Device not found' });
    }
    
    // อัปเดตสต็อกสรุป
    await updateStockSummary(db);
    
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error updating replacement device:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// ลบอุปกรณ์ทดแทน
router.delete('/replacement/:id', async (req, res) => {
  const { id } = req.params;
  
  try {
    const result = await db.query(
      'DELETE FROM replacement_devices WHERE id = $1 RETURNING *',
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Device not found' });
    }
    
    // อัปเดตสต็อกสรุป
    await updateStockSummary(db);
    
    res.json({ success: true, message: 'Device deleted successfully' });
  } catch (err) {
    console.error('Error deleting replacement device:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// ดึงรายการแจ้งเครื่องชำรุด
router.get('/damaged', async (req, res) => {
  try {
    const result = await db.query(`
      SELECT * FROM damaged_reports 
      ORDER BY report_date DESC, id DESC
    `);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching damaged reports:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// เพิ่มรายงานเครื่องชำรุด
router.post('/damaged', async (req, res) => {
  const {
    vehicleLicense,
    station,
    deviceType,
    damagedDeviceId,
    damagedSerialNumber,
    issueDescription,
    reporterName,
    userInfo,
    replacementDeviceId,
    replacementSerialNumber
  } = req.body;
  
  if (!vehicleLicense || !station || !deviceType || !damagedDeviceId || !issueDescription || !reporterName) {
    return res.status(400).json({ error: 'Required fields are missing' });
  }
  
  try {
    const result = await db.query(`
      INSERT INTO damaged_reports 
      (report_date, vehicle_license, station, device_type, damaged_device_id, 
       damaged_serial_number, issue_description, reporter_name, user_info, 
       replacement_device_id, replacement_serial_number, replacement_date)
      VALUES (CURRENT_DATE, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 
              CASE WHEN $9 IS NOT NULL THEN CURRENT_DATE ELSE NULL END)
      RETURNING *
    `, [
      vehicleLicense, station, deviceType, damagedDeviceId, damagedSerialNumber,
      issueDescription, reporterName, userInfo, replacementDeviceId, replacementSerialNumber
    ]);
    
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error adding damaged report:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// อัปเดตรายงานเครื่องชำรุด
router.put('/damaged/:id', async (req, res) => {
  const { id } = req.params;
  const {
    replacementDeviceId,
    replacementSerialNumber
  } = req.body;
  
  try {
    const result = await db.query(`
      UPDATE damaged_reports 
      SET replacement_device_id = $1, replacement_serial_number = $2, 
          replacement_date = CURRENT_DATE, updated_at = CURRENT_TIMESTAMP
      WHERE id = $3 RETURNING *
    `, [replacementDeviceId, replacementSerialNumber, id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Report not found' });
    }
    
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error updating damaged report:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

module.exports = router;