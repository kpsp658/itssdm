// controllers/reportController.js
const db = require('../config/database');

class ReportController {
    // รายงานการใช้งานรายวัน
    static async getDailyReplacementReport(req, res) {
        try {
            const { date, station } = req.query;
            
            if (!date) {
                return res.status(400).json({
                    success: false,
                    error: 'กรุณาระบุวันที่'
                });
            }

            let query = `
                SELECT 
                    station,
                    device_type,
                    device_model,
                    device_id,
                    vehicle_license,
                    installation_position,
                    date_used
                FROM replacement_devices
                WHERE date_used = $1
            `;

            const queryParams = [date];
            let paramCount = 1;

            if (station) {
                queryParams.push(station);
                query += ` AND station = $${++paramCount}`;
            }

            query += ` ORDER BY station, device_type, device_id`;

            const result = await db.query(query, queryParams);

            res.json({
                success: true,
                report_date: date,
                station: station || 'ทุกอู่',
                total_usage: result.rows.length,
                data: result.rows
            });

        } catch (error) {
            console.error('Get daily replacement report error:', error);
            res.status(500).json({
                success: false,
                error: 'เกิดข้อผิดพลาดในการสร้างรายงานรายวัน'
            });
        }
    }

    // รายงานการใช้งานรายเดือน
    static async getMonthlyReplacementReport(req, res) {
        try {
            const { year, month, station } = req.query;
            
            if (!year || !month) {
                return res.status(400).json({
                    success: false,
                    error: 'กรุณาระบุปีและเดือน'
                });
            }

            let query = `
                SELECT 
                    station,
                    device_type,
                    device_model,
                    COUNT(*) as usage_count,
                    STRING_AGG(DISTINCT vehicle_license, ', ') as vehicles_used,
                    MIN(date_used) as first_usage,
                    MAX(date_used) as last_usage
                FROM replacement_devices
                WHERE EXTRACT(YEAR FROM date_used) = $1 
                  AND EXTRACT(MONTH FROM date_used) = $2
                  AND date_used IS NOT NULL
            `;

            const queryParams = [parseInt(year), parseInt(month)];
            let paramCount = 2;

            if (station) {
                queryParams.push(station);
                query += ` AND station = $${++paramCount}`;
            }

            query += `
                GROUP BY station, device_type, device_model
                ORDER BY station, device_type, usage_count DESC
            `;

            const result = await db.query(query, queryParams);

            // คำนวณสถิติรวม
            const totalUsage = result.rows.reduce((sum, row) => sum + parseInt(row.usage_count), 0);
            const stationsCount = new Set(result.rows.map(row => row.station)).size;
            const deviceTypesCount = new Set(result.rows.map(row => row.device_type)).size;

            res.json({
                success: true,
                report_period: `${month}/${year}`,
                station: station || 'ทุกอู่',
                summary: {
                    total_usage: totalUsage,
                    stations_count: stationsCount,
                    device_types_count: deviceTypesCount,
                    categories_count: result.rows.length
                },
                data: result.rows
            });

        } catch (error) {
            console.error('Get monthly replacement report error:', error);
            res.status(500).json({
                success: false,
                error: 'เกิดข้อผิดพลาดในการสร้างรายงานรายเดือน'
            });
        }
    }

    // รายงานเครื่องชำรุดรายวัน
    static async getDailyDamagedReport(req, res) {
        try {
            const { date, station } = req.query;
            
            if (!date) {
                return res.status(400).json({
                    success: false,
                    error: 'กรุณาระบุวันที่'
                });
            }

            let query = `
                SELECT 
                    vehicle_license,
                    station,
                    device_type,
                    damaged_device_id,
                    damaged_serial_number,
                    issue_description,
                    reporter_name,
                    user_info,
                    replacement_device_id,
                    replacement_serial_number,
                    replacement_date
                FROM damaged_reports
                WHERE report_date = $1
            `;

            const queryParams = [date];
            let paramCount = 1;

            if (station) {
                queryParams.push(station);
                query += ` AND station = $${++paramCount}`;
            }

            query += ` ORDER BY id DESC`;

            const result = await db.query(query, queryParams);

            // คำนวณสถิติ
            const totalReports = result.rows.length;
            const resolvedReports = result.rows.filter(row => row.replacement_device_id).length;
            const pendingReports = totalReports - resolvedReports;

            res.json({
                success: true,
                report_date: date,
                station: station || 'ทุกอู่',
                summary: {
                    total_reports: totalReports,
                    resolved_reports: resolvedReports,
                    pending_reports: pendingReports,
                    resolution_rate: totalReports > 0 ? ((resolvedReports / totalReports) * 100).toFixed(2) : 0
                },
                data: result.rows
            });

        } catch (error) {
            console.error('Get daily damaged report error:', error);
            res.status(500).json({
                success: false,
                error: 'เกิดข้อผิดพลาดในการสร้างรายงานเครื่องชำรุดรายวัน'
            });
        }
    }

