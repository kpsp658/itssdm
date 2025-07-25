// controllers/stockController.js
const db = require('../config/database');

class StockController {
    // ดึงสรุปสต็อกทั้งหมด
    static async getStockSummary(req, res) {
        try {
            console.log('Getting stock summary...');
            
            // สร้างหรืออัปเดต stock_summary จากข้อมูลจริง
            await StockController.refreshAllStock();
            
            const query = `
                SELECT 
                    station,
                    device_model,
                    total_stock,
                    available_stock,
                    used_stock,
                    COALESCE(min_stock_notify, 2) as min_stock_notify,
                    last_updated,
                    CASE 
                        WHEN available_stock <= COALESCE(min_stock_notify, 2) THEN true 
                        ELSE false 
                    END as is_low_stock
                FROM stock_summary
                ORDER BY station, device_model
            `;
            
            const result = await db.query(query);

            // คำนวณสถิติรวม
            const totalStock = result.rows.reduce((sum, item) => sum + parseInt(item.total_stock || 0), 0);
            const totalAvailable = result.rows.reduce((sum, item) => sum + parseInt(item.available_stock || 0), 0);
            const totalUsed = result.rows.reduce((sum, item) => sum + parseInt(item.used_stock || 0), 0);
            const lowStockCount = result.rows.filter(item => item.is_low_stock).length;

            console.log('Stock summary retrieved:', {
                totalStock,
                totalAvailable,
                totalUsed,
                lowStockCount,
                detailsCount: result.rows.length
            });

            res.json({
                success: true,
                summary: {
                    total_stock: totalStock,
                    available_stock: totalAvailable,
                    used_stock: totalUsed,
                    low_stock_items: lowStockCount
                },
                stock_details: result.rows
            });

        } catch (error) {
            console.error('Get stock summary error:', error);
            res.status(500).json({
                success: false,
                error: 'เกิดข้อผิดพลาดในการดึงข้อมูลสต็อก'
            });
        }
    }

    // รีเฟรชข้อมูลสต็อกทั้งหมด
    static async refreshAllStock() {
        try {
            const query = `
                INSERT INTO stock_summary (station, device_model, total_stock, available_stock, used_stock, last_updated)
                SELECT 
                    station,
                    device_model,
                    COUNT(*) as total_stock,
                    COUNT(CASE WHEN status = 'พร้อมใช้' THEN 1 END) as available_stock,
                    COUNT(CASE WHEN status = 'ใช้งานแล้ว' THEN 1 END) as used_stock,
                    CURRENT_TIMESTAMP as last_updated
                FROM replacement_devices 
                GROUP BY station, device_model
                ON CONFLICT (station, device_model) 
                DO UPDATE SET
                    total_stock = EXCLUDED.total_stock,
                    available_stock = EXCLUDED.available_stock,
                    used_stock = EXCLUDED.used_stock,
                    last_updated = EXCLUDED.last_updated
            `;
            
            await db.query(query);
            console.log('All stock data refreshed');
        } catch (error) {
            console.error('Error refreshing all stock:', error);
        }
    }

