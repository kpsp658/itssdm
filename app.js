// app.js
const express = require('express');
const session = require('express-session');
const path = require('path');
const cors = require('cors');
const bodyParser = require('body-parser');
require('dotenv').config();

const authRoutes = require('./routes/auth');
const deviceRoutes = require('./routes/devices');
const stockRoutes = require('./routes/stock');
const reportRoutes = require('./routes/reports');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Session configuration
app.use(session({
  secret: process.env.SESSION_SECRET || 'itssdm-secret-key-2024',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false, // set to true in production with HTTPS
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/devices', deviceRoutes);
app.use('/api/stock', stockRoutes);
app.use('/api/reports', reportRoutes);

// Serve HTML files
app.get('/', (req, res) => {
  if (req.session.user) {
    res.sendFile(path.join(__dirname, 'views', 'dashboard.html'));
  } else {
    res.sendFile(path.join(__dirname, 'views', 'login.html'));
  }
});

app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'login.html'));
});

app.get('/dashboard', (req, res) => {
  if (!req.session.user) {
    return res.redirect('/login');
  }
  res.sendFile(path.join(__dirname, 'views', 'dashboard.html'));
});

app.get('/stock', (req, res) => {
  if (!req.session.user) {
    return res.redirect('/login');
  }
  res.sendFile(path.join(__dirname, 'views', 'stock.html'));
});

app.get('/devices', (req, res) => {
  if (!req.session.user) {
    return res.redirect('/login');
  }
  res.sendFile(path.join(__dirname, 'views', 'devices.html'));
});

app.get('/reports', (req, res) => {
  if (!req.session.user) {
    return res.redirect('/login');
  }
  res.sendFile(path.join(__dirname, 'views', 'reports.html'));
});

// API for frontend integration
app.get('/api/categories', (req, res) => {
  const categories = [
    { id: 1, name: 'Z90' },
    { id: 2, name: 'AVM' },
    { id: 3, name: 'E60' },
    { id: 4, name: 'MDVR-H310' },
    { id: 5, name: 'MDVR-E500' }
  ];
  res.json(categories);
});

app.get('/api/locations', (req, res) => {
  const db = require('./config/database');
  db.query('SELECT * FROM stations ORDER BY name', (err, result) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    res.json(result.rows);
  });
});

app.get('/api/vehicles', (req, res) => {
  const db = require('./config/database');
  db.query('SELECT * FROM vehicles ORDER BY name', (err, result) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }
    res.json(result.rows);
  });
});

// API สำหรับดึงอุปกรณ์ทดแทนที่ว่าง
app.get('/api/available-devices', (req, res) => {
  const { category, location } = req.query;
  
  if (!category || !location) {
    return res.status(400).json({ error: 'Category and location are required' });
  }
  
  const db = require('./config/database');
  
  // แปลง category เป็น device_type
  let deviceType = category;
  if (category.includes('MDVR')) {
    deviceType = 'MDVR';
  }
  
  const query = `
    SELECT * FROM replacement_devices 
    WHERE station = $1 
    AND device_type = $2 
    AND status = 'พร้อมใช้'
    ORDER BY date_added ASC
  `;
  
  db.query(query, [location, deviceType], (err, result) => {
    if (err) {
      console.error('Database error:', err);
      return res.status(500).json({ error: 'Database error' });
    }
    res.json(result.rows);
  });
});

// API สำหรับใช้อุปกรณ์ทดแทน
app.post('/api/use-device', (req, res) => {
  const { deviceId, vehicleLicense, installationPosition } = req.body;
  
  if (!deviceId || !vehicleLicense) {
    return res.status(400).json({ error: 'Device ID and vehicle license are required' });
  }
  
  const db = require('./config/database');
  
  const query = `
    UPDATE replacement_devices 
    SET status = 'ใช้งานแล้ว',
        date_used = CURRENT_DATE,
        vehicle_license = $1,
        installation_position = $2,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = $3
    RETURNING *
  `;
  
  db.query(query, [vehicleLicense, installationPosition, deviceId], (err, result) => {
    if (err) {
      console.error('Database error:', err);
      return res.status(500).json({ error: 'Database error' });
    }
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Device not found' });
    }
    
    // อัปเดตสต็อกสรุป
    const { updateStockSummary } = require('./scripts/setup-database');
    updateStockSummary(db).catch(console.error);
    
    res.json({ 
      success: true, 
      message: 'Device used successfully',
      device: result.rows[0]
    });
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.listen(PORT, () => {
  console.log(`🚀 ITS Device Management System is running on port ${PORT}`);
  console.log(`📱 Open your browser and go to: http://localhost:${PORT}`);
  console.log(`👤 Default login: admin / admin123`);
});