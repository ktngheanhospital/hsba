/**
 * Dịch vụ Tích hợp & Tự động gửi Tin nhắn Zalo cho Bác sĩ / Nhân viên y tế mắc lỗi HSBA
 * Hỗ trợ cả 3 phương thức định danh: Số điện thoại (SĐT), Zalo Username/Zalo ID và Link Zalo cá nhân
 */

import { storage } from './storage.js';
import { formatDateVN, formatDateTimeVN, showToast, escapeHtml } from './utils.js';

export const DEFAULT_ZALO_CONFIG = {
  enabled: true,
  autoReminder: true,
  reminderIntervalHours: 2, // 2 giờ 1 lần
  oaName: 'Tổ Rà Soát HSBA - Bệnh Viện',
  oaId: 'ZALO_OA_HSBA_2026',
  apiKey: '',
  webhookUrl: '',
  messageTemplate: `🏥 [BỆNH VIỆN - CẢNH BÁO RÀ SOÁT HSBA]
Kính gửi: {nguoiNhan} ({khoaPhong})

Hồ sơ bệnh án sau đang có sai sót cần anh/chị xử lý:
• Bệnh nhân: {tenBenhNhan} (Mã: {maKCB})
• Y lệnh lúc: {thoiGianYL}
• Cảnh báo: {mucDoCanhBao}
• Nội dung lỗi: {dienGiaiLoi}

⚠️ Tiến độ hiện tại: {trangThaiLoi}
⏰ Hệ thống tự động gửi tin nhắc nhở mỗi 2 giờ cho đến khi hồ sơ được báo ĐÃ XONG.

Trân trọng!`
};

class ZaloService {
  constructor() {
    this.timerId = null;
    this.initAutoScheduler();
  }

  // Lấy cấu hình Zalo
  getConfig() {
    const customConfig = localStorage.getItem('theo_doi_hsba_zalo_config');
    return customConfig ? { ...DEFAULT_ZALO_CONFIG, ...JSON.parse(customConfig) } : DEFAULT_ZALO_CONFIG;
  }

  // Lưu cấu hình Zalo
  saveConfig(newConfig) {
    localStorage.setItem('theo_doi_hsba_zalo_config', JSON.stringify(newConfig));
    this.initAutoScheduler();
    return true;
  }

  // Tạo nội dung tin nhắn Zalo chuẩn từ bản ghi lỗi
  generateZaloMessage(record, staffMember = null) {
    const config = this.getConfig();
    let template = config.messageTemplate;

    const staffName = staffMember ? staffMember.name : (record.nguoiChiDinh || 'Nhân viên y tế phụ trách');
    const deptName = record.khoaPhong || 'Khoa điều trị';

    template = template
      .replace(/{nguoiNhan}/g, staffName)
      .replace(/{khoaPhong}/g, deptName)
      .replace(/{tenBenhNhan}/g, record.tenBenhNhan || '')
      .replace(/{maKCB}/g, record.maKCB || '')
      .replace(/{thoiGianYL}/g, record.thoiGianChiDinhYL || '')
      .replace(/{mucDoCanhBao}/g, record.mucDoCanhBao || 'Bình thường')
      .replace(/{dienGiaiLoi}/g, record.dienGiaiLoi || '')
      .replace(/{trangThaiLoi}/g, record.trangThaiLoi || 'CHƯA SỬA');

    return template;
  }

  // Lấy thông tin định danh Zalo (Ưu tiên Zalo ID/Username -> Số điện thoại)
  getRecipientTarget(record) {
    const staffList = storage.getStaff();
    const staff = staffList.find(s => s.name === record.nguoiChiDinh);
    if (!staff) return { phone: null, zaloId: null, label: 'Chưa có thông tin' };

    const phone = staff.phone ? staff.phone.replace(/[^0-9]/g, '') : null;
    const zaloId = staff.zaloId ? staff.zaloId.trim() : null;

    let targetLabel = '';
    if (zaloId) targetLabel = `@${zaloId}`;
    else if (phone) targetLabel = `SĐT: ${phone}`;
    else targetLabel = 'Chưa có SĐT/Zalo ID';

    return {
      name: staff.name,
      phone: phone,
      zaloId: zaloId,
      label: targetLabel
    };
  }

  // Tạo đường dẫn chat Zalo trực tiếp: Ưu tiên https://zalo.me/{zaloId} hoặc https://zalo.me/{phone}
  getZaloChatUrl(target) {
    if (!target) return null;
    
    // Nếu có Zalo ID / Username hoặc link Zalo trực tiếp
    if (target.zaloId) {
      if (target.zaloId.startsWith('http')) return target.zaloId;
      return `https://zalo.me/${target.zaloId.replace(/^@/, '')}`;
    }

    // Nếu chỉ có Số điện thoại
    if (target.phone) {
      const cleanPhone = target.phone.replace(/[^0-9]/g, '');
      return `https://zalo.me/${cleanPhone}`;
    }

    return null;
  }