    // ดึงสต็อกตามอู่
    static async getStockByStation(req, res) {
        try {
            const { station } = req.params;

            if (!station) {
                return res.status(400).json({
                    success: false,
                    error: 'กรุณาระบุชื่ออู่'
                });
            }

            console.log('Getting stock for station:', station);

            const query = `
                SELECT 
                    s.station,
                    s.device_model,
                    s.total_stock,
                    s.available_stock,
                    s.used_stock,
                    COALESCE(s.min_stock_notify, 2) as min_stock_notify,
                    s.last_updated,
                    CASE 
                        WHEN s.available_stock <= COALESCE(s.min_stock_notify, 2) THEN true 
                        ELSE false 
                    END as is_low_stock
                FROM stock_summary s
                WHERE s.station = $1
                ORDER BY s.device_model
            `;
            
            const result = await db.query(query, [station]);

            if (result.rows.length === 0) {
                return res.status(404).json({
                    success: false,
                    error: 'ไม่พบข้อมูลสต็อกสำหรับอู่นี้'
                });
            }

            // คำนวณสถิติของอู่นี้
            const stationStats = {
                total_stock: result.rows.reduce((sum, item) => sum + parseInt(item.total_stock || 0), 0),
                available_stock: result.rows.reduce((sum, item) => sum + parseInt(item.available_stock || 0), 0),
                used_stock: result.rows.reduce((sum, item) => sum + parseInt(item.used_stock || 0), 0),
                low_stock_items: result.rows.filter(item => item.is_low_stock).length,
                device_types: result.rows.length
            };

            console.log('Station stock retrieved:', station, stationStats);

            res.json({
                success: true,
                station: station,
                statistics: stationStats,
                stock_details: result.rows
            });

        } catch (error) {
            console.error('Get stock by station error:', error);
            res.status(500).json({
                success: false,
                error: 'เกิดข้อผิดพลาดในการดึงข้อมูลสต็อก'
            });
        }
    }

    // ดึงรายการสต็อกต่ำ
    static async getLowStock(req, res) {
        try {
            const { threshold } = req.query;

            console.log('Getting low stock items with threshold:', threshold);

            let query = `
                SELECT 
                    station,
                    device_model,
                    total_stock,
                    available_stock,
                    used_stock,
                    COALESCE(min_stock_notify, 2) as min_stock_notify,
                    last_updated,
                    (COALESCE(min_stock_notify, 2) - available_stock) as shortage_amount
                FROM stock_summary
                WHERE available_stock <= COALESCE(min_stock_notify, 2)
            `;

            // ถ้ามีการกำหนด threshold เพิ่มเติม
            if (threshold && !isNaN(threshold)) {
                query += ` AND available_stock <= ${parseInt(threshold)}`;
            }

            query += ` ORDER BY (COALESCE(min_stock_notify, 2) - available_stock) DESC, station, device_model`;

            const result = await db.query(query);

            // หาข้อมูลรายละเอียดเพิ่มเติม
            const enrichedResults = await Promise.all(
                result.rows.map(async (item) => {
                    // ดึงอุปกรณ์ที่ใช้งานล่าสุด
                    const lastUsedQuery = `
                        SELECT vehicle_license, date_used 
                        FROM replacement_devices 
                        WHERE station = $1 AND device_model = $2 AND status = 'ใช้งานแล้ว'
                        ORDER BY date_used DESC 
                        LIMIT 3
                    `;
                    
                    const lastUsedResult = await db.query(lastUsedQuery, [item.station, item.device_model]);
                    
                    return {
                        ...item,
                        recent_usage: lastUsedResult.rows,
                        urgency_level: item.shortage_amount > 3 ? 'critical' : 
                                      item.shortage_amount > 1 ? 'high' : 'medium'
                    };
                })
            );

            console.log('Low stock items found:', enrichedResults.length);

            res.json({
                success: true,
                low_stock_count: result.rows.length,
                critical_count: enrichedResults.filter(item => item.urgency_level === 'critical').length,
                items: enrichedResults
            });

        } catch (error) {
            console.error('Get low stock error:', error);
            res.status(500).json({
                success: false,
                error: 'เกิดข้อผิดพลาดในการดึงข้อมูลสต็อกต่ำ'
            });
        }
    }

