// models/Device.js
const db = require('../config/database');

class Device {
  // ดึงรายการอุปกรณ์ทดแทนทั้งหมด
  static async getAllReplacement(filters = {}) {
    try {
      let query = `
        SELECT rd.*, 
               s.name as station_name,
               v.name as vehicle_name
        FROM replacement_devices rd
        LEFT JOIN stations s ON rd.station = s.name
        LEFT JOIN vehicles v ON rd.vehicle_license = v.name
      `;
      
      const conditions = [];
      const params = [];
      
      if (filters.station) {
        conditions.push(`rd.station = $${params.length + 1}`);
        params.push(filters.station);
      }
      
      if (filters.device_type) {
        conditions.push(`rd.device_type = $${params.length + 1}`);
        params.push(filters.device_type);
      }
      
      if (filters.status) {
        conditions.push(`rd.status = $${params.length + 1}`);
        params.push(filters.status);
      }
      
      if (conditions.length > 0) {
        query += ` WHERE ${conditions.join(' AND ')}`;
      }
      
      query += ` ORDER BY rd.date_added DESC, rd.station, rd.device_type`;
      
      const result = await db.query(query, params);
      return result.rows;
    } catch (error) {
      throw new Error(`Error fetching replacement devices: ${error.message}`);
    }
  }

  // ดึงอุปกรณ์ทดแทนตาม ID
  static async getReplacementById(id) {
    try {
      const query = `
        SELECT rd.*, 
               s.name as station_name,
               v.name as vehicle_name
        FROM replacement_devices rd
        LEFT JOIN stations s ON rd.station = s.name
        LEFT JOIN vehicles v ON rd.vehicle_license = v.name
        WHERE rd.id = $1
      `;
      
      const result = await db.query(query, [id]);
      return result.rows[0] || null;
    } catch (error) {
      throw new Error(`Error fetching replacement device: ${error.message}`);
    }
  }

  // เพิ่มอุปกรณ์ทดแทนใหม่
  static async createReplacement(deviceData) {
    try {
      const {
        station,
        deviceType,
        deviceModel,
        deviceId,
        serialNumber,
        status = 'พร้อมใช้'
      } = deviceData;

      const query = `
        INSERT INTO replacement_devices 
        (date_added, station, device_type, device_model, device_id, serial_number, status)
        VALUES (CURRENT_DATE, $1, $2, $3, $4, $5, $6)
        RETURNING *
      `;

      const result = await db.query(query, [
        station, deviceType, deviceModel, deviceId, serialNumber, status
      ]);

      return result.rows[0];
    } catch (error) {
      throw new Error(`Error creating replacement device: ${error.message}`);
    }
  }

  // อัปเดตอุปกรณ์ทดแทน
  static async updateReplacement(id, updateData) {
    try {
      const {
        station,
        deviceType,
        deviceModel,
        deviceId,
        serialNumber,
        status,
        vehicleLicense,
        installationPosition
      } = updateData;

      let query = `
        UPDATE replacement_devices 
        SET station = $1, device_type = $2, device_model = $3, 
            device_id = $4, serial_number = $5, status = $6,
            updated_at = CURRENT_TIMESTAMP
      `;
      
      let params = [station, deviceType, deviceModel, deviceId, serialNumber, status];

      if (status === 'ใช้งานแล้ว') {
        query += `, date_used = CURRENT_DATE, vehicle_license = $7, installation_position = $8`;
        params.push(vehicleLicense, installationPosition);
      } else {
        query += `, date_used = NULL, vehicle_license = NULL, installation_position = NULL`;
      }

      query += ` WHERE id = $${params.length + 1} RETURNING *`;
      params.push(id);

      const result = await db.query(query, params);
      return result.rows[0];
    } catch (error) {
      throw new Error(`Error updating replacement device: ${error.message}`);
    }
  }

  // ลบอุปกรณ์ทดแทน
  static async deleteReplacement(id) {
    try {
      const query = `DELETE FROM replacement_devices WHERE id = $1 RETURNING *`;
      const result = await db.query(query, [id]);
      return result.rows[0];
    } catch (error) {
      throw new Error(`Error deleting replacement device: ${error.message}`);
    }
  }

  // ดึงอุปกรณ์ที่พร้อมใช้งาน
  static async getAvailableDevices(station, deviceType) {
    try {
      let query = `
        SELECT * FROM replacement_devices 
        WHERE status = 'พร้อมใช้'
      `;
      
      const params = [];
      
      if (station) {
        query += ` AND station = $${params.length + 1}`;
        params.push(station);
      }
      
      if (deviceType) {
        query += ` AND device_type = $${params.length + 1}`;
        params.push(deviceType);
      }
      
      query += ` ORDER BY date_added ASC`;
      
      const result = await db.query(query, params);
      return result.rows;
    } catch (error) {
      throw new Error(`Error fetching available devices: ${error.message}`);
    }
  }

  // ใช้อุปกรณ์ทดแทน
  static async useDevice(id, vehicleLicense, installationPosition) {
    try {
      const query = `
        UPDATE replacement_devices 
        SET status = 'ใช้งานแล้ว',
            date_used = CURRENT_DATE,
            vehicle_license = $1,
            installation_position = $2,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $3 AND status = 'พร้อมใช้'
        RETURNING *
      `;

      const result = await db.query(query, [vehicleLicense, installationPosition, id]);
      
      if (result.rows.length === 0) {
        throw new Error('Device not found or not available');
      }

      return result.rows[0];
    } catch (error) {
      throw new Error(`Error using device: ${error.message}`);
    }
  }

  // คืนอุปกรณ์ทดแทน
  static async returnDevice(id) {
    try {
      const query = `
        UPDATE replacement_devices 
        SET status = 'พร้อมใช้',
            date_used = NULL,
            vehicle_license = NULL,
            installation_position = NULL,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $1 AND status = 'ใช้งานแล้ว'
        RETURNING *
      `;

      const result = await db.query(query, [id]);
      
      if (result.rows.length === 0) {
        throw new Error('Device not found or not in use');
      }

      return result.rows[0];
    } catch (error) {
      throw new Error(`Error returning device: ${error.message}`);
    }
  }

  // ดึงสถิติอุปกรณ์
  static async getDeviceStats(station = null) {
    try {
      let query = `
        SELECT 
          COUNT(*) as total_devices,
          COUNT(CASE WHEN status = 'พร้อมใช้' THEN 1 END) as available_devices,
          COUNT(CASE WHEN status = 'ใช้งานแล้ว' THEN 1 END) as used_devices,
          COUNT(CASE WHEN status = 'ซ่อม' THEN 1 END) as repair_devices
        FROM replacement_devices
      `;

      const params = [];
      if (station) {
        query += ` WHERE station = $1`;
        params.push(station);
      }

      const result = await db.query(query, params);
      return result.rows[0];
    } catch (error) {
      throw new Error(`Error fetching device stats: ${error.message}`);
    }
  }
}

module.exports = Device;