  // Gửi tin nhắn Zalo cho 1 bản ghi lỗi
  sendZaloNotification(recordId, isAuto = false) {
    const record = storage.getRecords().find(r => r.id === recordId);
    if (!record) return { success: false, message: 'Không tìm thấy hồ sơ lỗi!' };

    if (record.trangThaiLoi === 'ĐÃ XONG' || record.trangThaiKiemDuyet === 'ĐÃ SỬA' || record.chotRaVien) {
      return { success: false, message: 'Lỗi này đã hoàn thành hoặc hồ sơ đã chốt ra viện, không cần gửi tin Zalo!' };
    }

    const staffList = storage.getStaff();
    const staff = staffList.find(s => s.name === record.nguoiChiDinh);
    const target = this.getRecipientTarget(record);

    const messageContent = this.generateZaloMessage(record, staff);
    const nowStr = new Date().toISOString().replace('T', ' ').substring(0, 16);

    const zaloHistory = record.zaloHistory || [];
    const newLog = {
      id: 'ZL-' + Date.now().toString(36),
      time: nowStr,
      recipientName: staff ? staff.name : (record.nguoiChiDinh || '---'),
      phone: target.phone || '---',
      zaloId: target.zaloId || '---',
      targetLabel: target.label,
      isAuto: isAuto,
      content: messageContent
    };
    zaloHistory.unshift(newLog);

    const updates = {
      lastZaloSentAt: nowStr,
      zaloSentCount: (record.zaloSentCount || 0) + 1,
      zaloHistory: zaloHistory
    };

    storage.updateRecord(record.id, updates);
    this.logSystemZaloMessage(newLog, record);

    return {
      success: true,
      target: target,
      chatUrl: this.getZaloChatUrl(target),
      recipientName: staff ? staff.name : record.nguoiChiDinh,
      messageContent: messageContent,
      sentCount: updates.zaloSentCount
    };
  }

  // Lưu nhật ký toàn hệ thống
  logSystemZaloMessage(logItem, record) {
    try {
      const logsStr = localStorage.getItem('theo_doi_hsba_zalo_logs');
      let logs = logsStr ? JSON.parse(logsStr) : [];
      logs.unshift({
        ...logItem,
        recordId: record.id,
        maKCB: record.maKCB,
        tenBenhNhan: record.tenBenhNhan,
        khoaPhong: record.khoaPhong
      });
      if (logs.length > 200) logs = logs.slice(0, 200);
      localStorage.setItem('theo_doi_hsba_zalo_logs', JSON.stringify(logs));
    } catch (e) {
      console.error('Lỗi khi lưu Zalo log:', e);
    }
  }

  // Lấy danh sách nhật ký gửi tin Zalo
  getSystemZaloLogs() {
    try {
      const logsStr = localStorage.getItem('theo_doi_hsba_zalo_logs');
      return logsStr ? JSON.parse(logsStr) : [];
    } catch (e) {
      return [];
    }
  }

  // Khởi động Bộ hẹn giờ tự động kiểm tra và gửi tin Zalo mỗi 2 giờ
  initAutoScheduler() {
    if (this.timerId) {
      clearInterval(this.timerId);
      this.timerId = null;
    }

    const config = this.getConfig();
    if (!config.enabled || !config.autoReminder) return;

    this.timerId = setInterval(() => {
      this.checkAndDispatchAutoReminders();
    }, 60 * 1000);

    setTimeout(() => {
      this.checkAndDispatchAutoReminders();
    }, 3000);
  }

  // Quét các lỗi chưa hoàn thành và kiểm tra xem đã qua 2 giờ chưa
  checkAndDispatchAutoReminders() {
    const config = this.getConfig();
    if (!config.enabled || !config.autoReminder) return;

    const intervalMs = (config.reminderIntervalHours || 2) * 60 * 60 * 1000;
    const now = Date.now();
    const records = storage.getRecords();

    let autoSentCount = 0;

    records.forEach(record => {
      const isResolved = record.trangThaiLoi === 'ĐÃ XONG' || record.trangThaiKiemDuyet === 'ĐÃ SỬA' || record.chotRaVien;
      if (isResolved) return;

      let needSend = false;
      if (!record.lastZaloSentAt) {
        needSend = true;
      } else {
        const lastSentTime = new Date(record.lastZaloSentAt.replace(' ', 'T')).getTime();
        if (now - lastSentTime >= intervalMs) {
          needSend = true;
        }
      }

      if (needSend) {
        this.sendZaloNotification(record.id, true);
        autoSentCount++;
      }
    });

    if (autoSentCount > 0) {
      console.log(`[Zalo Service] Đã tự động gửi ${autoSentCount} tin nhắn Zalo định kỳ (2 giờ/lần).`);
      if (window.hsbaApp && typeof window.hsbaApp.refreshAllViews === 'function') {
        window.hsbaApp.refreshAllViews();
      }
    }
  }
}

export const zaloService = new ZaloService();