    // อัปเดตระดับแจ้งเตือนสต็อก
    static async updateStockNotification(req, res) {
        try {
            const { station, device_model, min_stock_notify } = req.body;

            console.log('Updating stock notification:', { station, device_model, min_stock_notify });

            if (!station || !device_model || min_stock_notify === undefined) {
                return res.status(400).json({
                    success: false,
                    error: 'กรุณากรอกข้อมูลให้ครบถ้วน'
                });
            }

            if (min_stock_notify < 0) {
                return res.status(400).json({
                    success: false,
                    error: 'จำนวนขั้นต่ำต้องมากกว่าหรือเท่ากับ 0'
                });
            }

            // ตรวจสอบว่ามีรายการนี้อยู่หรือไม่ ถ้าไม่มีให้สร้างใหม่
            const checkQuery = 'SELECT id FROM stock_summary WHERE station = $1 AND device_model = $2';
            const checkResult = await db.query(checkQuery, [station, device_model]);

            if (checkResult.rows.length === 0) {
                // สร้างรายการใหม่
                await StockController.refreshSpecificStock(station, device_model);
            }

            // อัปเดตระดับแจ้งเตือน
            const updateQuery = `
                UPDATE stock_summary 
                SET min_stock_notify = $1, last_updated = CURRENT_TIMESTAMP
                WHERE station = $2 AND device_model = $3
                RETURNING *
            `;
            
            const result = await db.query(updateQuery, [min_stock_notify, station, device_model]);

            if (result.rows.length === 0) {
                return res.status(404).json({
                    success: false,
                    error: 'ไม่พบรายการสต็อกที่ต้องการอัปเดต'
                });
            }

            console.log('Stock notification updated successfully');

            res.json({
                success: true,
                message: `อัปเดตระดับแจ้งเตือนสำหรับ ${device_model} ที่ ${station} เรียบร้อยแล้ว`,
                updated_item: result.rows[0]
            });

        } catch (error) {
            console.error('Update stock notification error:', error);
            res.status(500).json({
                success: false,
                error: 'เกิดข้อผิดพลาดในการอัปเดตระดับแจ้งเตือน'
            });
        }
    }

    // รีเฟรชข้อมูลสต็อก
    static async refreshStock(req, res) {
        try {
            const { station, device_model } = req.query;

            console.log('Refreshing stock data:', { station, device_model });

            if (station && device_model) {
                // รีเฟรชเฉพาะรายการ
                await StockController.refreshSpecificStock(station, device_model);
            } else if (station) {
                // รีเฟรชทั้งอู่
                await StockController.refreshStationStock(station);
            } else {
                // รีเฟรชทั้งหมด
                await StockController.refreshAllStock();
            }

            // ดึงข้อมูลที่อัปเดตแล้ว
            let selectQuery = 'SELECT * FROM stock_summary';
            let selectParams = [];
            let selectParamCount = 0;

            if (station && device_model) {
                selectParams.push(station, device_model);
                selectQuery += ` WHERE station = $${++selectParamCount} AND device_model = $${++selectParamCount}`;
            } else if (station) {
                selectParams.push(station);
                selectQuery += ` WHERE station = $${++selectParamCount}`;
            }

            selectQuery += ' ORDER BY station, device_model';

            const result = await db.query(selectQuery, selectParams);

            console.log('Stock data refreshed successfully, updated items:', result.rows.length);

            res.json({
                success: true,
                message: 'รีเฟรชข้อมูลสต็อกเรียบร้อยแล้ว',
                updated_count: result.rows.length,
                stock_data: result.rows
            });

        } catch (error) {
            console.error('Refresh stock error:', error);
            res.status(500).json({
                success: false,
                error: 'เกิดข้อผิดพลาดในการรีเฟรชข้อมูลสต็อก'
            });
        }
    }

    // รีเฟรชสต็อกเฉพาะรายการ
    static async refreshSpecificStock(station, deviceModel) {
        try {
            const query = `
                INSERT INTO stock_summary (station, device_model, total_stock, available_stock, used_stock, last_updated)
                SELECT 
                    $1 as station,
                    $2 as device_model,
                    COUNT(*) as total_stock,
                    COUNT(CASE WHEN status = 'พร้อมใช้' THEN 1 END) as available_stock,
                    COUNT(CASE WHEN status = 'ใช้งานแล้ว' THEN 1 END) as used_stock,
                    CURRENT_TIMESTAMP as last_updated
                FROM replacement_devices 
                WHERE station = $1 AND device_model = $2
                ON CONFLICT (station, device_model) 
                DO UPDATE SET
                    total_stock = EXCLUDED.total_stock,
                    available_stock = EXCLUDED.available_stock,
                    used_stock = EXCLUDED.used_stock,
                    last_updated = EXCLUDED.last_updated
            `;
            
            await db.query(query, [station, deviceModel]);
        } catch (error) {
            console.error('Error refreshing specific stock:', error);
        }
    }

