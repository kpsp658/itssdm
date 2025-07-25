// models/Stock.js
const db = require('../config/database');

class Stock {
  // ดึงข้อมูลสต็อกสรุปทั้งหมด
  static async getSummary(filters = {}) {
    try {
      let query = `
        SELECT * FROM stock_summary
      `;
      
      const conditions = [];
      const params = [];
      
      if (filters.station) {
        conditions.push(`station = $${params.length + 1}`);
        params.push(filters.station);
      }
      
      if (filters.device_model) {
        conditions.push(`device_model = $${params.length + 1}`);
        params.push(filters.device_model);
      }
      
      if (conditions.length > 0) {
        query += ` WHERE ${conditions.join(' AND ')}`;
      }
      
      query += ` ORDER BY station, device_model`;
      
      const result = await db.query(query, params);
      return result.rows;
    } catch (error) {
      throw new Error(`Error fetching stock summary: ${error.message}`);
    }
  }

  // ดึงสต็อกตามอู่
  static async getByStation(station) {
    try {
      const query = `
        SELECT 
          device_model,
          COUNT(*) as total_stock,
          COUNT(CASE WHEN status = 'ใช้งานแล้ว' THEN 1 END) as used_stock,
          COUNT(CASE WHEN status = 'พร้อมใช้' THEN 1 END) as available_stock
        FROM replacement_devices 
        WHERE station = $1
        GROUP BY device_model
        ORDER BY device_model
      `;
      
      const result = await db.query(query, [station]);
      return result.rows;
    } catch (error) {
      throw new Error(`Error fetching station stock: ${error.message}`);
    }
  }

  // ดึงสต็อกที่ต่ำกว่าขั้นต่ำ
  static async getLowStock() {
    try {
      const query = `
        SELECT * FROM stock_summary 
        WHERE available_stock <= min_stock_notify
        ORDER BY available_stock ASC, station, device_model
      `;
      
      const result = await db.query(query);
      return result.rows;
    } catch (error) {
      throw new Error(`Error fetching low stock: ${error.message}`);
    }
  }

  // อัปเดตระดับแจ้งเตือนสต็อก
  static async updateNotifyLevel(station, deviceModel, minStockNotify) {
    try {
      const query = `
        UPDATE stock_summary 
        SET min_stock_notify = $1, last_updated = CURRENT_TIMESTAMP
        WHERE station = $2 AND device_model = $3
        RETURNING *
      `;
      
      const result = await db.query(query, [minStockNotify, station, deviceModel]);
      
      if (result.rows.length === 0) {
        throw new Error('Stock record not found');
      }
      
      return result.rows[0];
    } catch (error) {
      throw new Error(`Error updating notify level: ${error.message}`);
    }
  }

  // รีเฟรชข้อมูลสต็อกสรุป
  static async refreshSummary() {
    try {
      // ลบข้อมูลเก่า
      await db.query('DELETE FROM stock_summary');
      
      // สร้างข้อมูลใหม่
      const query = `
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
        RETURNING *
      `;
      
      const result = await db.query(query);
      return result.rows;
    } catch (error) {
      throw new Error(`Error refreshing stock summary: ${error.message}`);
    }
  }

  // ดึงสถิติสต็อกทั้งหมด
  static async getOverallStats() {
    try {
      const query = `
        SELECT 
          COUNT(DISTINCT station) as total_stations,
          COUNT(DISTINCT device_model) as total_models,
          SUM(total_stock) as overall_total,
          SUM(available_stock) as overall_available,
          SUM(used_stock) as overall_used,
          COUNT(CASE WHEN available_stock <= min_stock_notify THEN 1 END) as low_stock_items
        FROM stock_summary
      `;
      
      const result = await db.query(query);
      return result.rows[0];
    } catch (error) {
      throw new Error(`Error fetching overall stats: ${error.message}`);
    }
  }

  // ดึงประวัติการเปลี่ยนแปลงสต็อก
  static async getStockHistory(station = null, deviceModel = null, limit = 50) {
    try {
      let query = `
        SELECT 
          rd.id,
          rd.station,
          rd.device_model,
          rd.device_id,
          rd.status,
          rd.date_added,
          rd.date_used,
          rd.vehicle_license,
          rd.updated_at,
          CASE 
            WHEN rd.date_used IS NOT NULL THEN 'used'
            WHEN rd.created_at = rd.updated_at THEN 'added'
            ELSE 'updated'
          END as action_type
        FROM replacement_devices rd
      `;
      
      const conditions = [];
      const params = [];
      
      if (station) {
        conditions.push(`rd.station = $${params.length + 1}`);
        params.push(station);
      }
      
      if (deviceModel) {
        conditions.push(`rd.device_model = $${params.length + 1}`);
        params.push(deviceModel);
      }
      
      if (conditions.length > 0) {
        query += ` WHERE ${conditions.join(' AND ')}`;
      }
      
      query += ` ORDER BY rd.updated_at DESC`;
      
      if (limit) {
        query += ` LIMIT $${params.length + 1}`;
        params.push(limit);
      }
      
      const result = await db.query(query, params);
      return result.rows;
    } catch (error) {
      throw new Error(`Error fetching stock history: ${error.message}`);
    }
  }

  // ตรวจสอบสต็อกที่ต้องแจ้งเตือน
  static async checkNotifications() {
    try {
      const query = `
        SELECT 
          station,
          device_model,
          available_stock,
          min_stock_notify,
          (min_stock_notify - available_stock) as shortage
        FROM stock_summary 
        WHERE available_stock <= min_stock_notify
        ORDER BY shortage DESC, station, device_model
      `;
      
      const result = await db.query(query);
      return result.rows;
    } catch (error) {
      throw new Error(`Error checking notifications: ${error.message}`);
    }
  }

  // สร้างรายงานสต็อกสำหรับ Export
  static async generateStockReport(format = 'summary') {
    try {
      let query;
      
      if (format === 'detailed') {
        query = `
          SELECT 
            rd.station,
            rd.device_type,
            rd.device_model,
            rd.device_id,
            rd.serial_number,
            rd.status,
            rd.date_added,
            rd.date_used,
            rd.vehicle_license,
            rd.installation_position
          FROM replacement_devices rd
          ORDER BY rd.station, rd.device_model, rd.status, rd.date_added
        `;
      } else {
        query = `
          SELECT 
            station,
            device_model,
            total_stock,
            available_stock,
            used_stock,
            min_stock_notify,
            CASE 
              WHEN available_stock <= min_stock_notify THEN 'สต็อกต่ำ'
              ELSE 'สต็อกปกติ'
            END as status,
            last_updated
          FROM stock_summary
          ORDER BY station, device_model
        `;
      }
      
      const result = await db.query(query);
      return result.rows;
    } catch (error) {
      throw new Error(`Error generating stock report: ${error.message}`);
    }
  }
}

module.exports = Stock;