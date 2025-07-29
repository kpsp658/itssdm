// controllers/deviceController.js
const db = require('../config/database');

class DeviceController {
    // ดึงรายการอุปกรณ์ทดแทนทั้งหมด
    static async getAllDevices(req, res) {
        try {
            const { station, device_type, status, page = 1, limit = 50 } = req.query;
            
            let query = `
                SELECT 
                    id, date_added, station, device_type, device_model, 
                    device_id, serial_number, status, date_used, 
                    vehicle_license, installation_position, notes,
                    created_at, updated_at
                FROM replacement_devices
                WHERE 1=1
            `;
            
            const queryParams = [];
            let paramCount = 0;

            // เพิ่มเงื่อนไขการกรอง
            if (station) {
                queryParams.push(station);
                query += ` AND station = $${++paramCount}`;
            }
            
            if (device_type) {
                queryParams.push(device_type);
                query += ` AND device_type = $${++paramCount}`;
            }
            
            if (status) {
                queryParams.push(status);
                query += ` AND status = $${++paramCount}`;
            }

            // เพิ่ม pagination
            const offset = (page - 1) * limit;
            query += ` ORDER BY date_added DESC, id DESC LIMIT $${++paramCount} OFFSET $${++paramCount}`;
            queryParams.push(limit, offset);

            const result = await db.query(query, queryParams);

            // นับจำนวนทั้งหมดสำหรับ pagination
            let countQuery = 'SELECT COUNT(*) as total FROM replacement_devices WHERE 1=1';
            const countParams = [];
            let countParamIndex = 0;

            if (station) {
                countParams.push(station);
                countQuery += ` AND station = $${++countParamIndex}`;
            }
            
            if (device_type) {
                countParams.push(device_type);
                countQuery += ` AND device_type = $${++countParamIndex}`;
            }
            
            if (status) {
                countParams.push(status);
                countQuery += ` AND status = $${++countParamIndex}`;
            }

            const countResult = await db.query(countQuery, countParams);
            const total = parseInt(countResult.rows[0].total);

            res.json({
                success: true,
                devices: result.rows,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total: total,
                    totalPages: Math.ceil(total / limit)
                }
            });

        } catch (error) {
            console.error('Get all devices error:', error);
            res.status(500).json({
                success: false,
                error: 'เกิดข้อผิดพลาดในการดึงข้อมูลอุปกรณ์'
            });
        }
    }

    // ดึงข้อมูลอุปกรณ์ตาม ID
    static async getDeviceById(req, res) {
        try {
            const { id } = req.params;
            
            const query = `
                SELECT 
                    id, date_added, station, device_type, device_model, 
                    device_id, serial_number, status, date_used, 
                    vehicle_license, installation_position,
                    notes, created_at, updated_at
                FROM replacement_devices
                WHERE id = $1
            `;
            
            const result = await db.query(query, [id]);
            
            if (result.rows.length === 0) {
                return res.status(404).json({
                    success: false,
                    error: 'ไม่พบอุปกรณ์ที่ต้องการ'
                });
            }

            res.json({
                success: true,
                device: result.rows[0]
            });

        } catch (error) {
            console.error('Get device by ID error:', error);
            res.status(500).json({
                success: false,
                error: 'เกิดข้อผิดพลาดในการดึงข้อมูลอุปกรณ์'
            });
        }
    }

    // เพิ่มอุปกรณ์ทดแทนใหม่
    static async addDevice(req, res) {
        try {
            const {
                station,
                device_type,
                device_model,
                device_id,
                serial_number = '',
                notes = ''
            } = req.body;

            console.log('Adding new device:', req.body);

            // ตรวจสอบข้อมูลที่จำเป็น
            if (!station || !device_type || !device_model || !device_id) {
                return res.status(400).json({
                    success: false,
                    error: 'กรุณากรอกข้อมูลที่จำเป็นให้ครบถ้วน (อู่, ประเภท, รุ่น, Device ID)'
                });
            }

            // ตรวจสอบว่า device_id ไม่ซ้ำ
            const checkQuery = 'SELECT id FROM replacement_devices WHERE device_id = $1';
            const checkResult = await db.query(checkQuery, [device_id.trim()]);
            
            if (checkResult.rows.length > 0) {
                return res.status(400).json({
                    success: false,
                    error: 'Device ID นี้มีในระบบแล้ว'
                });
            }

            // เพิ่มอุปกรณ์ใหม่
            const insertQuery = `
                INSERT INTO replacement_devices (
                    date_added, station, device_type, device_model, 
                    device_id, serial_number, status, notes, created_at
                )
                VALUES (CURRENT_DATE, $1, $2, $3, $4, $5, 'พร้อมใช้', $6, CURRENT_TIMESTAMP)
                RETURNING *
            `;
            
            const result = await db.query(insertQuery, [
                station,
                device_type,
                device_model,
                device_id.trim(),
                serial_number.trim() || null,
                notes.trim()
            ]);

            console.log('Device added successfully:', result.rows[0]);

            // อัปเดตสต็อก
            await DeviceController.updateStockSummary(station, device_model);

            // บันทึก log
            await DeviceController.logDeviceAction(
                result.rows[0].id, 
                'add', 
                null, 
                req.session.user?.id,
                `เพิ่มอุปกรณ์ใหม่: ${device_id}`
            );

            res.json({
                success: true,
                message: 'เพิ่มอุปกรณ์ทดแทนเรียบร้อยแล้ว',
                device: result.rows[0]
            });

        } catch (error) {
            console.error('Add device error:', error);
            res.status(500).json({
                success: false,
                error: 'เกิดข้อผิดพลาดในการเพิ่มอุปกรณ์'
            });
        }
    }

    // แก้ไขข้อมูลอุปกรณ์
    static async updateDevice(req, res) {
        try {
            const { id } = req.params;
            const {
                station,
                device_type,
                device_model,
                device_id,
                serial_number,
                status,
                notes
            } = req.body;

            console.log('Updating device ID:', id, 'with data:', req.body);

            // ตรวจสอบว่าอุปกรณ์มีอยู่
            const checkQuery = 'SELECT * FROM replacement_devices WHERE id = $1';
            const checkResult = await db.query(checkQuery, [id]);
            
            if (checkResult.rows.length === 0) {
                return res.status(404).json({
                    success: false,
                    error: 'ไม่พบอุปกรณ์ที่ต้องการแก้ไข'
                });
            }

            const oldDevice = checkResult.rows[0];

            // ตรวจสอบว่า device_id ไม่ซ้ำ (ถ้ามีการเปลี่ยน)
            if (device_id && device_id !== oldDevice.device_id) {
                const duplicateCheck = 'SELECT id FROM replacement_devices WHERE device_id = $1 AND id != $2';
                const duplicateResult = await db.query(duplicateCheck, [device_id, id]);
                
                if (duplicateResult.rows.length > 0) {
                    return res.status(400).json({
                        success: false,
                        error: 'Device ID นี้มีในระบบแล้ว'
                    });
                }
            }

            // อัปเดตข้อมูล
            const updateQuery = `
                UPDATE replacement_devices 
                SET station = COALESCE($1, station),
                    device_type = COALESCE($2, device_type),
                    device_model = COALESCE($3, device_model),
                    device_id = COALESCE($4, device_id),
                    serial_number = COALESCE($5, serial_number),
                    status = COALESCE($6, status),
                    notes = COALESCE($7, notes),
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = $8
                RETURNING *
            `;
            
            const result = await db.query(updateQuery, [
                station,
                device_type,
                device_model,
                device_id,
                serial_number,
                status,
                notes,
                id
            ]);

            console.log('Device updated successfully:', result.rows[0]);

            // อัปเดตสต็อกทั้งอู่เก่าและใหม่ (ถ้ามีการเปลี่ยนอู่)
            if (station && station !== oldDevice.station) {
                await DeviceController.updateStockSummary(oldDevice.station, oldDevice.device_model);
                await DeviceController.updateStockSummary(station, device_model || oldDevice.device_model);
            } else {
                await DeviceController.updateStockSummary(
                    station || oldDevice.station, 
                    device_model || oldDevice.device_model
                );
            }

            // บันทึก log
            await DeviceController.logDeviceAction(
                id, 
                'update', 
                null, 
                req.session.user?.id,
                `แก้ไขข้อมูลอุปกรณ์: ${device_id || oldDevice.device_id}`
            );

            res.json({
                success: true,
                message: 'อัปเดตข้อมูลอุปกรณ์เรียบร้อยแล้ว',
                device: result.rows[0]
            });

        } catch (error) {
            console.error('Update device error:', error);
            res.status(500).json({
                success: false,
                error: 'เกิดข้อผิดพลาดในการอัปเดตอุปกรณ์'
            });
        }
    }

    // ลบอุปกรณ์
    static async deleteDevice(req, res) {
        try {
            const { id } = req.params;

            console.log('Deleting device ID:', id);

            // ตรวจสอบว่าอุปกรณ์มีอยู่และไม่ได้ใช้งาน
            const checkQuery = 'SELECT * FROM replacement_devices WHERE id = $1';
            const checkResult = await db.query(checkQuery, [id]);
            
            if (checkResult.rows.length === 0) {
                return res.status(404).json({
                    success: false,
                    error: 'ไม่พบอุปกรณ์ที่ต้องการลบ'
                });
            }

            const device = checkResult.rows[0];

            if (device.status === 'ใช้งานแล้ว') {
                return res.status(400).json({
                    success: false,
                    error: 'ไม่สามารถลบอุปกรณ์ที่กำลังใช้งานได้'
                });
            }

            // ลบอุปกรณ์
            const deleteQuery = 'DELETE FROM replacement_devices WHERE id = $1';
            await db.query(deleteQuery, [id]);

            console.log('Device deleted successfully:', device.device_id);

            // อัปเดตสต็อก
            await DeviceController.updateStockSummary(device.station, device.device_model);

            // บันทึก log
            await DeviceController.logDeviceAction(
                id, 
                'delete', 
                null, 
                req.session.user?.id,
                `ลบอุปกรณ์: ${device.device_id}`
            );

            res.json({
                success: true,
                message: 'ลบอุปกรณ์เรียบร้อยแล้ว'
            });

        } catch (error) {
            console.error('Delete device error:', error);
            res.status(500).json({
                success: false,
                error: 'เกิดข้อผิดพลาดในการลบอุปกรณ์'
            });
        }
    }

    // ดึงอุปกรณ์ที่ว่างตามเงื่อนไข
    static async getAvailableDevices(req, res) {
        try {
            const { category, location } = req.query;

            console.log('Getting available devices for category:', category, 'location:', location);

            let query = `
                SELECT 
                    id, station, device_type, device_model, 
                    device_id, serial_number, date_added
                FROM replacement_devices
                WHERE status = 'พร้อมใช้'
            `;
            
            const queryParams = [];
            let paramCount = 0;

            if (category) {
                queryParams.push(category);
                query += ` AND device_type = ${++paramCount}`;
            }

            if (location) {
                queryParams.push(location);
                query += ` AND station = ${++paramCount}`;
            }

            query += ` ORDER BY date_added ASC`;

            const result = await db.query(query, queryParams);

            console.log('Found available devices:', result.rows.length);

            res.json({
                success: true,
                devices: result.rows,
                count: result.rows.length
            });

        } catch (error) {
            console.error('Get available devices error:', error);
            res.status(500).json({
                success: false,
                error: 'เกิดข้อผิดพลาดในการดึงข้อมูลอุปกรณ์ที่ว่าง'
            });
        }
    }

    // ใช้อุปกรณ์ทดแทน
    static async useDevice(req, res) {
        try {
            const { deviceId, vehicleLicense, installationPosition = '' } = req.body;

            console.log('Using device:', { deviceId, vehicleLicense, installationPosition });

            if (!deviceId || !vehicleLicense) {
                return res.status(400).json({
                    success: false,
                    error: 'กรุณาระบุ Device ID และทะเบียนรถ'
                });
            }

            // ตรวจสอบว่าอุปกรณ์ว่างและมีอยู่
            const checkQuery = `
                SELECT * FROM replacement_devices 
                WHERE id = $1 AND status = 'พร้อมใช้'
            `;
            const checkResult = await db.query(checkQuery, [deviceId]);
            
            if (checkResult.rows.length === 0) {
                return res.status(400).json({
                    success: false,
                    error: 'อุปกรณ์นี้ไม่ว่างหรือไม่พบในระบบ'
                });
            }

            const device = checkResult.rows[0];

            // อัปเดตสถานะอุปกรณ์
            const updateQuery = `
                UPDATE replacement_devices 
                SET status = 'ใช้งานแล้ว',
                    date_used = CURRENT_DATE,
                    vehicle_license = $1,
                    installation_position = $2,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = $3
                RETURNING *
            `;
            
            const result = await db.query(updateQuery, [
                vehicleLicense.trim().toUpperCase(),
                installationPosition.trim(),
                deviceId
            ]);

            console.log('Device used successfully:', result.rows[0]);

            // อัปเดตสต็อก
            await DeviceController.updateStockSummary(device.station, device.device_model);

            // บันทึกประวัติการใช้งาน
            await DeviceController.logDeviceAction(deviceId, 'use', vehicleLicense, req.session.user?.id);

            res.json({
                success: true,
                message: `ใช้อุปกรณ์ ${device.device_id} กับรถทะเบียน ${vehicleLicense} เรียบร้อยแล้ว`,
                device: result.rows[0]
            });

        } catch (error) {
            console.error('Use device error:', error);
            res.status(500).json({
                success: false,
                error: 'เกิดข้อผิดพลาดในการใช้อุปกรณ์'
            });
        }
    }

    // คืนอุปกรณ์ (เปลี่ยนสถานะกลับเป็นพร้อมใช้)
  static async returnDevice(req, res) {
    try {
        const { id } = req.params;
        const { notes = '' } = req.body;

        console.log('Returning device ID:', id);

        // ตรวจสอบว่าอุปกรณ์มีอยู่และกำลังใช้งาน
        const checkQuery = `
            SELECT * FROM replacement_devices 
            WHERE id = $1 AND status = 'ใช้งานแล้ว'
        `;
        const checkResult = await db.query(checkQuery, [id]);
        
        if (checkResult.rows.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'ไม่พบอุปกรณ์ที่กำลังใช้งานหรืออุปกรณ์นี้ไม่ได้ใช้งาน'
            });
        }

        const device = checkResult.rows[0];

        // *** เพิ่มเงื่อนไข: เฉพาะเครื่อง Z90 เท่านั้นที่สามารถ return ได้ ***
        if (device.device_type !== 'Z90') {
            return res.status(403).json({
                success: false,
                error: 'เฉพาะเครื่อง Z90 เท่านั้นที่สามารถคืนกลับเข้าสต็อกได้'
            });
        }

        // คืนอุปกรณ์ Z90 กลับเข้าสต็อกของอู่เดิม
        const updateQuery = `
            UPDATE replacement_devices 
            SET status = 'พร้อมใช้',
                date_used = NULL,
                vehicle_license = NULL,
                installation_position = NULL,
                notes = COALESCE($1, notes),
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $2
            RETURNING *
        `;
        
        const result = await db.query(updateQuery, [notes, id]);

        console.log('Z90 device returned successfully:', device.device_id);

        // อัปเดตสต็อกของอู่เดิม
        await DeviceController.updateStockSummary(device.station, device.device_model);

        // บันทึกประวัติการคืน
        await DeviceController.logDeviceAction(
            id, 
            'return', 
            device.vehicle_license, 
            req.session.user?.id,
            `คืนเครื่อง Z90 ${device.device_id} กลับเข้าสต็อกของอู่ ${device.station}`
        );

        res.json({
            success: true,
            message: `คืนเครื่อง Z90 ${device.device_id} กลับเข้าสต็อกของอู่ ${device.station} เรียบร้อยแล้ว`,
            device: result.rows[0]
        });

    } catch (error) {
        console.error('Return device error:', error);
        res.status(500).json({
            success: false,
            error: 'เกิดข้อผิดพลาดในการคืนอุปกรณ์'
        });
    }
}

    // รายงานเครื่องชำรุด
    static async reportDamage(req, res) {
        try {
            const {
                vehicleLicense,
                station,
                deviceType,
                damagedDeviceId,
                damagedSerialNumber = '',
                issueDescription,
                reporterName,
                userInfo = ''
            } = req.body;

            console.log('Reporting damage:', req.body);

            // ตรวจสอบข้อมูลที่จำเป็น
            if (!vehicleLicense || !station || !deviceType || !damagedDeviceId || !issueDescription || !reporterName) {
                return res.status(400).json({
                    success: false,
                    error: 'กรุณากรอกข้อมูลที่จำเป็นให้ครบถ้วน'
                });
            }

            // บันทึกรายงานเครื่องชำรุด
            const insertQuery = `
                INSERT INTO damaged_reports (
                    report_date, vehicle_license, station, device_type,
                    damaged_device_id, damaged_serial_number, issue_description,
                    reporter_name, user_info, created_at
                )
                VALUES (CURRENT_DATE, $1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP)
                RETURNING *
            `;
            
            const result = await db.query(insertQuery, [
                vehicleLicense.trim().toUpperCase(),
                station,
                deviceType,
                damagedDeviceId,
                damagedSerialNumber,
                issueDescription.trim(),
                reporterName.trim(),
                userInfo.trim()
            ]);

            console.log('Damage report created:', result.rows[0]);

            res.json({
                success: true,
                message: 'รายงานเครื่องชำรุดเรียบร้อยแล้ว',
                report: result.rows[0]
            });

        } catch (error) {
            console.error('Report damage error:', error);
            res.status(500).json({
                success: false,
                error: 'เกิดข้อผิดพลาดในการรายงานเครื่องชำรุด'
            });
        }
    }

    // กำหนดอุปกรณ์ทดแทนสำหรับเครื่องชำรุด
    static async assignReplacement(req, res) {
        try {
            const { reportId } = req.params;
            const { replacementDeviceId } = req.body;

            console.log('Assigning replacement device:', { reportId, replacementDeviceId });

            if (!replacementDeviceId) {
                return res.status(400).json({
                    success: false,
                    error: 'กรุณาเลือกอุปกรณ์ทดแทน'
                });
            }

            // ตรวจสอบรายงานเครื่องชำรุด
            const reportCheck = 'SELECT * FROM damaged_reports WHERE id = $1';
            const reportResult = await db.query(reportCheck, [reportId]);
            
            if (reportResult.rows.length === 0) {
                return res.status(404).json({
                    success: false,
                    error: 'ไม่พบรายงานเครื่องชำรุด'
                });
            }

            // ตรวจสอบอุปกรณ์ทดแทน
            const deviceCheck = `
                SELECT * FROM replacement_devices 
                WHERE device_id = $1 AND status = 'พร้อมใช้'
            `;
            const deviceResult = await db.query(deviceCheck, [replacementDeviceId]);
            
            if (deviceResult.rows.length === 0) {
                return res.status(400).json({
                    success: false,
                    error: 'อุปกรณ์ทดแทนไม่ว่างหรือไม่พบในระบบ'
                });
            }

            const device = deviceResult.rows[0];
            const report = reportResult.rows[0];

            // เริ่ม transaction
            await db.query('BEGIN');

            try {
                // อัปเดตรายงานเครื่องชำรุด
                const updateReportQuery = `
                    UPDATE damaged_reports 
                    SET replacement_device_id = $1,
                        replacement_serial_number = $2,
                        replacement_date = CURRENT_DATE
                    WHERE id = $3
                `;
                
                await db.query(updateReportQuery, [
                    device.device_id,
                    device.serial_number,
                    reportId
                ]);

                // อัปเดตสถานะอุปกรณ์ทดแทน
                const updateDeviceQuery = `
                    UPDATE replacement_devices 
                    SET status = 'ใช้งานแล้ว',
                        date_used = CURRENT_DATE,
                        vehicle_license = $1,
                        installation_position = 'ทดแทนเครื่องชำรุด',
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = $2
                `;
                
                await db.query(updateDeviceQuery, [report.vehicle_license, device.id]);

                // อัปเดตสต็อก
                await DeviceController.updateStockSummary(device.station, device.device_model);

                // บันทึก log
                await DeviceController.logDeviceAction(
                    device.id, 
                    'assign_replacement', 
                    report.vehicle_license, 
                    req.session.user?.id,
                    `กำหนดเป็นอุปกรณ์ทดแทนสำหรับรายงาน #${reportId}`
                );

                await db.query('COMMIT');

                console.log('Replacement assigned successfully');

                res.json({
                    success: true,
                    message: `กำหนดอุปกรณ์ ${device.device_id} เป็นตัวทดแทนเรียบร้อยแล้ว`,
                    replacementDevice: device
                });

            } catch (error) {
                await db.query('ROLLBACK');
                throw error;
            }

        } catch (error) {
            console.error('Assign replacement error:', error);
            res.status(500).json({
                success: false,
                error: 'เกิดข้อผิดพลาดในการกำหนดอุปกรณ์ทดแทน'
            });
        }
    }

    // ดึงรายงานเครื่องชำรุด
    static async getDamageReports(req, res) {
        try {
            const { 
                status = 'all',
                station, 
                device_type, 
                date_from, 
                date_to,
                page = 1, 
                limit = 50 
            } = req.query;

            console.log('Getting damage reports with filters:', req.query);

            let query = `
                SELECT 
                    id, report_date, vehicle_license, station, device_type,
                    damaged_device_id, damaged_serial_number, issue_description,
                    reporter_name, user_info, replacement_device_id,
                    replacement_serial_number, replacement_date, created_at
                FROM damaged_reports
                WHERE 1=1
            `;
            
            const queryParams = [];
            let paramCount = 0;

            // เพิ่มเงื่อนไขการกรอง
            if (status === 'pending') {
                query += ` AND replacement_device_id IS NULL`;
            } else if (status === 'resolved') {
                query += ` AND replacement_device_id IS NOT NULL`;
            }

            if (station) {
                queryParams.push(station);
                query += ` AND station = ${++paramCount}`;
            }
            
            if (device_type) {
                queryParams.push(device_type);
                query += ` AND device_type = ${++paramCount}`;
            }

            if (date_from) {
                queryParams.push(date_from);
                query += ` AND report_date >= ${++paramCount}`;
            }

            if (date_to) {
                queryParams.push(date_to);
                query += ` AND report_date <= ${++paramCount}`;
            }

            // เพิ่ม pagination
            const offset = (page - 1) * limit;
            query += ` ORDER BY report_date DESC, id DESC LIMIT ${++paramCount} OFFSET ${++paramCount}`;
            queryParams.push(limit, offset);

            const result = await db.query(query, queryParams);

            console.log('Found damage reports:', result.rows.length);

            res.json({
                success: true,
                reports: result.rows,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total: result.rows.length
                }
            });

        } catch (error) {
            console.error('Get damage reports error:', error);
            res.status(500).json({
                success: false,
                error: 'เกิดข้อผิดพลาดในการดึงรายงานเครื่องชำรุด'
            });
        }
    }

    // ดึงสถิติอุปกรณ์
    static async getDeviceStatistics(req, res) {
        try {
            const { station } = req.query;

            console.log('Getting device statistics for station:', station);

            // สถิติการใช้งานรวม
            let statsQuery = `
                SELECT 
                    COUNT(*) as total_devices,
                    COUNT(CASE WHEN status = 'พร้อมใช้' THEN 1 END) as available_devices,
                    COUNT(CASE WHEN status = 'ใช้งานแล้ว' THEN 1 END) as used_devices,
                    COUNT(CASE WHEN status = 'ซ่อม' THEN 1 END) as repair_devices
                FROM replacement_devices
            `;

            const queryParams = [];
            let paramCount = 0;

            if (station) {
                queryParams.push(station);
                statsQuery += ` WHERE station = ${++paramCount}`;
            }

            const statsResult = await db.query(statsQuery, queryParams);

            // สถิติตามประเภทอุปกรณ์
            let typeStatsQuery = `
                SELECT 
                    device_type,
                    COUNT(*) as total,
                    COUNT(CASE WHEN status = 'พร้อมใช้' THEN 1 END) as available,
                    COUNT(CASE WHEN status = 'ใช้งานแล้ว' THEN 1 END) as used
                FROM replacement_devices
            `;

            if (station) {
                typeStatsQuery += ` WHERE station = $1`;
            }
            
            typeStatsQuery += ` GROUP BY device_type ORDER BY device_type`;

            const typeStatsResult = await db.query(
                typeStatsQuery, 
                station ? [station] : []
            );

            // สถิติรายงานเครื่องชำรุด
            let damageStatsQuery = `
                SELECT 
                    COUNT(*) as total_reports,
                    COUNT(CASE WHEN replacement_device_id IS NOT NULL THEN 1 END) as resolved_reports,
                    COUNT(CASE WHEN replacement_device_id IS NULL THEN 1 END) as pending_reports
                FROM damaged_reports
            `;

            if (station) {
                damageStatsQuery += ` WHERE station = $1`;
            }

            const damageStatsResult = await db.query(
                damageStatsQuery,
                station ? [station] : []
            );

            console.log('Device statistics retrieved successfully');

            res.json({
                success: true,
                statistics: {
                    overall: statsResult.rows[0],
                    by_type: typeStatsResult.rows,
                    damage_reports: damageStatsResult.rows[0]
                }
            });

        } catch (error) {
            console.error('Get device statistics error:', error);
            res.status(500).json({
                success: false,
                error: 'เกิดข้อผิดพลาดในการดึงสถิติ'
            });
        }
    }

    // Helper methods
    static async updateStockSummary(station, deviceModel) {
        try {
            console.log('Updating stock summary for:', station, deviceModel);
            
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
            console.log('Stock summary updated successfully');
            
        } catch (error) {
            console.error('Error updating stock summary:', error);
        }
    }

    static async logDeviceAction(deviceId, actionType, vehicleLicense = null, userId = null, notes = '') {
        try {
            const query = `
                INSERT INTO device_usage_logs (device_id, vehicle_license, action_type, user_id, notes, created_at)
                VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
            `;
            await db.query(query, [deviceId, vehicleLicense, actionType, userId, notes]);
        } catch (error) {
            console.error('Error logging device action:', error);
        }
    }

    // ดึงประเภทอุปกรณ์ทั้งหมด
    static async getDeviceTypes(req, res) {
        try {
            const query = `
                SELECT DISTINCT device_type 
                FROM replacement_devices 
                ORDER BY device_type
            `;
            
            const result = await db.query(query);

            res.json({
                success: true,
                device_types: result.rows.map(row => row.device_type)
            });

        } catch (error) {
            console.error('Get device types error:', error);
            res.status(500).json({
                success: false,
                error: 'เกิดข้อผิดพลาดในการดึงประเภทอุปกรณ์'
            });
        }
    }

    // ดึงรุ่นอุปกรณ์ทั้งหมด
    static async getDeviceModels(req, res) {
        try {
            const { device_type } = req.query;
            
            let query = `
                SELECT DISTINCT device_model 
                FROM replacement_devices
            `;
            
            const queryParams = [];
            
            if (device_type) {
                query += ` WHERE device_type = $1`;
                queryParams.push(device_type);
            }
            
            query += ` ORDER BY device_model`;
            
            const result = await db.query(query, queryParams);

            res.json({
                success: true,
                device_models: result.rows.map(row => row.device_model)
            });

        } catch (error) {
            console.error('Get device models error:', error);
            res.status(500).json({
                success: false,
                error: 'เกิดข้อผิดพลาดในการดึงรุ่นอุปกรณ์'
            });
        }
    }

    // ดึงอุปกรณ์ที่ใช้งานแล้ว
    static async getUsedDevices(req, res) {
        try {
            const { station, vehicle_license } = req.query;

            let query = `
                SELECT 
                    id, station, device_type, device_model, device_id,
                    serial_number, date_used, vehicle_license, installation_position
                FROM replacement_devices
                WHERE status = 'ใช้งานแล้ว'
            `;
            
            const queryParams = [];
            let paramCount = 0;

            if (station) {
                queryParams.push(station);
                query += ` AND station = ${++paramCount}`;
            }

            if (vehicle_license) {
                queryParams.push(vehicle_license.toUpperCase());
                query += ` AND vehicle_license = ${++paramCount}`;
            }

            query += ` ORDER BY date_used DESC`;

            const result = await db.query(query, queryParams);

            res.json({
                success: true,
                devices: result.rows,
                count: result.rows.length
            });

        } catch (error) {
            console.error('Get used devices error:', error);
            res.status(500).json({
                success: false,
                error: 'เกิดข้อผิดพลาดในการดึงข้อมูลอุปกรณ์ที่ใช้งาน'
            });
        }
    }
}

module.exports = DeviceController;