    // รีเฟรชสต็อกทั้งอู่
    static async refreshStationStock(station) {
        try {
            const query = `
                INSERT INTO stock_summary (station, device_model, total_stock, available_stock, used_stock, last_updated)
                SELECT 
                    station,
                    device_model,
                    COUNT(*) as total_stock,
                    COUNT(CASE WHEN status = 'พร้อมใช้' THEN 1 END) as available_stock,
                    COUNT(CASE WHEN status = 'ใช้งานแล้ว' THEN 1 END) as used_stock,
                    CURRENT_TIMESTAMP as last_updated
                FROM replacement_devices 
                WHERE station = $1
                GROUP BY station, device_model
                ON CONFLICT (station, device_model) 
                DO UPDATE SET
                    total_stock = EXCLUDED.total_stock,
                    available_stock = EXCLUDED.available_stock,
                    used_stock = EXCLUDED.used_stock,
                    last_updated = EXCLUDED.last_updated
            `;
            
            await db.query(query, [station]);
        } catch (error) {
            console.error('Error refreshing station stock:', error);
        }
    }

    // ดึงการคาดการณ์สต็อก
    static async getStockForecast(req, res) {
        try {
            const { station, device_model, days = 30 } = req.query;

            console.log('Getting stock forecast:', { station, device_model, days });

            // คำนวณอัตราการใช้งานเฉลี่ย
            let usageQuery = `
                SELECT 
                    station,
                    device_model,
                    COUNT(*) as usage_count,
                    COUNT(*) / ${parseInt(days)}.0 as daily_usage_rate
                FROM replacement_devices
                WHERE date_used >= CURRENT_DATE - INTERVAL '${parseInt(days)} days'
                  AND date_used IS NOT NULL
            `;

            const queryParams = [];
            let paramCount = 0;

            if (station) {
                queryParams.push(station);
                usageQuery += ` AND station = $${++paramCount}`;
            }

            if (device_model) {
                queryParams.push(device_model);
                usageQuery += ` AND device_model = $${++paramCount}`;
            }

            usageQuery += ` GROUP BY station, device_model`;

            const usageResult = await db.query(usageQuery, queryParams);

            // ดึงสต็อกปัจจุบัน
            let currentStockQuery = `
                SELECT 
                    station,
                    device_model,
                    available_stock,
                    COALESCE(min_stock_notify, 2) as min_stock_notify
                FROM stock_summary
                WHERE 1=1
            `;

            const stockParams = [];
            let stockParamCount = 0;

            if (station) {
                stockParams.push(station);
                currentStockQuery += ` AND station = $${++stockParamCount}`;
            }

            if (device_model) {
                stockParams.push(device_model);
                currentStockQuery += ` AND device_model = $${++stockParamCount}`;
            }

            const stockResult = await db.query(currentStockQuery, stockParams);

            // รวมข้อมูลและคำนวณการคาดการณ์
            const forecasts = stockResult.rows.map(stock => {
                const usage = usageResult.rows.find(u => 
                    u.station === stock.station && u.device_model === stock.device_model
                );

                const dailyUsageRate = usage ? parseFloat(usage.daily_usage_rate) : 0;
                const currentStock = parseInt(stock.available_stock);
                
                let daysUntilLowStock = null;
                let daysUntilOutOfStock = null;
                let recommendedOrder = 0;

                if (dailyUsageRate > 0) {
                    daysUntilLowStock = Math.floor((currentStock - stock.min_stock_notify) / dailyUsageRate);
                    daysUntilOutOfStock = Math.floor(currentStock / dailyUsageRate);
                    
                    // แนะนำจำนวนที่ควรสั่งซื้อ (สำหรับ 60 วัน)
                    const projectedUsage60Days = dailyUsageRate * 60;
                    recommendedOrder = Math.max(0, Math.ceil(projectedUsage60Days - currentStock));
                }

                return {
                    station: stock.station,
                    device_model: stock.device_model,
                    current_stock: currentStock,
                    min_stock_notify: stock.min_stock_notify,
                    daily_usage_rate: dailyUsageRate,
                    days_until_low_stock: daysUntilLowStock,
                    days_until_out_of_stock: daysUntilOutOfStock,
                    recommended_order: recommendedOrder,
                    forecast_accuracy: usage ? 'high' : 'low',
                    alert_level: daysUntilLowStock !== null && daysUntilLowStock <= 7 ? 'critical' :
                                daysUntilLowStock !== null && daysUntilLowStock <= 14 ? 'warning' : 'normal'
                };
            });

            console.log('Stock forecast calculated:', forecasts.length, 'items');

            res.json({
                success: true,
                forecast_period_days: parseInt(days),
                forecasts: forecasts,
                summary: {
                    total_items: forecasts.length,
                    critical_alerts: forecasts.filter(f => f.alert_level === 'critical').length,
                    warning_alerts: forecasts.filter(f => f.alert_level === 'warning').length,
                    total_recommended_orders: forecasts.reduce((sum, f) => sum + f.recommended_order, 0)
                }
            });

        } catch (error) {
            console.error('Get stock forecast error:', error);
            res.status(500).json({
                success: false,
                error: 'เกิดข้อผิดพลาดในการคาดการณ์สต็อก'
            });
        }
    }

