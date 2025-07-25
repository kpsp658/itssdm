// public/js/main.js
// Global JavaScript functions for ITS Device Management System

// Global variables
let currentUser = null;
let isAuthenticated = false;

// Initialize application
document.addEventListener('DOMContentLoaded', function() {
    initializeApp();
});

async function initializeApp() {
    try {
        // Check authentication status
        await checkAuthenticationStatus();
        
        // Initialize common features
        initializeNotifications();
        initializeTheme();
        
        console.log('✅ Application initialized successfully');
    } catch (error) {
        console.error('❌ Error initializing application:', error);
    }
}

// Authentication functions
async function checkAuthenticationStatus() {
    try {
        const response = await fetch('/api/auth/check');
        const data = await response.json();
        
        if (data.authenticated) {
            currentUser = data.user;
            isAuthenticated = true;
            updateUserInterface();
        } else {
            // Redirect to login if not on login page
            if (!window.location.pathname.includes('login')) {
                window.location.href = '/login';
            }
        }
    } catch (error) {
        console.error('Authentication check failed:', error);
        if (!window.location.pathname.includes('login')) {
            window.location.href = '/login';
        }
    }
}

function updateUserInterface() {
    // Update user info in navigation
    const userElements = document.querySelectorAll('[data-user-name]');
    userElements.forEach(element => {
        element.textContent = currentUser?.username || 'ผู้ใช้งาน';
    });

    // Show/hide admin-only elements
    const adminElements = document.querySelectorAll('[data-admin-only]');
    adminElements.forEach(element => {
        element.style.display = currentUser?.role === 'admin' ? 'block' : 'none';
    });
}

async function logout() {
    try {
        const response = await fetch('/api/auth/logout', { method: 'POST' });
        const data = await response.json();
        
        if (data.success) {
            currentUser = null;
            isAuthenticated = false;
            window.location.href = '/login';
        }
    } catch (error) {
        console.error('Logout error:', error);
        // Force redirect to login even if logout fails
        window.location.href = '/login';
    }
}

// Notification system
function initializeNotifications() {
    // Create notification container if not exists
    if (!document.getElementById('notificationContainer')) {
        const container = document.createElement('div');
        container.id = 'notificationContainer';
        container.className = 'notification-container';
        document.body.appendChild(container);
    }
}

function showNotification(message, type = 'info', duration = 5000) {
    const container = document.getElementById('notificationContainer');
    if (!container) return;

    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    
    const icons = {
        success: 'fas fa-check-circle',
        error: 'fas fa-exclamation-circle',
        warning: 'fas fa-exclamation-triangle',
        info: 'fas fa-info-circle'
    };

    notification.innerHTML = `
        <i class="${icons[type] || icons.info}"></i>
        <span class="notification-message">${message}</span>
        <button class="notification-close" onclick="closeNotification(this)">
            <i class="fas fa-times"></i>
        </button>
    `;

    container.appendChild(notification);

    // Animate in
    setTimeout(() => {
        notification.classList.add('show');
    }, 100);

    // Auto remove
    if (duration > 0) {
        setTimeout(() => {
            closeNotification(notification.querySelector('.notification-close'));
        }, duration);
    }
}

function closeNotification(closeBtn) {
    const notification = closeBtn.closest('.notification');
    notification.classList.remove('show');
    
    setTimeout(() => {
        notification.remove();
    }, 300);
}

// Theme management
function initializeTheme() {
    const savedTheme = localStorage.getItem('its-theme') || 'light';
    applyTheme(savedTheme);
}

function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';
    applyTheme(newTheme);
}

function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('its-theme', theme);
    
    // Update theme toggle button
    const themeToggle = document.getElementById('themeToggle');
    if (themeToggle) {
        const icon = themeToggle.querySelector('i');
        if (icon) {
            icon.className = theme === 'light' ? 'fas fa-moon' : 'fas fa-sun';
        }
    }
}

