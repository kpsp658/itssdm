// scripts/setup-database.js
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const pool = new Pool({
  user: 'itssdm',
  host: '10.10.10.107',
  database: 'itssdm_db',
  password: 'Its@pg01',
  port: 5432,
});

async function setupDatabase() {
  const client = await pool.connect();
  
  try {
    console.log('🚀 Starting database setup...');
    
    // สร้างตารางผู้ใช้งาน
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        role VARCHAR(20) DEFAULT 'admin',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // สร้างตารางสถานที่/อู่
    await client.query(`
      CREATE TABLE IF NOT EXISTS stations (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        glpi_id INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // สร้างตารางทะเบียนรถ
    await client.query(`
      CREATE TABLE IF NOT EXISTS vehicles (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        glpi_id INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // สร้างตารางตำแหน่งการติดตั้ง
    await client.query(`
      CREATE TABLE IF NOT EXISTS installation_positions (
        id SERIAL PRIMARY KEY,
        name VARCHAR(50) NOT NULL,
        device_type VARCHAR(20) DEFAULT 'E60',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // สร้างตารางอุปกรณ์ทดแทน
    await client.query(`
      CREATE TABLE IF NOT EXISTS replacement_devices (
        id SERIAL PRIMARY KEY,
        date_added DATE NOT NULL,
        station VARCHAR(100) NOT NULL,
        device_type VARCHAR(20) NOT NULL,
        device_model VARCHAR(50) NOT NULL,
        device_id VARCHAR(100) NOT NULL,
        serial_number VARCHAR(200) NOT NULL,
        status VARCHAR(20) DEFAULT 'พร้อมใช้',
        date_used DATE,
        vehicle_license VARCHAR(50),
        installation_position VARCHAR(50),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // สร้างตารางรายการแจ้งเครื่องชำรุด
    await client.query(`
      CREATE TABLE IF NOT EXISTS damaged_reports (
        id SERIAL PRIMARY KEY,
        report_date DATE NOT NULL,
        vehicle_license VARCHAR(50) NOT NULL,
        station VARCHAR(100) NOT NULL,
        device_type VARCHAR(20) NOT NULL,
        damaged_device_id VARCHAR(100) NOT NULL,
        damaged_serial_number VARCHAR(200),
        issue_description TEXT NOT NULL,
        reporter_name VARCHAR(100) NOT NULL,
        user_info TEXT,
        replacement_device_id VARCHAR(100),
        replacement_serial_number VARCHAR(200),
        replacement_date DATE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // สร้างตารางสต็อก (สำหรับแสดงสต็อกแต่ละอู่)
    await client.query(`
      CREATE TABLE IF NOT EXISTS stock_summary (
        id SERIAL PRIMARY KEY,
        station VARCHAR(100) NOT NULL,
        device_model VARCHAR(50) NOT NULL,
        total_stock INTEGER DEFAULT 0,
        used_stock INTEGER DEFAULT 0,
        available_stock INTEGER DEFAULT 0,
        min_stock_notify INTEGER DEFAULT 2,
        last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(station, device_model)
      )
    `);

    // เพิ่มข้อมูลเริ่มต้น
    console.log('📝 Adding initial data...');

    // เพิ่มผู้ใช้งาน admin
    const hashedPassword = await bcrypt.hash('admin123', 10);
    await client.query(`
      INSERT INTO users (username, password, role) 
      VALUES ('admin', $1, 'admin') 
      ON CONFLICT (username) DO NOTHING
    `, [hashedPassword]);

    // เพิ่มตำแหน่งการติดตั้ง
    await client.query(`
      INSERT INTO installation_positions (id, name, device_type) 
      VALUES 
        (1, 'หน้า', 'E60'),
        (2, 'หลัง', 'E60')
      ON CONFLICT (id) DO NOTHING
    `);

    // เพิ่มข้อมูลตัวอย่างสถานที่
    const sampleStations = ['บึงกุ่ม', 'ตลิ่งชัน', 'เคหะธน', 'เอกชัย'];
    for (const station of sampleStations) {
      await client.query(`
        INSERT INTO stations (name) VALUES ($1) ON CONFLICT DO NOTHING
      `, [station]);
    }

    // เพิ่มข้อมูลตัวอย่างทะเบียนรถ
    const sampleVehicles = ['16-6497', '16-6377', '16-7673'];
    for (const vehicle of sampleVehicles) {
      await client.query(`
        INSERT INTO vehicles (name) VALUES ($1) ON CONFLICT DO NOTHING
      `, [vehicle]);
    }

    // เพิ่มข้อมูลตัวอย่างอุปกรณ์ทดแทน (ตามข้อมูลใน Excel)
    const sampleDevices = [
      {
        date_added: '2025-07-20',
        station: 'บึงกุ่ม',
        device_type: 'Z90',
        device_model: 'Z90',
        device_id: '10214003',
        serial_number: '0200122050188208',
        status: 'พร้อมใช้'
      },
      {
        date_added: '2025-07-20',
        station: 'ตลิ่งชัน',
        device_type: 'AVM',
        device_model: 'AVM',
        device_id: '20002444',
        serial_number: 'L2303004612006114',
        status: 'พร้อมใช้'
      },
      {
        date_added: '2025-07-20',
        station: 'บึงกุ่ม',
        device_type: 'MDVR',
        device_model: 'E500',
        device_id: 'E500',
        serial_number: 'LEC2C103BNLCC07003300184',
        status: 'พร้อมใช้'
      },
      {
        date_added: '2025-07-20',
        station: 'เคหะธน',
        device_type: 'E60',
        device_model: 'E60',
        device_id: 'L2207003416025464',
        serial_number: 'L2207003416025464',
        status: 'ใช้งานแล้ว',
        date_used: '2025-07-22',
        vehicle_license: '16-6497',
        installation_position: 'หน้า'
      },
      {
        date_added: '2025-07-20',
        station: 'เอกชัย',
        device_type: 'MDVR',
        device_model: 'H310',
        device_id: 'L363B100BNLCC11010100089',
        serial_number: 'L363B100BNLCC11010100089',
        status: 'ใช้งานแล้ว',
        date_used: '2025-07-23',
        vehicle_license: '16-6377'
      }
    ];

    for (const device of sampleDevices) {
      await client.query(`
        INSERT INTO replacement_devices 
        (date_added, station, device_type, device_model, device_id, serial_number, status, date_used, vehicle_license, installation_position)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        ON CONFLICT DO NOTHING
      `, [
        device.date_added, device.station, device.device_type, device.device_model,
        device.device_id, device.serial_number, device.status, device.date_used || null,
        device.vehicle_license || null, device.installation_position || null
      ]);
    }

    // เพิ่มข้อมูลตัวอย่างรายงานเครื่องชำรุด
    await client.query(`
      INSERT INTO damaged_reports 
      (report_date, vehicle_license, station, device_type, damaged_device_id, damaged_serial_number, issue_description, reporter_name, user_info, replacement_device_id, replacement_serial_number, replacement_date)
      VALUES 
      ('2025-07-20', '16-7673', 'บึงกุ่ม', 'Z90', '10209603', '0200122050188208', 'ชิพหาย การช่าง', 'พิมพ์ไม่ออก', '10110022 ชิพหาย การช่าง', 'ID อุปกรณ์ทดแทน', 'S/N อุปกรณ์ทดแทน', '2025-07-20')
      ON CONFLICT DO NOTHING
    `);

    // อัปเดตสต็อกสรุป
    await updateStockSummary(client);

    console.log('✅ Database setup completed successfully!');
    console.log('👤 Default admin user created: admin / admin123');
    
  } catch (err) {
    console.error('❌ Error setting up database:', err);
    throw err;
  } finally {
    client.release();
  }
}

async function updateStockSummary(client) {
  console.log('📊 Updating stock summary...');
  
  await client.query(`
    INSERT INTO stock_summary (station, device_model, total_stock, used_stock, available_stock, min_stock_notify)
    SELECT 
      station,
      device_model,
      COUNT(*) as total_stock,
      COUNT(CASE WHEN status = 'ใช้งานแล้ว' THEN 1 END) as used_stock,
      COUNT(CASE WHEN status = 'พร้อมใช้' THEN 1 END) as available_stock,
      CASE 
        WHEN device_model IN ('H310') THEN 1
        WHEN device_model IN ('E500') THEN 1
        ELSE 2
      END as min_stock_notify
    FROM replacement_devices
    GROUP BY station, device_model
    ON CONFLICT (station, device_model) 
    DO UPDATE SET
      total_stock = EXCLUDED.total_stock,
      used_stock = EXCLUDED.used_stock,
      available_stock = EXCLUDED.available_stock,
      last_updated = CURRENT_TIMESTAMP
  `);
}

// เรียกใช้งาน
if (require.main === module) {
  setupDatabase()
    .then(() => {
      console.log('🎉 Setup completed! You can now run: npm start');
      process.exit(0);
    })
    .catch((err) => {
      console.error('💥 Setup failed:', err);
      process.exit(1);
    });
}

module.exports = { setupDatabase, updateStockSummary };