    // ส่งออกข้อมูลสต็อก
    static async exportStock(req, res) {
        try {
            const { format = 'json', station, device_model } = req.query;

            console.log('Exporting stock data:', { format, station, device_model });

            let query = `
                SELECT 
                    s.station,
                    s.device_model,
                    s.total_stock,
                    s.available_stock,
                    s.used_stock,
                    COALESCE(s.min_stock_notify, 2) as min_stock_notify,
                    s.last_updated,
                    CASE 
                        WHEN s.available_stock <= COALESCE(s.min_stock_notify, 2) THEN 'Low Stock'
                        ELSE 'Normal'
                    END as stock_status
                FROM stock_summary s
                WHERE 1=1
            `;

            const queryParams = [];
            let paramCount = 0;

            if (station) {
                queryParams.push(station);
                query += ` AND s.station = $${++paramCount}`;
            }

            if (device_model) {
                queryParams.push(device_model);
                query += ` AND s.device_model = $${++paramCount}`;
            }

            query += ` ORDER BY s.station, s.device_model`;

            const result = await db.query(query, queryParams);

            if (format === 'csv') {
                // ส่งออกเป็น CSV
                const headers = [
                    'Station', 'Device Model', 'Total Stock', 'Available Stock', 
                    'Used Stock', 'Min Stock Notify', 'Stock Status', 'Last Updated'
                ];

                const csvData = [
                    headers.join(','),
                    ...result.rows.map(row => [
                        `"${row.station}"`,
                        `"${row.device_model}"`,
                        row.total_stock,
                        row.available_stock,
                        row.used_stock,
                        row.min_stock_notify,
                        `"${row.stock_status}"`,
                        `"${new Date(row.last_updated).toLocaleString('th-TH')}"`
                    ].join(','))
                ].join('\n');

                res.setHeader('Content-Type', 'text/csv; charset=utf-8');
                res.setHeader('Content-Disposition', `attachment; filename=stock_export_${new Date().toISOString().split('T')[0]}.csv`);
                res.send('\ufeff' + csvData); // เพิ่ม BOM สำหรับ UTF-8

            } else {
                // ส่งออกเป็น JSON
                res.json({
                    success: true,
                    export_date: new Date().toISOString(),
                    total_records: result.rows.length,
                    data: result.rows
                });
            }

            console.log('Stock data exported successfully:', result.rows.length, 'records');

        } catch (error) {
            console.error('Export stock error:', error);
            res.status(500).json({
                success: false,
                error: 'เกิดข้อผิดพลาดในการส่งออกข้อมูลสต็อก'
            });
        }
    }