// Utility functions
function formatDate(dateString, includeTime = false) {
    if (!dateString) return '-';
    
    const date = new Date(dateString);
    const options = {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        timeZone: 'Asia/Bangkok'
    };
    
    if (includeTime) {
        options.hour = '2-digit';
        options.minute = '2-digit';
    }
    
    return date.toLocaleDateString('th-TH', options);
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function formatNumber(num) {
    return new Intl.NumberFormat('th-TH').format(num);
}

function formatCurrency(amount, currency = 'THB') {
    return new Intl.NumberFormat('th-TH', {
        style: 'currency',
        currency: currency
    }).format(amount);
}

// API helper functions
async function apiRequest(url, options = {}) {
    const defaultOptions = {
        headers: {
            'Content-Type': 'application/json',
        },
    };

    const requestOptions = {
        ...defaultOptions,
        ...options,
        headers: {
            ...defaultOptions.headers,
            ...options.headers,
        },
    };

    try {
        const response = await fetch(url, requestOptions);
        
        if (!response.ok) {
            if (response.status === 401) {
                // Unauthorized - redirect to login
                window.location.href = '/login';
                return;
            }
            
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
        }

        return await response.json();
    } catch (error) {
        console.error('API request failed:', error);
        throw error;
    }
}

async function apiGet(url) {
    return await apiRequest(url, { method: 'GET' });
}

async function apiPost(url, data) {
    return await apiRequest(url, {
        method: 'POST',
        body: JSON.stringify(data),
    });
}

async function apiPut(url, data) {
    return await apiRequest(url, {
        method: 'PUT',
        body: JSON.stringify(data),
    });
}

async function apiDelete(url) {
    return await apiRequest(url, { method: 'DELETE' });
}

// Loading states
function showLoading(element, message = 'กำลังโหลด...') {
    if (typeof element === 'string') {
        element = document.getElementById(element);
    }
    
    if (!element) return;
    
    element.innerHTML = `
        <div class="loading-state">
            <div class="spinner"></div>
            <span class="loading-message">${message}</span>
        </div>
    `;
}

function hideLoading(element) {
    if (typeof element === 'string') {
        element = document.getElementById(element);
    }
    
    if (!element) return;
    
    const loadingState = element.querySelector('.loading-state');
    if (loadingState) {
        loadingState.remove();
    }
}

// Form helpers
function validateForm(formElement) {
    const requiredFields = formElement.querySelectorAll('[required]');
    let isValid = true;
    
    requiredFields.forEach(field => {
        const value = field.value.trim();
        const fieldGroup = field.closest('.form-group');
        
        // Remove existing error messages
        const existingError = fieldGroup?.querySelector('.field-error');
        if (existingError) {
            existingError.remove();
        }
        
        if (!value) {
            isValid = false;
            field.classList.add('error');
            
            if (fieldGroup) {
                const errorMessage = document.createElement('div');
                errorMessage.className = 'field-error';
                errorMessage.textContent = 'กรุณากรอกข้อมูลให้ครบถ้วน';
                fieldGroup.appendChild(errorMessage);
            }
        } else {
            field.classList.remove('error');
        }
    });
    
    return isValid;
}

function resetForm(formElement) {
    if (typeof formElement === 'string') {
        formElement = document.getElementById(formElement);
    }
    
    if (!formElement) return;
    
    formElement.reset();
    
    // Remove error states
    formElement.querySelectorAll('.error').forEach(field => {
        field.classList.remove('error');
    });
    
    // Remove error messages
    formElement.querySelectorAll('.field-error').forEach(error => {
        error.remove();
    });
}

// Modal helpers
function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.style.display = 'block';
        document.body.style.overflow = 'hidden';
        
        // Focus first input
        const firstInput = modal.querySelector('input, select, textarea');
        if (firstInput) {
            setTimeout(() => {
                firstInput.focus();
            }, 100);
        }
    }
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.style.display = 'none';
        document.body.style.overflow = 'auto';
    }
}

// Close modal when clicking outside
document.addEventListener('click', function(event) {
    if (event.target.classList.contains('modal')) {
        closeModal(event.target.id);
    }
});

// Close modal with Escape key
document.addEventListener('keydown', function(event) {
    if (event.key === 'Escape') {
        const openModals = document.querySelectorAll('.modal[style*="block"]');
        openModals.forEach(modal => {
            closeModal(modal.id);
        });
    }
});

// Export functions
function exportToCSV(data, filename = 'export') {
    if (!data || data.length === 0) {
        showNotification('ไม่มีข้อมูลสำหรับ Export', 'warning');
        return;
    }

    const headers = Object.keys(data[0]);
    const csvContent = [
        headers.join(','),
        ...data.map(row => headers.map(header => {
            const value = row[header] || '';
            // Escape commas and quotes
            return typeof value === 'string' && (value.includes(',') || value.includes('"')) 
                ? `"${value.replace(/"/g, '""')}"` 
                : value;
        }).join(','))
    ].join('\n');

    downloadFile(csvContent, `${filename}.csv`, 'text/csv');
}

