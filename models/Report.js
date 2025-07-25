// models/Report.js
const db = require('../config/database');

class Report {
  // ดึงรายงานการใช้อุปกรณ์รายวัน
  static async getDailyUsage(date, station = null) {
    try {
      let query = `
        SELECT 
          rd.*,
          s.name as station_name,
          v.name as vehicle_name
        FROM replacement_devices rd
        LEFT JOIN stations s ON rd.station = s.name
        LEFT JOIN vehicles v ON rd.vehicle_license = v.name
        WHERE rd.date_used = $1
      `;
      
      const params = [date];
      
      if (station) {
        query += ` AND rd.station = $2`;
        params.push(station);
      }
      
      query += ` ORDER BY rd.station, rd.device_type`;
      
      const result = await db.query(query, params);
      return result.rows;
    } catch (error) {
      throw new Error(`Error fetching daily usage report: ${error.message}`);
    }
  }

  // ดึงรายงานการใช้อุปกรณ์รายเดือน
  static async getMonthlyUsage(year, month, station = null) {
    try {
      let query = `
        SELECT 
          station,
          device_type,
          device_model,
          COUNT(*) as usage_count,
          STRING_AGG(DISTINCT vehicle_license, ', ') as vehicles_used,
          STRING_AGG(DISTINCT TO_CHAR(date_used, 'DD/MM'), ', ') as usage_dates
        FROM replacement_devices 
        WHERE EXTRACT(YEAR FROM date_used) = $1 
        AND EXTRACT(MONTH FROM date_used) = $2
        AND date_used IS NOT NULL
      `;
      
      const params = [year, month];
      
      if (station) {
        query += ` AND station = $3`;
        params.push(station);
      }
      
      query += `
        GROUP BY station, device_type, device_model
        ORDER BY station, device_type, usage_count DESC
      `;
      
      const result = await db.query(query, params);
      return result.rows;
    } catch (error) {
      throw new Error(`Error fetching monthly usage report: ${error.message}`);
    }
  }

  // ดึงรายงานเครื่องชำรุดรายวัน
  static async getDailyDamaged(date, station = null) {
    try {
      let query = `
        SELECT * FROM damaged_reports 
        WHERE report_date = $1
      `;
      
      const params = [date];
      
      if (station) {
        query += ` AND station = $2`;
        params.push(station);
      }
      
      query += ` ORDER BY station, device_type`;
      
      const result = await db.query(query, params);
      return result.rows;
    } catch (error) {
      throw new Error(`Error fetching daily damaged report: ${error.message}`);
    }
  }

  // ดึงรายงานเครื่องชำรุดรายเดือน
  static async getMonthlyDamaged(year, month, station = null) {
    try {
      let query = `
        SELECT 
          station,
          device_type,
          COUNT(*) as damaged_count,
          STRING_AGG(DISTINCT vehicle_license, ', ') as affected_vehicles,
          STRING_AGG(DISTINCT issue_description, '; ') as common_issues,
          COUNT(CASE WHEN replacement_device_id IS NOT NULL THEN 1 END) as resolved_count,
          COUNT(CASE WHEN replacement_device_id IS NULL THEN 1 END) as pending_count
        FROM damaged_reports 
        WHERE EXTRACT(YEAR FROM report_date) = $1 
        AND EXTRACT(MONTH FROM report_date) = $2
      `;
      
      const params = [year, month];
      
      if (station) {
        query += ` AND station = $3`;
        params.push(station);
      }
      
      query += `
        GROUP BY station, device_type
        ORDER BY station, device_type, damaged_count DESC
      `;
      
      const result = await db.query(query, params);
      return result.rows;
    } catch (error) {
      throw new Error(`Error fetching monthly damaged report: ${error.message}`);
    }
  }

  // ดึงสถิติรวม
  static async getOverallStatistics(station = null) {
    try {
      const queries = [];
      const params = station ? [station] : [];
      
      // สถิติอุปกรณ์ทดแทน
      let replacementQuery = `
        SELECT 
          COUNT(*) as total_devices,
          COUNT(CASE WHEN status = 'พร้อมใช้' THEN 1 END) as available_devices,
          COUNT(CASE WHEN status = 'ใช้งานแล้ว' THEN 1 END) as used_devices,
          COUNT(CASE WHEN status = 'ซ่อม' THEN 1 END) as repair_devices
        FROM replacement_devices
      `;
      
      if (station) {
        replacementQuery += ` WHERE station = $1`;
      }
      
      // สถิติเครื่องชำรุด
      let damagedQuery = `
        SELECT 
          COUNT(*) as total_reports,
          COUNT(CASE WHEN replacement_device_id IS NOT NULL THEN 1 END) as resolved_reports,
          COUNT(CASE WHEN replacement_device_id IS NULL THEN 1 END) as pending_reports,
          COUNT(CASE WHEN report_date >= CURRENT_DATE - INTERVAL '30 days' THEN 1 END) as recent_reports
        FROM damaged_reports
      `;
      
      if (station) {
        damagedQuery += ` WHERE station = $1`;
      }
      
      const [replacementResult, damagedResult] = await Promise.all([
        db.query(replacementQuery, params),
        db.query(damagedQuery, params)
      ]);
      
      return {
        replacement: replacementResult.rows[0],
        damaged: damagedResult.rows[0]
      };
    } catch (error) {
      throw new Error(`Error fetching statistics: ${error.message}`);
    }
  }