    // ดึงสถิติการใช้งานแบบ real-time
    static async getRealTimeStats(req, res) {
        try {
            console.log('Getting real-time stats...');

            // สถิติรวมทั้งหมด
            const overallQuery = `
                SELECT 
                    COUNT(*) as total_devices,
                    COUNT(CASE WHEN status = 'พร้อมใช้' THEN 1 END) as available,
                    COUNT(CASE WHEN status = 'ใช้งานแล้ว' THEN 1 END) as in_use,
                    COUNT(CASE WHEN status = 'ซ่อม' THEN 1 END) as in_repair
                FROM replacement_devices
            `;

            // สถิติการใช้งานวันนี้
            const todayQuery = `
                SELECT COUNT(*) as today_usage
                FROM replacement_devices
                WHERE date_used = CURRENT_DATE
            `;

            // สถิติรายงานเครื่องชำรุดที่ยังไม่ได้แก้ไข
            const pendingReportsQuery = `
                SELECT COUNT(*) as pending_reports
                FROM damaged_reports
                WHERE replacement_device_id IS NULL
            `;

            // สถิติสต็อกต่ำ
            const lowStockQuery = `
                SELECT COUNT(*) as low_stock_count
                FROM stock_summary
                WHERE available_stock <= COALESCE(min_stock_notify, 2)
            `;

            const [overallResult, todayResult, pendingResult, lowStockResult] = await Promise.all([
                db.query(overallQuery),
                db.query(todayQuery),
                db.query(pendingReportsQuery),
                db.query(lowStockQuery)
            ]);

            const stats = {
                overall: overallResult.rows[0],
                today_usage: parseInt(todayResult.rows[0].today_usage),
                pending_reports: parseInt(pendingResult.rows[0].pending_reports),
                low_stock_count: parseInt(lowStockResult.rows[0].low_stock_count),
                last_updated: new Date().toISOString()
            };

            console.log('Real-time stats retrieved:', stats);

            res.json({
                success: true,
                stats: stats
            });

        } catch (error) {
            console.error('Get real-time stats error:', error);
            res.status(500).json({
                success: false,
                error: 'เกิดข้อผิดพลาดในการดึงสถิติแบบ real-time'
            });
        }
    }

