// controllers/authController.js
const bcrypt = require('bcryptjs');
const db = require('../config/database');

class AuthController {
    // เข้าสู่ระบบ
    static async login(req, res) {
        const { username, password } = req.body;
        
        try {
            // ตรวจสอบข้อมูลที่ส่งมา
            if (!username || !password) {
                return res.status(400).json({
                    success: false,
                    error: 'กรุณากรอกชื่อผู้ใช้งานและรหัสผ่าน'
                });
            }

            console.log('Login attempt for username:', username);

            // ค้นหาผู้ใช้งานในฐานข้อมูล
            const query = 'SELECT * FROM users WHERE username = $1 AND is_active = true';
            const result = await db.query(query, [username.toLowerCase().trim()]);
            
            if (result.rows.length === 0) {
                console.log('User not found:', username);
                return res.status(401).json({
                    success: false,
                    error: 'ชื่อผู้ใช้งานหรือรหัสผ่านไม่ถูกต้อง'
                });
            }
            
            const user = result.rows[0];
            console.log('User found:', user.username);
            
            // ตรวจสอบรหัสผ่าน
            const isValidPassword = await bcrypt.compare(password, user.password);
            
            if (!isValidPassword) {
                console.log('Invalid password for user:', username);
                // บันทึก login attempt ที่ไม่สำเร็จ
                await AuthController.logLoginAttempt(user.id, req.ip, false, req.get('User-Agent'));
                
                return res.status(401).json({
                    success: false,
                    error: 'ชื่อผู้ใช้งานหรือรหัสผ่านไม่ถูกต้อง'
                });
            }
            
            console.log('Login successful for user:', username);
            
            // อัปเดตเวลาเข้าสู่ระบบล่าสุด
            await db.query(
                'UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = $1',
                [user.id]
            );
            
            // บันทึก login attempt ที่สำเร็จ
            await AuthController.logLoginAttempt(user.id, req.ip, true, req.get('User-Agent'));
            
            // สร้าง session
            req.session.user = {
                id: user.id,
                username: user.username,
                role: user.role,
                full_name: user.full_name,
                email: user.email,
                last_login: user.last_login
            };
            
            console.log('Session created for user:', username);
            
            // ส่งข้อมูลผู้ใช้งานกลับ (ไม่รวมรหัสผ่าน)
            const userResponse = {
                id: user.id,
                username: user.username,
                role: user.role,
                full_name: user.full_name,
                email: user.email,
                last_login: user.last_login
            };
            
            res.json({
                success: true,
                message: 'เข้าสู่ระบบสำเร็จ',
                user: userResponse
            });
            
        } catch (error) {
            console.error('Login error:', error);
            res.status(500).json({
                success: false,
                error: 'เกิดข้อผิดพลาดในระบบ กรุณาลองใหม่อีกครั้ง'
            });
        }
    }

    // ออกจากระบบ
    static async logout(req, res) {
        try {
            if (req.session.user) {
                console.log('Logout user:', req.session.user.username);
                // บันทึก logout
                await AuthController.logLogout(req.session.user.id, req.ip);
            }
            
            req.session.destroy((err) => {
                if (err) {
                    console.error('Session destroy error:', err);
                    return res.status(500).json({
                        success: false,
                        error: 'ไม่สามารถออกจากระบบได้'
                    });
                }
                
                res.clearCookie('connect.sid'); // ล้าง session cookie
                res.json({
                    success: true,
                    message: 'ออกจากระบบเรียบร้อยแล้ว'
                });
            });
            
        } catch (error) {
            console.error('Logout error:', error);
            res.status(500).json({
                success: false,
                error: 'เกิดข้อผิดพลาดในการออกจากระบบ'
            });
        }
    }

    // ตรวจสอบสถานะการเข้าสู่ระบบ
    static async checkAuth(req, res) {
        try {
            if (req.session.user) {
                // ตรวจสอบว่าผู้ใช้งานยังมีอยู่ในระบบหรือไม่
                const query = 'SELECT id, username, role, full_name, email, last_login FROM users WHERE id = $1 AND is_active = true';
                const result = await db.query(query, [req.session.user.id]);
                
                if (result.rows.length === 0) {
                    // ผู้ใช้งานถูกลบหรือปิดการใช้งาน
                    req.session.destroy();
                    return res.json({
                        authenticated: false,
                        message: 'บัญชีผู้ใช้งานถูกปิดการใช้งาน'
                    });
                }
                
                res.json({
                    authenticated: true,
                    user: result.rows[0]
                });
            } else {
                res.json({
                    authenticated: false
                });
            }
        } catch (error) {
            console.error('Auth check error:', error);
            res.status(500).json({
                authenticated: false,
                error: 'เกิดข้อผิดพลาดในการตรวจสอบสิทธิ์'
            });
        }
    }