  // ดึงรายงานการใช้งานตามช่วงเวลา
  static async getUsagePeriod(startDate, endDate, station = null) {
    try {
      let query = `
        SELECT 
          date_used,
          station,
          device_type,
          device_model,
          COUNT(*) as daily_usage,
          STRING_AGG(DISTINCT vehicle_license, ', ') as vehicles,
          STRING_AGG(DISTINCT device_id, ', ') as devices_used
        FROM replacement_devices 
        WHERE date_used BETWEEN $1 AND $2
        AND date_used IS NOT NULL
      `;
      
      const params = [startDate, endDate];
      
      if (station) {
        query += ` AND station = $3`;
        params.push(station);
      }
      
      query += `
        GROUP BY date_used, station, device_type, device_model
        ORDER BY date_used DESC, station, device_type
      `;
      
      const result = await db.query(query, params);
      return result.rows;
    } catch (error) {
      throw new Error(`Error fetching usage period report: ${error.message}`);
    }
  }

  // ดึงรายงานประสิทธิภาพการใช้งาน
  static async getEfficiencyReport(station = null) {
    try {
      let query = `
        SELECT 
          station,
          device_model,
          COUNT(*) as total_devices,
          COUNT(CASE WHEN status = 'ใช้งานแล้ว' THEN 1 END) as devices_in_use,
          COUNT(CASE WHEN status = 'พร้อมใช้' THEN 1 END) as devices_available,
          ROUND(
            (COUNT(CASE WHEN status = 'ใช้งานแล้ว' THEN 1 END) * 100.0 / COUNT(*)), 2
          ) as utilization_rate,
          AVG(
            CASE WHEN date_used IS NOT NULL 
            THEN EXTRACT(DAYS FROM (date_used - date_added))
            END
          ) as avg_days_to_use
        FROM replacement_devices
      `;
      
      const params = [];
      
      if (station) {
        query += ` WHERE station = $1`;
        params.push(station);
      }
      
      query += `
        GROUP BY station, device_model
        ORDER BY station, utilization_rate DESC
      `;
      
      const result = await db.query(query, params);
      return result.rows;
    } catch (error) {
      throw new Error(`Error fetching efficiency report: ${error.message}`);
    }
  }

  // ดึงรายงานแนวโน้มการใช้งาน
  static async getTrendReport(months = 6, station = null) {
    try {
      let query = `
        SELECT 
          TO_CHAR(date_used, 'YYYY-MM') as month,
          station,
          device_type,
          COUNT(*) as usage_count
        FROM replacement_devices 
        WHERE date_used >= CURRENT_DATE - INTERVAL '${months} months'
        AND date_used IS NOT NULL
      `;
      
      const params = [];
      
      if (station) {
        query += ` AND station = $1`;
        params.push(station);
      }
      
      query += `
        GROUP BY TO_CHAR(date_used, 'YYYY-MM'), station, device_type
        ORDER BY month DESC, station, device_type
      `;
      
      const result = await db.query(query, params);
      return result.rows;
    } catch (error) {
      throw new Error(`Error fetching trend report: ${error.message}`);
    }
  }

  // ดึงรายงานอุปกรณ์ที่ใช้บ่อยที่สุด
  static async getTopUsedDevices(limit = 10, station = null) {
    try {
      let query = `
        SELECT 
          station,
          device_type,
          device_model,
          COUNT(*) as usage_frequency,
          AVG(EXTRACT(DAYS FROM (CURRENT_DATE - date_used))) as avg_days_since_used,
          STRING_AGG(DISTINCT vehicle_license, ', ') as used_with_vehicles
        FROM replacement_devices 
        WHERE date_used IS NOT NULL
      `;
      
      const params = [];
      
      if (station) {
        query += ` AND station = $1`;
        params.push(station);
      }
      
      query += `
        GROUP BY station, device_type, device_model
        ORDER BY usage_frequency DESC
      `;
      
      if (limit) {
        query += ` LIMIT ${params.length + 1}`;
        params.push(limit);
      }
      
      const result = await db.query(query, params);
      return result.rows;
    } catch (error) {
      throw new Error(`Error fetching top used devices: ${error.message}`);
    }
  }