    // ดึงสถิติตามอู่
    static async getStationStatistics(req, res) {
        try {
            console.log('Getting station statistics...');

            const query = `
                SELECT 
                    station,
                    COUNT(*) as total_devices,
                    COUNT(CASE WHEN status = 'พร้อมใช้' THEN 1 END) as available_devices,
                    COUNT(CASE WHEN status = 'ใช้งานแล้ว' THEN 1 END) as used_devices,
                    COUNT(CASE WHEN status = 'ซ่อม' THEN 1 END) as repair_devices,
                    ROUND(
                        (COUNT(CASE WHEN status = 'ใช้งานแล้ว' THEN 1 END) * 100.0 / NULLIF(COUNT(*), 0)), 2
                    ) as utilization_rate,
                    COUNT(DISTINCT device_model) as device_types
                FROM replacement_devices
                GROUP BY station
                ORDER BY total_devices DESC
            `;

            const result = await db.query(query);

            // ดึงข้อมูลรายงานชำรุดแต่ละอू่
            const damageQuery = `
                SELECT 
                    station,
                    COUNT(*) as total_reports,
                    COUNT(CASE WHEN replacement_device_id IS NOT NULL THEN 1 END) as resolved_reports
                FROM damaged_reports
                GROUP BY station
            `;

            const damageResult = await db.query(damageQuery);

            // รวมข้อมูล
            const stationStats = result.rows.map(station => {
                const damageInfo = damageResult.rows.find(d => d.station === station.station) || 
                    { total_reports: 0, resolved_reports: 0 };
                
                return {
                    ...station,
                    damage_reports: parseInt(damageInfo.total_reports),
                    resolved_reports: parseInt(damageInfo.resolved_reports),
                    pending_reports: parseInt(damageInfo.total_reports) - parseInt(damageInfo.resolved_reports)
                };
            });

            console.log('Station statistics retrieved for', stationStats.length, 'stations');

            res.json({
                success: true,
                stations: stationStats,
                summary: {
                    total_stations: stationStats.length,
                    total_devices: stationStats.reduce((sum, s) => sum + parseInt(s.total_devices), 0),
                    total_available: stationStats.reduce((sum, s) => sum + parseInt(s.available_devices), 0),
                    total_used: stationStats.reduce((sum, s) => sum + parseInt(s.used_devices), 0)
                }
            });

        } catch (error) {
            console.error('Get station statistics error:', error);
            res.status(500).json({
                success: false,
                error: 'เกิดข้อผิดพลาดในการดึงสถิติตามอู่'
            });
        }
    }

    // ตรวจสอบและแจ้งเตือนสต็อกต่ำ
    static async checkLowStockAlerts(req, res) {
        try {
            console.log('Checking low stock alerts...');

            const query = `
                SELECT 
                    station,
                    device_model,
                    available_stock,
                    COALESCE(min_stock_notify, 2) as min_stock_notify,
                    (COALESCE(min_stock_notify, 2) - available_stock) as shortage,
                    CASE 
                        WHEN available_stock = 0 THEN 'out_of_stock'
                        WHEN available_stock <= COALESCE(min_stock_notify, 2) / 2 THEN 'critical'
                        WHEN available_stock <= COALESCE(min_stock_notify, 2) THEN 'warning'
                        ELSE 'normal'
                    END as alert_level
                FROM stock_summary
                WHERE available_stock <= COALESCE(min_stock_notify, 2)
                ORDER BY alert_level DESC, shortage DESC
            `;

            const result = await db.query(query);

            const alerts = {
                out_of_stock: result.rows.filter(r => r.alert_level === 'out_of_stock'),
                critical: result.rows.filter(r => r.alert_level === 'critical'),
                warning: result.rows.filter(r => r.alert_level === 'warning')
            };

            console.log('Low stock alerts:', {
                out_of_stock: alerts.out_of_stock.length,
                critical: alerts.critical.length,
                warning: alerts.warning.length
            });

            res.json({
                success: true,
                alerts: alerts,
                summary: {
                    total_alerts: result.rows.length,
                    out_of_stock_count: alerts.out_of_stock.length,
                    critical_count: alerts.critical.length,
                    warning_count: alerts.warning.length
                },
                last_checked: new Date().toISOString()
            });

        } catch (error) {
            console.error('Check low stock alerts error:', error);
            res.status(500).json({
                success: false,
                error: 'เกิดข้อผิดพลาดในการตรวจสอบการแจ้งเตือนสต็อกต่ำ'
            });
        }
    }