    // เปลี่ยนรหัสผ่าน
    static async changePassword(req, res) {
        const { currentPassword, newPassword, confirmPassword } = req.body;
        
        try {
            // ตรวจสอบข้อมูลที่ส่งมา
            if (!currentPassword || !newPassword || !confirmPassword) {
                return res.status(400).json({
                    success: false,
                    error: 'กรุณากรอกข้อมูลให้ครบถ้วน'
                });
            }

            if (newPassword !== confirmPassword) {
                return res.status(400).json({
                    success: false,
                    error: 'รหัสผ่านใหม่และการยืนยันรหัสผ่านไม่ตรงกัน'
                });
            }

            if (newPassword.length < 6) {
                return res.status(400).json({
                    success: false,
                    error: 'รหัสผ่านใหม่ต้องมีความยาวอย่างน้อย 6 ตัวอักษร'
                });
            }

            // ตรวจสอบรหัสผ่านปัจจุบัน
            const query = 'SELECT password FROM users WHERE id = $1';
            const result = await db.query(query, [req.session.user.id]);
            
            if (result.rows.length === 0) {
                return res.status(404).json({
                    success: false,
                    error: 'ไม่พบข้อมูลผู้ใช้งาน'
                });
            }

            const user = result.rows[0];
            const isValidCurrentPassword = await bcrypt.compare(currentPassword, user.password);
            
            if (!isValidCurrentPassword) {
                return res.status(401).json({
                    success: false,
                    error: 'รหัสผ่านปัจจุบันไม่ถูกต้อง'
                });
            }

            // เข้ารหัสรหัสผ่านใหม่
            const saltRounds = 12;
            const hashedNewPassword = await bcrypt.hash(newPassword, saltRounds);

            // อัปเดตรหัสผ่านในฐานข้อมูล
            await db.query(
                'UPDATE users SET password = $1, password_changed_at = CURRENT_TIMESTAMP WHERE id = $2',
                [hashedNewPassword, req.session.user.id]
            );

            // บันทึก log การเปลี่ยนรหัสผ่าน
            await AuthController.logPasswordChange(req.session.user.id, req.ip);

            res.json({
                success: true,
                message: 'เปลี่ยนรหัสผ่านเรียบร้อยแล้ว'
            });
            
        } catch (error) {
            console.error('Change password error:', error);
            res.status(500).json({
                success: false,
                error: 'เกิดข้อผิดพลาดในการเปลี่ยนรหัสผ่าน'
            });
        }
    }