function downloadFile(content, filename, mimeType) {
    const blob = new Blob(['\ufeff' + content], { type: `${mimeType};charset=utf-8;` });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    URL.revokeObjectURL(url);
}

// Debounce function for search inputs
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Confirmation dialogs
function confirmAction(message, callback, options = {}) {
    const defaultOptions = {
        confirmText: 'ยืนยัน',
        cancelText: 'ยกเลิก',
        type: 'warning'
    };
    
    const opts = { ...defaultOptions, ...options };
    
    if (confirm(message)) {
        if (typeof callback === 'function') {
            callback();
        }
        return true;
    }
    return false;
}

// Local storage helpers
function setStorage(key, value) {
    try {
        localStorage.setItem(`its-${key}`, JSON.stringify(value));
    } catch (error) {
        console.error('Error saving to localStorage:', error);
    }
}

function getStorage(key, defaultValue = null) {
    try {
        const item = localStorage.getItem(`its-${key}`);
        return item ? JSON.parse(item) : defaultValue;
    } catch (error) {
        console.error('Error reading from localStorage:', error);
        return defaultValue;
    }
}

function removeStorage(key) {
    try {
        localStorage.removeItem(`its-${key}`);
    } catch (error) {
        console.error('Error removing from localStorage:', error);
    }
}

// Network status monitoring
function initializeNetworkMonitoring() {
    window.addEventListener('online', function() {
        showNotification('กลับมาออนไลน์แล้ว', 'success', 3000);
    });

    window.addEventListener('offline', function() {
        showNotification('การเชื่อมต่อขาดหาย กรุณาตรวจสอบอินเทอร์เน็ต', 'error', 0);
    });
}

// Initialize network monitoring
initializeNetworkMonitoring();

// Print helpers
function printElement(elementId, title = 'ITS Device Management') {
    const element = document.getElementById(elementId);
    if (!element) return;

    const printWindow = window.open('', '_blank');
    const printContent = element.innerHTML;
    
    printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>${title}</title>
            <meta charset="UTF-8">
            <style>
                body {
                    font-family: 'Kanit', Arial, sans-serif;
                    margin: 20px;
                    color: #333;
                    line-height: 1.6;
                }
                .print-header {
                    text-align: center;
                    margin-bottom: 30px;
                    padding-bottom: 20px;
                    border-bottom: 2px solid #333;
                }
                .print-header h1 {
                    margin: 0;
                    color: #667eea;
                    font-size: 1.8rem;
                }
                .print-header p {
                    margin: 5px 0;
                    color: #666;
                }
                table {
                    width: 100%;
                    border-collapse: collapse;
                    margin: 20px 0;
                }
                th, td {
                    border: 1px solid #ddd;
                    padding: 8px;
                    text-align: left;
                    font-size: 0.9rem;
                }
                th {
                    background-color: #f8fafc;
                    font-weight: bold;
                }
                @media print {
                    body { margin: 0; }
                    .print-header { page-break-after: avoid; }
                    .no-print { display: none !important; }
                }
            </style>
        </head>
        <body>
            <div class="print-header">
                <h1>${title}</h1>
                <p>วันที่พิมพ์: ${formatDate(new Date(), true)}</p>
            </div>
            ${printContent}
        </body>
        </html>
    `);
    
    printWindow.document.close();
    
    setTimeout(() => {
        printWindow.print();
        printWindow.close();
    }, 250);
}

// Console welcome message
console.log(`
🎯 ITS Device Management System
📅 Version: 1.0.0
🏢 Organization: TSBG
👨‍💻 Powered by: Node.js + PostgreSQL

🔧 Debug Functions Available:
- showNotification(message, type)
- exportToCSV(data, filename)
- printElement(elementId)
- toggleTheme()

📞 Support: its@thaismilebus.com
`);

// Export functions for global access
window.ITSApp = {
    // Authentication
    checkAuthenticationStatus,
    logout,
    currentUser: () => currentUser,
    isAuthenticated: () => isAuthenticated,
    
    // UI
    showNotification,
    closeNotification,
    toggleTheme,
    openModal,
    closeModal,
    
    // Forms
    validateForm,
    resetForm,
    
    // API
    apiGet,
    apiPost,
    apiPut,
    apiDelete,
    
    // Utilities
    formatDate,
    formatFileSize,
    formatNumber,
    formatCurrency,
    debounce,
    confirmAction,
    
    // Storage
    setStorage,
    getStorage,
    removeStorage,
    
    // Export/Print
    exportToCSV,
    downloadFile,
    printElement,
    
    // Loading states
    showLoading,
    hideLoading
};