    // Helper methods
    static async logStockMovement(station, deviceModel, actionType, deviceId = null, vehicleLicense = null, notes = '', userName = null) {
        try {
            console.log('Logging stock movement:', { station, deviceModel, actionType, deviceId });
            
            // ตรวจสอบว่าตาราง stock_movement_logs มีอยู่หรือไม่
            const tableCheckQuery = `
                SELECT EXISTS (
                    SELECT FROM information_schema.tables 
                    WHERE table_schema = 'public' 
                    AND table_name = 'stock_movement_logs'
                );
            `;
            
            const tableExists = await db.query(tableCheckQuery);
            
            if (!tableExists.rows[0].exists) {
                // สร้างตารางถ้ายังไม่มี
                const createTableQuery = `
                    CREATE TABLE IF NOT EXISTS stock_movement_logs (
                        id SERIAL PRIMARY KEY,
                        station VARCHAR(100) NOT NULL,
                        device_model VARCHAR(100) NOT NULL,
                        action_type VARCHAR(50) NOT NULL,
                        device_id VARCHAR(100),
                        vehicle_license VARCHAR(20),
                        notes TEXT,
                        user_name VARCHAR(100),
                        action_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    );
                `;
                await db.query(createTableQuery);
                console.log('Created stock_movement_logs table');
            }
            
            const query = `
                INSERT INTO stock_movement_logs (
                    station, device_model, action_type, device_id, 
                    vehicle_license, notes, user_name, action_date
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)
            `;
            
            await db.query(query, [
                station, deviceModel, actionType, deviceId, 
                vehicleLicense, notes, userName
            ]);

            console.log('Stock movement logged successfully');
            
        } catch (error) {
            console.error('Error logging stock movement:', error);
        }
    }

    // อัปเดตสต็อกจากการใช้งานจริง (สำหรับเรียกจาก deviceController)
    static async updateStockFromDevice(station, deviceModel) {
        try {
            await StockController.refreshSpecificStock(station, deviceModel);
            console.log('Stock updated from device action:', station, deviceModel);
        } catch (error) {
            console.error('Error updating stock from device:', error);
        }
    }

    // ดึงประวัติการเปลี่ยนแปลงสต็อก
    static async getStockHistory(req, res) {
        try {
            const { station, device_model, days = 30 } = req.query;

            console.log('Getting stock history:', { station, device_model, days });

            // ตรวจสอบว่าตารางมีอยู่หรือไม่
            const tableCheckQuery = `
                SELECT EXISTS (
                    SELECT FROM information_schema.tables 
                    WHERE table_schema = 'public' 
                    AND table_name = 'stock_movement_logs'
                );
            `;
            
            const tableExists = await db.query(tableCheckQuery);
            
            if (!tableExists.rows[0].exists) {
                return res.json({
                    success: true,
                    period_days: parseInt(days),
                    summary: {
                        total_movements: 0,
                        additions: 0,
                        usage: 0,
                        returns: 0,
                        removals: 0
                    },
                    movements: []
                });
            }

            let query = `
                SELECT 
                    station,
                    device_model,
                    action_type,
                    device_id,
                    vehicle_license,
                    action_date,
                    notes,
                    user_name
                FROM stock_movement_logs
                WHERE action_date >= CURRENT_DATE - INTERVAL '${parseInt(days)} days'
            `;

            const queryParams = [];
            let paramCount = 0;

            if (station) {
                queryParams.push(station);
                query += ` AND station = ${++paramCount}`;
            }

            if (device_model) {
                queryParams.push(device_model);
                query += ` AND device_model = ${++paramCount}`;
            }

            query += ` ORDER BY action_date DESC, id DESC LIMIT 100`;

            const result = await db.query(query, queryParams);

            // สรุปการเปลี่ยนแปลง
            const summary = {
                total_movements: result.rows.length,
                additions: result.rows.filter(row => row.action_type === 'add').length,
                usage: result.rows.filter(row => row.action_type === 'use').length,
                returns: result.rows.filter(row => row.action_type === 'return').length,
                removals: result.rows.filter(row => row.action_type === 'remove').length
            };

            console.log('Stock history retrieved:', summary);

            res.json({
                success: true,
                period_days: parseInt(days),
                summary: summary,
                movements: result.rows
            });

        } catch (error) {
            console.error('Get stock history error:', error);
            res.status(500).json({
                success: false,
                error: 'เกิดข้อผิดพลาดในการดึงประวัติสต็อก'
            });
        }
    }
}

module.exports = StockController;