    // อัปเดตข้อมูลโปรไฟล์
    static async updateProfile(req, res) {
        const { full_name, email } = req.body;
        
        try {
            if (!full_name || !email) {
                return res.status(400).json({
                    success: false,
                    error: 'กรุณากรอกข้อมูลให้ครบถ้วน'
                });
            }

            // ตรวจสอบรูปแบบอีเมล
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(email)) {
                return res.status(400).json({
                    success: false,
                    error: 'รูปแบบอีเมลไม่ถูกต้อง'
                });
            }

            // ตรวจสอบว่าอีเมลนี้ถูกใช้โดยผู้ใช้งานอื่นหรือไม่
            const emailCheckQuery = 'SELECT id FROM users WHERE email = $1 AND id != $2';
            const emailCheckResult = await db.query(emailCheckQuery, [email, req.session.user.id]);
            
            if (emailCheckResult.rows.length > 0) {
                return res.status(400).json({
                    success: false,
                    error: 'อีเมลนี้ถูกใช้งานแล้ว'
                });
            }

            // อัปเดตข้อมูลโปรไฟล์
            const updateQuery = `
                UPDATE users 
                SET full_name = $1, email = $2, updated_at = CURRENT_TIMESTAMP 
                WHERE id = $3
                RETURNING id, username, role, full_name, email
            `;
            
            const result = await db.query(updateQuery, [full_name.trim(), email.trim(), req.session.user.id]);
            
            if (result.rows.length === 0) {
                return res.status(404).json({
                    success: false,
                    error: 'ไม่พบข้อมูลผู้ใช้งาน'
                });
            }

            // อัปเดต session
            req.session.user = {
                ...req.session.user,
                full_name: result.rows[0].full_name,
                email: result.rows[0].email
            };

            res.json({
                success: true,
                message: 'อัปเดตข้อมูลโปรไฟล์เรียบร้อยแล้ว',
                user: result.rows[0]
            });
            
        } catch (error) {
            console.error('Update profile error:', error);
            res.status(500).json({
                success: false,
                error: 'เกิดข้อผิดพลาดในการอัปเดตข้อมูล'
            });
        }
    }

    // ดึงข้อมูลโปรไฟล์
    static async getProfile(req, res) {
        try {
            const query = `
                SELECT id, username, role, full_name, email, last_login, created_at
                FROM users 
                WHERE id = $1
            `;
            
            const result = await db.query(query, [req.session.user.id]);
            
            if (result.rows.length === 0) {
                return res.status(404).json({
                    success: false,
                    error: 'ไม่พบข้อมูลผู้ใช้งาน'
                });
            }

            res.json({
                success: true,
                user: result.rows[0]
            });
            
        } catch (error) {
            console.error('Get profile error:', error);
            res.status(500).json({
                success: false,
                error: 'เกิดข้อผิดพลาดในการดึงข้อมูล'
            });
        }
    }

    // ดึงประวัติการเข้าสู่ระบบ
    static async getLoginHistory(req, res) {
        try {
            const query = `
                SELECT 
                    login_time,
                    logout_time,
                    ip_address,
                    success,
                    user_agent
                FROM user_login_logs 
                WHERE user_id = $1 
                ORDER BY login_time DESC 
                LIMIT 20
            `;
            
            const result = await db.query(query, [req.session.user.id]);

            res.json({
                success: true,
                history: result.rows
            });
            
        } catch (error) {
            console.error('Get login history error:', error);
            res.status(500).json({
                success: false,
                error: 'เกิดข้อผิดพลาดในการดึงประวัติ'
            });
        }
    }

    // สำหรับ Admin: จัดการผู้ใช้งาน
    static async getUsers(req, res) {
        try {
            // ตรวจสอบสิทธิ์ Admin
            if (req.session.user.role !== 'admin') {
                return res.status(403).json({
                    success: false,
                    error: 'ไม่มีสิทธิ์เข้าถึงข้อมูลนี้'
                });
            }

            const query = `
                SELECT 
                    id, username, role, full_name, email, 
                    last_login, is_active, created_at
                FROM users 
                ORDER BY created_at DESC
            `;
            
            const result = await db.query(query);

            res.json({
                success: true,
                users: result.rows
            });
            
        } catch (error) {
            console.error('Get users error:', error);
            res.status(500).json({
                success: false,
                error: 'เกิดข้อผิดพลาดในการดึงข้อมูลผู้ใช้งาน'
            });
        }
    }

    // สำหรับ Admin: เพิ่มผู้ใช้งานใหม่
    static async createUser(req, res) {
        const { username, password, role, full_name, email } = req.body;
        
        try {
            // ตรวจสอบสิทธิ์ Admin
            if (req.session.user.role !== 'admin') {
                return res.status(403).json({
                    success: false,
                    error: 'ไม่มีสิทธิ์ในการสร้างผู้ใช้งาน'
                });
            }

            // ตรวจสอบข้อมูลที่ส่งมา
            if (!username || !password || !role || !full_name || !email) {
                return res.status(400).json({
                    success: false,
                    error: 'กรุณากรอกข้อมูลให้ครบถ้วน'
                });
            }

            // ตรวจสอบว่า username และ email ไม่ซ้ำ
            const checkQuery = 'SELECT id FROM users WHERE username = $1 OR email = $2';
            const checkResult = await db.query(checkQuery, [username.toLowerCase().trim(), email.trim()]);
            
            if (checkResult.rows.length > 0) {
                return res.status(400).json({
                    success: false,
                    error: 'ชื่อผู้ใช้งานหรืออีเมลนี้ถูกใช้งานแล้ว'
                });
            }

            // เข้ารหัสรหัสผ่าน
            const saltRounds = 12;
            const hashedPassword = await bcrypt.hash(password, saltRounds);

            // เพิ่มผู้ใช้งานใหม่
            const insertQuery = `
                INSERT INTO users (username, password, role, full_name, email, is_active)
                VALUES ($1, $2, $3, $4, $5, true)
                RETURNING id, username, role, full_name, email, created_at
            `;
            
            const result = await db.query(insertQuery, [
                username.toLowerCase().trim(),
                hashedPassword,
                role,
                full_name.trim(),
                email.trim()
            ]);

            res.json({
                success: true,
                message: 'สร้างผู้ใช้งานเรียบร้อยแล้ว',
                user: result.rows[0]
            });
            
        } catch (error) {
            console.error('Create user error:', error);
            res.status(500).json({
                success: false,
                error: 'เกิดข้อผิดพลาดในการสร้างผู้ใช้งาน'
            });
        }
    }

    // Helper methods
    static async logLoginAttempt(userId, ipAddress, success, userAgent = '') {
        try {
            const query = `
                INSERT INTO user_login_logs (user_id, ip_address, success, user_agent, login_time)
                VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
            `;
            await db.query(query, [userId, ipAddress, success, userAgent]);
        } catch (error) {
            console.error('Error logging login attempt:', error);
        }
    }

    static async logLogout(userId, ipAddress) {
        try {
            const query = `
                UPDATE user_login_logs 
                SET logout_time = CURRENT_TIMESTAMP
                WHERE user_id = $1 AND logout_time IS NULL AND ip_address = $2
                ORDER BY login_time DESC 
                LIMIT 1
            `;
            await db.query(query, [userId, ipAddress]);
        } catch (error) {
            console.error('Error logging logout:', error);
        }
    }

    static async logPasswordChange(userId, ipAddress) {
        try {
            const query = `
                INSERT INTO user_activity_logs (user_id, activity_type, ip_address, description, created_at)
                VALUES ($1, 'password_change', $2, 'Password changed successfully', CURRENT_TIMESTAMP)
            `;
            await db.query(query, [userId, ipAddress]);
        } catch (error) {
            console.error('Error logging password change:', error);
        }
    }
}

module.exports = AuthController;