    // รายงานประสิทธิภาพ
    static async getEfficiencyReport(req, res) {
        try {
            const { station } = req.query;

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
                        CASE 
                            WHEN date_used IS NOT NULL 
                            THEN EXTRACT(DAYS FROM (date_used - date_added))
                            ELSE NULL
                        END
                    ) as avg_days_to_use
                FROM replacement_devices
            `;

            const queryParams = [];
            let paramCount = 0;

            if (station) {
                queryParams.push(station);
                query += ` WHERE station = $${++paramCount}`;
            }

            query += `
                GROUP BY station, device_model
                ORDER BY station, utilization_rate DESC
            `;

            const result = await db.query(query, queryParams);

            // คำนวณสถิติรวม
            const totalDevices = result.rows.reduce((sum, row) => sum + parseInt(row.total_devices), 0);
            const totalInUse = result.rows.reduce((sum, row) => sum + parseInt(row.devices_in_use), 0);
            const overallUtilization = totalDevices > 0 ? ((totalInUse / totalDevices) * 100).toFixed(2) : 0;

            res.json({
                success: true,
                station: station || 'ทุกอู่',
                summary: {
                    total_devices: totalDevices,
                    total_in_use: totalInUse,
                    overall_utilization: overallUtilization,
                    categories_analyzed: result.rows.length
                },
                data: result.rows
            });

        } catch (error) {
            console.error('Get efficiency report error:', error);
            res.status(500).json({
                success: false,
                error: 'เกิดข้อผิดพลาดในการสร้างรายงานประสิทธิภาพ'
            });
        }
    }

    // สถิติรวม
    static async getStatistics(req, res) {
        try {
            const { station } = req.query;

            // สถิติอุปกรณ์ทดแทน
            let replacementQuery = `
                SELECT 
                    COUNT(*) as total_devices,
                    COUNT(CASE WHEN status = 'พร้อมใช้' THEN 1 END) as available_devices,
                    COUNT(CASE WHEN status = 'ใช้งานแล้ว' THEN 1 END) as used_devices,
                    COUNT(CASE WHEN status = 'ซ่อม' THEN 1 END) as repair_devices
                FROM replacement_devices
            `;

            // สถิติรายงานเครื่องชำรุด
            let damagedQuery = `
                SELECT 
                    COUNT(*) as total_reports,
                    COUNT(CASE WHEN replacement_device_id IS NOT NULL THEN 1 END) as resolved_reports,
                    COUNT(CASE WHEN replacement_device_id IS NULL THEN 1 END) as pending_reports
                FROM damaged_reports
            `;

            const queryParams = [];
            let paramCount = 0;

            if (station) {
                queryParams.push(station);
                replacementQuery += ` WHERE station = $${++paramCount}`;
                damagedQuery += ` WHERE station = $${paramCount}`;
            }

            const [replacementResult, damagedResult] = await Promise.all([
                db.query(replacementQuery, queryParams),
                db.query(damagedQuery, queryParams)
            ]);

            // สถิติการใช้งานรายเดือน (6 เดือนย้อนหลัง)
            let monthlyQuery = `
                SELECT 
                    TO_CHAR(date_used, 'YYYY-MM') as month,
                    COUNT(*) as usage_count
                FROM replacement_devices
                WHERE date_used >= CURRENT_DATE - INTERVAL '6 months'
                  AND date_used IS NOT NULL
            `;

            if (station) {
                monthlyQuery += ` AND station = $1`;
            }

            monthlyQuery += `
                GROUP BY TO_CHAR(date_used, 'YYYY-MM')
                ORDER BY month DESC
            `;

            const monthlyResult = await db.query(
                monthlyQuery, 
                station ? [station] : []
            );

            // สถิติตามประเภทอุปกรณ์
            let typeQuery = `
                SELECT 
                    device_type,
                    COUNT(*) as total,
                    COUNT(CASE WHEN status = 'พร้อมใช้' THEN 1 END) as available,
                    COUNT(CASE WHEN status = 'ใช้งานแล้ว' THEN 1 END) as used
                FROM replacement_devices
            `;

            if (station) {
                typeQuery += ` WHERE station = $1`;
            }

            typeQuery += `
                GROUP BY device_type
                ORDER BY total DESC
            `;

            const typeResult = await db.query(
                typeQuery,
                station ? [station] : []
            );

            res.json({
                success: true,
                station: station || 'ทุกอู่',
                generated_at: new Date().toISOString(),
                replacement: replacementResult.rows[0],
                damaged: damagedResult.rows[0],
                monthly_usage: monthlyResult.rows,
                by_device_type: typeResult.rows
            });

        } catch (error) {
            console.error('Get statistics error:', error);
            res.status(500).json({
                success: false,
                error: 'เกิดข้อผิดพลาดในการสร้างสถิติรวม'
            });
        }
    }

    // รายงานแนวโน้มการใช้งาน
    static async getTrendReport(req, res) {
        try {
            const { months = 6, station } = req.query;
            const monthsInt = parseInt(months);

            let query = `
                SELECT 
                    TO_CHAR(date_used, 'YYYY-MM') as month,
                    station,
                    device_type,
                    COUNT(*) as usage_count
                FROM replacement_devices
                WHERE date_used >= CURRENT_DATE - INTERVAL '${monthsInt} months'
                  AND date_used IS NOT NULL
            `;

            const queryParams = [];
            let paramCount = 0;

            if (station) {
                queryParams.push(station);
                query += ` AND station = ${++paramCount}`;
            }

            query += `
                GROUP BY TO_CHAR(date_used, 'YYYY-MM'), station, device_type
                ORDER BY month DESC, station, device_type
            `;

            const result = await db.query(query, queryParams);

            // วิเคราะห์แนวโน้ม
            const monthlyTotals = {};
            const stationTrends = {};
            const deviceTypeTrends = {};

            result.rows.forEach(row => {
                const month = row.month;
                const usage = parseInt(row.usage_count);

                // รวมรายเดือน
                monthlyTotals[month] = (monthlyTotals[month] || 0) + usage;

                // แนวโน้มตามอู่
                if (!stationTrends[row.station]) stationTrends[row.station] = {};
                stationTrends[row.station][month] = (stationTrends[row.station][month] || 0) + usage;

                // แนวโน้มตามประเภท
                if (!deviceTypeTrends[row.device_type]) deviceTypeTrends[row.device_type] = {};
                deviceTypeTrends[row.device_type][month] = (deviceTypeTrends[row.device_type][month] || 0) + usage;
            });

            // คำนวณการเปลี่ยนแปลง
            const monthsArray = Object.keys(monthlyTotals).sort();
            let overallTrend = 'stable';
            
            if (monthsArray.length >= 2) {
                const recent = monthlyTotals[monthsArray[0]];
                const previous = monthlyTotals[monthsArray[1]];
                const changePercent = previous > 0 ? ((recent - previous) / previous) * 100 : 0;
                
                if (changePercent > 10) overallTrend = 'increasing';
                else if (changePercent < -10) overallTrend = 'decreasing';
            }

            res.json({
                success: true,
                period_months: monthsInt,
                station: station || 'ทุกอู่',
                overall_trend: overallTrend,
                monthly_totals: monthlyTotals,
                station_trends: stationTrends,
                device_type_trends: deviceTypeTrends,
                detailed_data: result.rows
            });

        } catch (error) {
            console.error('Get trend report error:', error);
            res.status(500).json({
                success: false,
                error: 'เกิดข้อผิดพลาดในการสร้างรายงานแนวโน้ม'
            });
        }
    }

    // รายงานการใช้งานตามช่วงเวลา
    static async getUsageByTimeReport(req, res) {
        try {
            const { date_from, date_to, station, device_type } = req.query;

            if (!date_from || !date_to) {
                return res.status(400).json({
                    success: false,
                    error: 'กรุณาระบุช่วงเวลา'
                });
            }

            let query = `
                SELECT 
                    date_used,
                    station,
                    device_type,
                    device_model,
                    COUNT(*) as daily_usage
                FROM replacement_devices
                WHERE date_used BETWEEN $1 AND $2
                  AND date_used IS NOT NULL
            `;

            const queryParams = [date_from, date_to];
            let paramCount = 2;

            if (station) {
                queryParams.push(station);
                query += ` AND station = ${++paramCount}`;
            }

            if (device_type) {
                queryParams.push(device_type);
                query += ` AND device_type = ${++paramCount}`;
            }

            query += `
                GROUP BY date_used, station, device_type, device_model
                ORDER BY date_used DESC, station, device_type
            `;

            const result = await db.query(query, queryParams);

            // สรุปสถิติ
            const totalUsage = result.rows.reduce((sum, row) => sum + parseInt(row.daily_usage), 0);
            const avgDailyUsage = result.rows.length > 0 ? (totalUsage / result.rows.length).toFixed(2) : 0;
            const uniqueDates = new Set(result.rows.map(row => row.date_used)).size;
            const peakUsageDay = result.rows.reduce((max, row) => 
                parseInt(row.daily_usage) > parseInt(max.daily_usage) ? row : max, 
                result.rows[0] || { daily_usage: 0 }
            );

            res.json({
                success: true,
                period: { start_date: date_from, end_date: date_to },
                station: station || 'ทุกอู่',
                device_type: device_type || 'ทุกประเภท',
                summary: {
                    total_usage: totalUsage,
                    avg_daily_usage: parseFloat(avgDailyUsage),
                    active_days: uniqueDates,
                    peak_usage: {
                        date: peakUsageDay.date_used,
                        count: parseInt(peakUsageDay.daily_usage),
                        station: peakUsageDay.station,
                        device_type: peakUsageDay.device_type
                    }
                },
                data: result.rows
            });

        } catch (error) {
            console.error('Get usage by time report error:', error);
            res.status(500).json({
                success: false,
                error: 'เกิดข้อผิดพลาดในการสร้างรายงานการใช้งานตามช่วงเวลา'
            });
        }
    }

    // รายงานสต็อกและการใช้งาน
    static async getStockUsageReport(req, res) {
        try {
            const { station } = req.query;

            let query = `
                SELECT 
                    r.station,
                    r.device_model,
                    COUNT(r.*) as total_devices,
                    COUNT(CASE WHEN r.status = 'พร้อมใช้' THEN 1 END) as available,
                    COUNT(CASE WHEN r.status = 'ใช้งานแล้ว' THEN 1 END) as in_use,
                    COUNT(CASE WHEN r.status = 'ซ่อม' THEN 1 END) as in_repair,
                    COUNT(CASE WHEN r.date_used >= CURRENT_DATE - INTERVAL '30 days' THEN 1 END) as used_last_30_days,
                    s.min_stock_notify,
                    CASE 
                        WHEN COUNT(CASE WHEN r.status = 'พร้อมใช้' THEN 1 END) <= COALESCE(s.min_stock_notify, 2) THEN true
                        ELSE false
                    END as is_low_stock
                FROM replacement_devices r
                LEFT JOIN stock_summary s ON r.station = s.station AND r.device_model = s.device_model
            `;

            const queryParams = [];
            let paramCount = 0;

            if (station) {
                queryParams.push(station);
                query += ` WHERE r.station = ${++paramCount}`;
            }

            query += `
                GROUP BY r.station, r.device_model, s.min_stock_notify
                ORDER BY r.station, is_low_stock DESC, r.device_model
            `;

            const result = await db.query(query, queryParams);

            // วิเคราะห์สถานการณ์
            const lowStockItems = result.rows.filter(row => row.is_low_stock);
            const highUsageItems = result.rows.filter(row => parseInt(row.used_last_30_days) > parseInt(row.total_devices) * 0.5);

            res.json({
                success: true,
                station: station || 'ทุกอู่',
                generated_at: new Date().toISOString(),
                summary: {
                    total_categories: result.rows.length,
                    low_stock_items: lowStockItems.length,
                    high_usage_items: highUsageItems.length,
                    total_devices: result.rows.reduce((sum, row) => sum + parseInt(row.total_devices), 0)
                },
                alerts: {
                    low_stock: lowStockItems.map(item => ({
                        station: item.station,
                        device_model: item.device_model,
                        available: parseInt(item.available),
                        min_notify: item.min_stock_notify
                    })),
                    high_usage: highUsageItems.map(item => ({
                        station: item.station,
                        device_model: item.device_model,
                        usage_rate: ((parseInt(item.used_last_30_days) / parseInt(item.total_devices)) * 100).toFixed(2)
                    }))
                },
                data: result.rows
            });

        } catch (error) {
            console.error('Get stock usage report error:', error);
            res.status(500).json({
                success: false,
                error: 'เกิดข้อผิดพลาดในการสร้างรายงานสต็อกและการใช้งาน'
            });
        }
    }

    // รายงานประสิทธิภาพการแก้ไขปัญหา
    static async getResolutionReport(req, res) {
        try {
            const { date_from, date_to, station } = req.query;

            // กำหนดช่วงเวลาเริ่มต้น (30 วันย้อนหลัง)
            const startDate = date_from || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
            const endDate = date_to || new Date().toISOString().split('T')[0];

            let query = `
                SELECT 
                    station,
                    device_type,
                    COUNT(*) as total_reports,
                    COUNT(CASE WHEN replacement_device_id IS NOT NULL THEN 1 END) as resolved_reports,
                    COUNT(CASE WHEN replacement_device_id IS NULL THEN 1 END) as pending_reports,
                    AVG(
                        CASE 
                            WHEN replacement_date IS NOT NULL 
                            THEN EXTRACT(DAYS FROM (replacement_date - report_date))
                            ELSE NULL
                        END
                    ) as avg_resolution_days
                FROM damaged_reports
                WHERE report_date BETWEEN $1 AND $2
            `;

            const queryParams = [startDate, endDate];
            let paramCount = 2;

            if (station) {
                queryParams.push(station);
                query += ` AND station = ${++paramCount}`;
            }

            query += `
                GROUP BY station, device_type
                ORDER BY station, total_reports DESC
            `;

            const result = await db.query(query, queryParams);

            // คำนวณสถิติรวม
            const totalReports = result.rows.reduce((sum, row) => sum + parseInt(row.total_reports), 0);
            const totalResolved = result.rows.reduce((sum, row) => sum + parseInt(row.resolved_reports), 0);
            const overallResolutionRate = totalReports > 0 ? ((totalResolved / totalReports) * 100).toFixed(2) : 0;

            // หาการแก้ไขที่เร็วที่สุดและช้าที่สุด
            const withResolutionTime = result.rows.filter(row => row.avg_resolution_days !== null);
            const fastestResolution = withResolutionTime.reduce((min, row) => 
                parseFloat(row.avg_resolution_days) < parseFloat(min.avg_resolution_days) ? row : min,
                withResolutionTime[0] || { avg_resolution_days: 0 }
            );
            const slowestResolution = withResolutionTime.reduce((max, row) => 
                parseFloat(row.avg_resolution_days) > parseFloat(max.avg_resolution_days) ? row : max,
                withResolutionTime[0] || { avg_resolution_days: 0 }
            );

            res.json({
                success: true,
                period: { start_date: startDate, end_date: endDate },
                station: station || 'ทุกอู่',
                summary: {
                    total_reports: totalReports,
                    total_resolved: totalResolved,
                    total_pending: totalReports - totalResolved,
                    overall_resolution_rate: parseFloat(overallResolutionRate),
                    fastest_resolution: fastestResolution ? {
                        station: fastestResolution.station,
                        device_type: fastestResolution.device_type,
                        avg_days: parseFloat(fastestResolution.avg_resolution_days).toFixed(2)
                    } : null,
                    slowest_resolution: slowestResolution ? {
                        station: slowestResolution.station,
                        device_type: slowestResolution.device_type,
                        avg_days: parseFloat(slowestResolution.avg_resolution_days).toFixed(2)
                    } : null
                },
                data: result.rows.map(row => ({
                    ...row,
                    resolution_rate: parseInt(row.total_reports) > 0 ? 
                        ((parseInt(row.resolved_reports) / parseInt(row.total_reports)) * 100).toFixed(2) : 0,
                    avg_resolution_days: row.avg_resolution_days ? 
                        parseFloat(row.avg_resolution_days).toFixed(2) : null
                }))
            });

        } catch (error) {
            console.error('Get resolution report error:', error);
            res.status(500).json({
                success: false,
                error: 'เกิดข้อผิดพลาดในการสร้างรายงานประสิทธิภาพการแก้ไขปัญหา'
            });
        }
    }

    // ส่งออกรายงานเป็น Excel
    static async exportReport(req, res) {
        try {
            const { report_type, format = 'json', ...params } = req.query;

            if (!report_type) {
                return res.status(400).json({
                    success: false,
                    error: 'กรุณาระบุประเภทรายงาน'
                });
            }

            let reportData;
            let filename;

            // เรียกใช้รายงานตามประเภท
            switch (report_type) {
                case 'daily_replacement':
                    reportData = await ReportController.getDailyReplacementData(params);
                    filename = `daily_replacement_${params.date || 'today'}`;
                    break;
                case 'monthly_replacement':
                    reportData = await ReportController.getMonthlyReplacementData(params);
                    filename = `monthly_replacement_${params.year}_${params.month}`;
                    break;
                case 'damaged_reports':
                    reportData = await ReportController.getDailyDamagedData(params);
                    filename = `damaged_reports_${params.date || 'today'}`;
                    break;
                case 'efficiency':
                    reportData = await ReportController.getEfficiencyData(params);
                    filename = `efficiency_report`;
                    break;
                case 'statistics':
                    reportData = await ReportController.getStatisticsData(params);
                    filename = `statistics_report`;
                    break;
                default:
                    return res.status(400).json({
                        success: false,
                        error: 'ประเภทรายงานไม่ถูกต้อง'
                    });
            }

            if (format === 'csv') {
                // ส่งออกเป็น CSV
                const csvData = ReportController.convertToCSV(reportData);
                res.setHeader('Content-Type', 'text/csv; charset=utf-8');
                res.setHeader('Content-Disposition', `attachment; filename=${filename}.csv`);
                res.send('\ufeff' + csvData); // เพิ่ม BOM สำหรับ UTF-8
            } else {
                // ส่งออกเป็น JSON
                res.json({
                    success: true,
                    report_type: report_type,
                    generated_at: new Date().toISOString(),
                    data: reportData
                });
            }

        } catch (error) {
            console.error('Export report error:', error);
            res.status(500).json({
                success: false,
                error: 'เกิดข้อผิดพลาดในการส่งออกรายงาน'
            });
        }
    }

    // Helper methods สำหรับดึงข้อมูลรายงาน
    static async getDailyReplacementData(params) {
        const mockReq = { query: params };
        const mockRes = {
            json: (data) => data,
            status: () => mockRes
        };
        
        return new Promise((resolve, reject) => {
            const originalJson = mockRes.json;
            mockRes.json = (data) => {
                if (data.success) {
                    resolve(data.data);
                } else {
                    reject(new Error(data.error));
                }
            };
            
            ReportController.getDailyReplacementReport(mockReq, mockRes);
        });
    }

    static async getMonthlyReplacementData(params) {
        // Similar implementation for monthly data
        const mockReq = { query: params };
        const mockRes = {
            json: (data) => data,
            status: () => mockRes
        };
        
        return new Promise((resolve, reject) => {
            const originalJson = mockRes.json;
            mockRes.json = (data) => {
                if (data.success) {
                    resolve(data.data);
                } else {
                    reject(new Error(data.error));
                }
            };
            
            ReportController.getMonthlyReplacementReport(mockReq, mockRes);
        });
    }

    static convertToCSV(data) {
        if (!data || data.length === 0) {
            return '';
        }

        const headers = Object.keys(data[0]);
        const csvRows = [
            headers.join(','),
            ...data.map(row => 
                headers.map(header => {
                    const value = row[header] || '';
                    return typeof value === 'string' && value.includes(',') 
                        ? `"${value.replace(/"/g, '""')}"` 
                        : value;
                }).join(',')
            )
        ];

        return csvRows.join('\n');
    }
}

module.exports = ReportController;