  // ดึงรายงานการแจ้งซ่อมที่ยังไม่ได้รับการแก้ไข
  static async getPendingRepairs(station = null) {
    try {
      let query = `
        SELECT 
          dr.*,
          EXTRACT(DAYS FROM (CURRENT_DATE - report_date)) as days_pending
        FROM damaged_reports dr
        WHERE replacement_device_id IS NULL
      `;
      
      const params = [];
      
      if (station) {
        query += ` AND station = $1`;
        params.push(station);
      }
      
      query += ` ORDER BY report_date ASC`;
      
      const result = await db.query(query, params);
      return result.rows;
    } catch (error) {
      throw new Error(`Error fetching pending repairs: ${error.message}`);
    }
  }

  // สร้างรายงานสำหรับ Export
  static async generateExportReport(type, filters = {}) {
    try {
      let query, params = [];
      
      switch (type) {
        case 'devices':
          query = `
            SELECT 
              rd.station as "อู่",
              rd.device_type as "ประเภท",
              rd.device_model as "รุ่น",
              rd.device_id as "Device ID",
              rd.serial_number as "S/N",
              rd.status as "สถานะ",
              TO_CHAR(rd.date_added, 'DD/MM/YYYY') as "วันที่เพิ่ม",
              TO_CHAR(rd.date_used, 'DD/MM/YYYY') as "วันที่ใช้",
              rd.vehicle_license as "ทะเบียน",
              rd.installation_position as "ตำแหน่ง"
            FROM replacement_devices rd
            ORDER BY rd.station, rd.device_type, rd.status
          `;
          break;
          
        case 'stock':
          query = `
            SELECT 
              station as "อู่",
              device_model as "รุ่น",
              total_stock as "ทั้งหมด",
              available_stock as "พร้อมใช้",
              used_stock as "ใช้แล้ว",
              min_stock_notify as "ระดับแจ้งเตือน",
              CASE 
                WHEN available_stock <= min_stock_notify THEN 'สต็อกต่ำ'
                ELSE 'สต็อกปกติ'
              END as "สถานะ",
              TO_CHAR(last_updated, 'DD/MM/YYYY HH24:MI') as "อัปเดตล่าสุด"
            FROM stock_summary
            ORDER BY station, device_model
          `;
          break;
          
        case 'damaged':
          query = `
            SELECT 
              TO_CHAR(report_date, 'DD/MM/YYYY') as "วันที่แจ้ง",
              vehicle_license as "ทะเบียน",
              station as "อู่",
              device_type as "ประเภท",
              damaged_device_id as "Device ID ชำรุด",
              issue_description as "รายละเอียดปัญหา",
              reporter_name as "ผู้แจ้ง",
              replacement_device_id as "Device ID ทดแทน",
              TO_CHAR(replacement_date, 'DD/MM/YYYY') as "วันที่เปลี่ยน",
              CASE 
                WHEN replacement_device_id IS NOT NULL THEN 'แก้ไขแล้ว'
                ELSE 'รอดำเนินการ'
              END as "สถานะ"
            FROM damaged_reports
            ORDER BY report_date DESC
          `;
          break;
          
        default:
          throw new Error('Invalid report type');
      }
      
      const result = await db.query(query, params);
      return result.rows;
    } catch (error) {
      throw new Error(`Error generating export report: ${error.message}`);
    }
  }

  // ดึงข้อมูลสำหรับ Dashboard Summary
  static async getDashboardSummary(station = null) {
    try {
      const queries = [];
      const params = station ? [station] : [];
      
      // รายการใช้งานวันนี้
      let todayUsageQuery = `
        SELECT COUNT(*) as today_usage
        FROM replacement_devices 
        WHERE date_used = CURRENT_DATE
      `;
      
      // รายการแจ้งซ่อมวันนี้
      let todayDamagedQuery = `
        SELECT COUNT(*) as today_damaged
        FROM damaged_reports 
        WHERE report_date = CURRENT_DATE
      `;
      
      // สต็อกต่ำ
      let lowStockQuery = `
        SELECT COUNT(*) as low_stock_count
        FROM stock_summary 
        WHERE available_stock <= min_stock_notify
      `;
      
      if (station) {
        todayUsageQuery += ` AND station = $1`;
        todayDamagedQuery += ` AND station = $1`;
        lowStockQuery += ` AND station = $1`;
      }
      
      const [usageResult, damagedResult, lowStockResult] = await Promise.all([
        db.query(todayUsageQuery, params),
        db.query(todayDamagedQuery, params),
        db.query(lowStockQuery, params)
      ]);
      
      return {
        todayUsage: usageResult.rows[0].today_usage,
        todayDamaged: damagedResult.rows[0].today_damaged,
        lowStockCount: lowStockResult.rows[0].low_stock_count
      };
    } catch (error) {
      throw new Error(`Error fetching dashboard summary: ${error.message}`);
    }
  }
}

module.exports = Report;