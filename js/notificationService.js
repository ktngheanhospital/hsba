/**
 * Dịch vụ Thông Báo Đẩy (Push Notification Service)
 * Quản lý Thông báo đẩy trên trình duyệt (Web Push Notification API),
 * Âm thanh cảnh báo y tế (Web Audio API), Trung tâm thông báo người dùng và Bộ hẹn giờ nhắc nhở tự động
 */

import { storage } from './storage.js';
import { showToast, escapeHtml } from './utils.js';

export const DEFAULT_PUSH_CONFIG = {
  enabled: true,
  soundEnabled: true,
  browserPushEnabled: true,
  autoReminder: true,
  reminderIntervalHours: 2, // 2 giờ nhắc 1 lần
  senderName: 'Tổ Rà Soát HSBA - Bệnh Viện',
  titleTemplate: '🚨 [CẢNH BÁO HSBA] {tenBenhNhan} - {mucDoCanhBao}',
  messageTemplate: 'Bác sĩ {nguoiNhan} ({khoaPhong}) có sai sót HSBA cần khắc phục: {dienGiaiLoi} (Y lệnh: {thoiGianYL}). Trạng thái: {trangThaiLoi}'
};

const PUSH_STORAGE_KEYS = {
  CONFIG: 'theo_doi_hsba_push_config',
  INBOX: 'theo_doi_hsba_push_notifications',
  LOGS: 'theo_doi_hsba_push_logs'
};

class NotificationService {
  constructor() {
    this.timerId = null;
    this.audioCtx = null;
    this.listeners = [];
    this.initAutoScheduler();
  }

  // Đăng ký listener khi có thông báo mới (để cập nhật UI chuông thông báo)
  subscribe(callback) {
    if (typeof callback === 'function' && !this.listeners.includes(callback)) {
      this.listeners.push(callback);
    }
  }

  addListener(callback) {
    this.subscribe(callback);
  }

  removeListener(callback) {
    this.listeners = this.listeners.filter(fn => fn !== callback);
  }

  notifyListeners() {
    this.listeners.forEach(fn => {
      try { fn(); } catch (e) { console.error('Notification listener error:', e); }
    });
  }

  // Lấy cấu hình Push Notification
  getConfig() {
    try {
      const custom = localStorage.getItem(PUSH_STORAGE_KEYS.CONFIG);
      return custom ? { ...DEFAULT_PUSH_CONFIG, ...JSON.parse(custom) } : { ...DEFAULT_PUSH_CONFIG };
    } catch (e) {
      return { ...DEFAULT_PUSH_CONFIG };
    }
  }

  // Lưu cấu hình Push Notification
  saveConfig(newConfig) {
    localStorage.setItem(PUSH_STORAGE_KEYS.CONFIG, JSON.stringify(newConfig));
    this.initAutoScheduler();
    this.notifyListeners();
    return true;
  }

  // Kiểm tra trạng thái quyền thông báo của trình duyệt
  getBrowserPermissionStatus() {
    if (!('Notification' in window)) {
      return 'unsupported'; // Trình duyệt không hỗ trợ
    }
    return Notification.permission; // 'granted', 'denied', 'default'
  }

  hasBrowserPermission() {
    return typeof Notification !== 'undefined' && 'permission' in Notification && Notification.permission === 'granted';
  }

  // Yêu cầu quyền thông báo trình duyệt
  async requestBrowserPermission() {
    if (!('Notification' in window)) {
      showToast('Trình duyệt hiện tại không hỗ trợ Web Notification API.', 'warning');
      return 'unsupported';
    }

    try {
      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        showToast('Đã cấp quyền Thông Báo Đẩy trên trình duyệt thành công!', 'success');
        this.playMedicalAlertChime();
        this.showNativeBrowserNotification('🔔 Thông Báo Đẩy HSBA Đã Bật', {
          body: 'Bạn sẽ nhận được thông báo tức thời ngay khi có hồ sơ bệnh án được rà soát hoặc cần sửa lỗi.',
          tag: 'hsba-welcome'
        });
      } else if (permission === 'denied') {
        showToast('Bạn đã từ chối quyền thông báo trên trình duyệt. Hãy mở lại trong cài đặt trang web.', 'warning', 5000);
      }
      this.notifyListeners();
      return permission;
    } catch (e) {
      console.warn('Lỗi xin quyền thông báo:', e);
      return 'denied';
    }
  }

  // Phát âm thanh chuông cảnh báo y tế qua Web Audio API
  playMedicalAlertChime(level = 'warning') {
    const config = this.getConfig();
    if (!config.soundEnabled) return;

    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;

      if (!this.audioCtx) {
        this.audioCtx = new AudioContext();
      }

      if (this.audioCtx.state === 'suspended') {
        this.audioCtx.resume();
      }

      const now = this.audioCtx.currentTime;
      const osc1 = this.audioCtx.createOscillator();
      const osc2 = this.audioCtx.createOscillator();
      const gainNode = this.audioCtx.createGain();

      gainNode.connect(this.audioCtx.destination);
      osc1.connect(gainNode);
      osc2.connect(gainNode);

      // Âm điệu cảnh báo y tế chuẩn
      if (level === 'alarm' || level === 'Báo động') {
        // Tone 3 hồi chuông báo động
        osc1.frequency.setValueAtTime(880, now); // A5
        osc1.frequency.setValueAtTime(659.25, now + 0.12); // E5
        osc1.frequency.setValueAtTime(880, now + 0.24); // A5
        
        gainNode.gain.setValueAtTime(0.15, now);
        gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

        osc1.start(now);
        osc1.stop(now + 0.45);
      } else {
        // Tone 2 nốt báo nhắc nhở nhẹ nhàng
        osc1.frequency.setValueAtTime(587.33, now); // D5
        osc1.frequency.setValueAtTime(880, now + 0.1); // A5
        
        gainNode.gain.setValueAtTime(0.12, now);
        gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

        osc1.start(now);
        osc1.stop(now + 0.35);
      }
    } catch (e) {
      // Bỏ qua lỗi audio do autoplay policy
    }
  }

  // Hiển thị thông báo trình duyệt Native
  showNativeBrowserNotification(title, options = {}, onClick = null) {
    const config = this.getConfig();
    if (!config.enabled || !config.browserPushEnabled) return;
    if (this.getBrowserPermissionStatus() !== 'granted') return;

    try {
      const notification = new Notification(title, {
        icon: 'https://cdn-icons-png.flaticon.com/512/2966/2966327.png',
        badge: 'https://cdn-icons-png.flaticon.com/512/2966/2966327.png',
        silent: !config.soundEnabled,
        ...options
      });

      notification.onclick = (e) => {
        e.preventDefault();
        window.focus();
        if (typeof onClick === 'function') {
          onClick();
        }
        notification.close();
      };
    } catch (e) {
      console.warn('Không thể gửi native notification:', e);
    }
  }

  // Tạo tiêu đề và nội dung Push Notification chuẩn từ bản ghi lỗi
  formatPushContent(record, staffMember = null) {
    const config = this.getConfig();
    const staffName = staffMember ? staffMember.name : (record.nguoiChiDinh || 'Nhân viên y tế phụ trách');
    const deptName = record.khoaPhong || 'Khoa điều trị';

    let title = config.titleTemplate
      .replace(/{tenBenhNhan}/g, record.tenBenhNhan || '')
      .replace(/{maKCB}/g, record.maKCB || '')
      .replace(/{mucDoCanhBao}/g, record.mucDoCanhBao || 'Nhắc nhở')
      .replace(/{khoaPhong}/g, deptName);

    let message = config.messageTemplate
      .replace(/{nguoiNhan}/g, staffName)
      .replace(/{khoaPhong}/g, deptName)
      .replace(/{tenBenhNhan}/g, record.tenBenhNhan || '')
      .replace(/{maKCB}/g, record.maKCB || '')
      .replace(/{thoiGianYL}/g, record.thoiGianChiDinhYL || '')
      .replace(/{mucDoCanhBao}/g, record.mucDoCanhBao || 'Nhắc nhở')
      .replace(/{dienGiaiLoi}/g, record.dienGiaiLoi || '')
      .replace(/{trangThaiLoi}/g, record.trangThaiLoi || 'CHƯA SỬA');

    return { title, message, staffName, deptName };
  }

  // Gửi Push Notification cho 1 bản ghi lỗi tới bác sĩ/nhân viên phụ trách
  sendPushNotification(recordId, isAuto = false, customReason = '') {
    const record = storage.getRecords().find(r => r.id === recordId);
    if (!record) return { success: false, message: 'Không tìm thấy hồ sơ lỗi!' };

    if (record.trangThaiLoi === 'ĐÃ XONG' || record.trangThaiKiemDuyet === 'ĐÃ SỬA' || record.chotRaVien) {
      return { success: false, message: 'Hồ sơ đã hoàn thành hoặc đã chốt ra viện, không cần gửi thông báo đẩy!' };
    }

    const config = this.getConfig();
    if (!config.enabled) {
      return { success: false, message: 'Tính năng Thông Báo Đẩy đang tắt trong Cài đặt.' };
    }

    const staffList = storage.getStaff();
    const staff = staffList.find(s => s.name === record.nguoiChiDinh);
    const { title, message, staffName, deptName } = this.formatPushContent(record, staff);

    const now = new Date();
    const nowStr = now.toISOString().replace('T', ' ').substring(0, 16);
    const notifId = 'NOTIF-' + Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 6);

    // 1. Tạo Notification Model trong Hòm thư Thông báo (Inbox)
    const notificationItem = {
      id: notifId,
      recordId: record.id,
      maKCB: record.maKCB,
      tenBenhNhan: record.tenBenhNhan,
      khoaPhong: record.khoaPhong,
      targetStaffId: staff ? staff.id : null,
      targetStaffName: staffName,
      targetDept: deptName,
      mucDoCanhBao: record.mucDoCanhBao || 'Nhắc nhở',
      mucDoLoi: record.mucDoLoi || 'Nhắc nhở',
      title: title,
      body: message,
      trangThaiLoi: record.trangThaiLoi || 'CHƯA SỬA',
      timestamp: now.toISOString(),
      timeFormatted: nowStr,
      isRead: false,
      isAuto: isAuto,
      customReason: customReason || (isAuto ? 'Nhắc nhở tự động định kỳ' : 'Thông báo tức thời')
    };

    // Lưu vào Inbox
    this.saveNotificationToInbox(notificationItem);

    // 2. Lưu vào Nhật ký gửi toàn hệ thống
    this.logPushDelivery(notificationItem, record);

    // 3. Phát âm thanh cảnh báo
    this.playMedicalAlertChime(record.mucDoCanhBao);

    // 4. Bắn Web Push Notification của trình duyệt
    this.showNativeBrowserNotification(title, {
      body: message,
      tag: `hsba-rec-${record.id}`,
      requireInteraction: record.mucDoCanhBao === 'Báo động'
    }, () => {
      if (window.hsbaApp && window.hsbaApp.modalController) {
        window.hsbaApp.modalController.openViewDetailsModal(record.id);
      }
    });

    // 5. Cập nhật số lần và lịch sử gửi trên Record
    const pushHistory = record.pushHistory || [];
    pushHistory.unshift({
      id: notifId,
      time: nowStr,
      recipientName: staffName,
      targetDept: deptName,
      isAuto: isAuto,
      title: title,
      body: message
    });

    const updates = {
      lastPushSentAt: nowStr,
      pushSentCount: (record.pushSentCount || 0) + 1,
      pushHistory: pushHistory
    };

    storage.updateRecord(record.id, updates);
    this.notifyListeners();

    // 6. Hiển thị Slide Banner trong ứng dụng nếu người dùng đang mở app
    this.showInAppBanner(notificationItem);

    return {
      success: true,
      notification: notificationItem,
      recipientName: staffName,
      sentCount: updates.pushSentCount
    };
  }

  // Hiển thị banner pop-up trượt vào góc trên bên phải ứng dụng
  showInAppBanner(item) {
    try {
      let container = document.getElementById('push-notification-banner-container');
      if (!container) {
        container = document.createElement('div');
        container.id = 'push-notification-banner-container';
        container.className = 'push-banner-container';
        document.body.appendChild(container);
      }

      const banner = document.createElement('div');
      banner.className = `push-inapp-banner banner-level-${(item.mucDoCanhBao || 'nhac-nho').toLowerCase().replace(/\s+/g, '-')}`;
      
      const badgeIcon = item.mucDoCanhBao === 'Báo động' ? '🚨' : (item.mucDoCanhBao === 'Yêu cầu kiểm tra' ? '⚠️' : '🔔');
      
      banner.innerHTML = `
        <div class="banner-icon-badge">${badgeIcon}</div>
        <div class="banner-content">
          <div class="banner-title-row">
            <strong class="banner-title">${escapeHtml(item.title)}</strong>
            <span class="banner-time">Vừa xong</span>
          </div>
          <p class="banner-body">${escapeHtml(item.body)}</p>
          <div class="banner-footer-row">
            <span class="banner-recipient">Gửi tới: <strong>${escapeHtml(item.targetStaffName)}</strong> (${escapeHtml(item.targetDept)})</span>
            <span class="banner-action-hint">Bấm để xem chi tiết & sửa</span>
          </div>
        </div>
        <button class="banner-close-btn" title="Đóng">&times;</button>
      `;

      banner.querySelector('.banner-close-btn').onclick = (e) => {
        e.stopPropagation();
        banner.remove();
      };

      banner.onclick = () => {
        if (window.hsbaApp && window.hsbaApp.modalController) {
          window.hsbaApp.modalController.openViewDetailsModal(item.recordId);
        }
        this.markAsRead(item.id);
        banner.remove();
      };

      container.appendChild(banner);

      // Tự biến mất sau 8 giây
      setTimeout(() => {
        if (banner.parentElement) {
          banner.classList.add('banner-fade-out');
          setTimeout(() => banner.remove(), 400);
        }
      }, 8000);
    } catch (e) {
      console.warn('Lỗi hiển thị in-app banner:', e);
    }
  }

  // Lưu thông báo vào Inbox LocalStorage
  saveNotificationToInbox(item) {
    try {
      const listStr = localStorage.getItem(PUSH_STORAGE_KEYS.INBOX);
      let list = listStr ? JSON.parse(listStr) : [];
      list.unshift(item);
      if (list.length > 300) list = list.slice(0, 300); // Giới hạn 300 thông báo gần nhất
      localStorage.setItem(PUSH_STORAGE_KEYS.INBOX, JSON.stringify(list));
    } catch (e) {
      console.error('Lỗi khi lưu notification inbox:', e);
    }
  }

  // Lấy thông tin người nhận
  getRecipientTarget(record) {
    const staffList = storage.getStaff();
    const staff = staffList.find(s => s.name === record.nguoiChiDinh);
    if (staff) {
      return {
        label: staff.department ? `${staff.name} - ${staff.department}` : staff.name,
        name: staff.name,
        phone: staff.phone || '',
        zaloId: staff.zaloId || '',
        dept: staff.department || record.khoaPhong || ''
      };
    }
    return {
      label: record.nguoiChiDinh ? `${record.nguoiChiDinh} (${record.khoaPhong || 'Khoa'})` : (record.khoaPhong || 'Toàn viện'),
      name: record.nguoiChiDinh || '',
      phone: '',
      zaloId: '',
      dept: record.khoaPhong || ''
    };
  }

  generatePushMessage(record, staffMember = null) {
    const { message } = this.formatPushContent(record, staffMember);
    return message;
  }

  generatePushTitle(record) {
    const { title } = this.formatPushContent(record, null);
    return title;
  }

  // Lấy danh sách thông báo được lọc theo người dùng hiện tại
  getNotifications(currentUser = null) {
    const user = currentUser || storage.getCurrentUser();
    return this.getNotificationsForUser(user);
  }

  getNotificationsForUser(currentUser = null) {
    try {
      const listStr = localStorage.getItem(PUSH_STORAGE_KEYS.INBOX);
      const list = listStr ? JSON.parse(listStr) : [];
      const user = currentUser || storage.getCurrentUser();
      if (!user) return list;

      const role = user.defaultRole;
      const userName = (user.name || '').trim().toLowerCase();
      const userDept = (user.department || '').trim().toLowerCase();

      // Nếu là Quản trị viên, KHTH hoặc Tổ Rà Soát: Xem được tất cả thông báo của toàn viện
      if (role === 'ADMIN' || role === 'NHOM_1' || role === 'KHTH') {
        return list;
      }

      // Nếu là Bác sĩ điều trị / Khoa phòng (NHOM_2) hoặc Khoa Dược/Kế toán/IT:
      // Lọc các thông báo gửi trực tiếp cho họ hoặc cho Khoa phòng của họ
      return list.filter(n => {
        const notifTargetName = (n.targetStaffName || n.recipientName || '').trim().toLowerCase();
        const notifTargetDept = (n.targetDept || n.khoaPhong || '').trim().toLowerCase();
        return notifTargetName === userName || notifTargetDept === userDept || n.targetStaffId === user.id;
      });
    } catch (e) {
      return [];
    }
  }

  // Đếm số lượng thông báo chưa đọc
  getUnreadCount(currentUser = null) {
    const user = currentUser || storage.getCurrentUser();
    const list = this.getNotificationsForUser(user);
    return list.filter(n => !n.isRead && !n.read).length;
  }

  // Đánh dấu 1 thông báo đã đọc
  markAsRead(notificationId) {
    try {
      const listStr = localStorage.getItem(PUSH_STORAGE_KEYS.INBOX);
      let list = listStr ? JSON.parse(listStr) : [];
      list = list.map(n => n.id === notificationId ? { ...n, isRead: true } : n);
      localStorage.setItem(PUSH_STORAGE_KEYS.INBOX, JSON.stringify(list));
      this.notifyListeners();
    } catch (e) {
      console.error('Lỗi khi mark as read:', e);
    }
  }

  // Đánh dấu tất cả thông báo đã đọc cho người dùng
  markAllAsRead(currentUser = null) {
    try {
      const listStr = localStorage.getItem(PUSH_STORAGE_KEYS.INBOX);
      let list = listStr ? JSON.parse(listStr) : [];
      
      if (!currentUser || currentUser.defaultRole === 'ADMIN' || currentUser.defaultRole === 'NHOM_1') {
        list = list.map(n => ({ ...n, isRead: true }));
      } else {
        const userName = (currentUser.name || '').trim().toLowerCase();
        const userDept = (currentUser.department || '').trim().toLowerCase();
        list = list.map(n => {
          const notifTargetName = (n.targetStaffName || '').trim().toLowerCase();
          const notifTargetDept = (n.targetDept || '').trim().toLowerCase();
          if (notifTargetName === userName || notifTargetDept === userDept || n.targetStaffId === currentUser.id) {
            return { ...n, isRead: true };
          }
          return n;
        });
      }

      localStorage.setItem(PUSH_STORAGE_KEYS.INBOX, JSON.stringify(list));
      this.notifyListeners();
      showToast('Đã đánh dấu đã đọc tất cả thông báo.', 'success');
    } catch (e) {
      console.error('Lỗi khi mark all as read:', e);
    }
  }

  // Xóa toàn bộ hòm thư thông báo
  clearInbox() {
    localStorage.removeItem(PUSH_STORAGE_KEYS.INBOX);
    this.notifyListeners();
    showToast('Đã dọn dẹp sạch hòm thư thông báo.', 'info');
  }

  clearNotifications() {
    this.clearInbox();
  }

  // Lưu vào nhật ký gửi thông báo toàn hệ thống
  logPushDelivery(item, record) {
    try {
      const logsStr = localStorage.getItem(PUSH_STORAGE_KEYS.LOGS);
      let logs = logsStr ? JSON.parse(logsStr) : [];
      logs.unshift({
        ...item,
        recordId: record ? record.id : null,
        maKCB: record ? record.maKCB : item.maKCB,
        tenBenhNhan: record ? record.tenBenhNhan : item.tenBenhNhan,
        khoaPhong: record ? record.khoaPhong : item.khoaPhong,
        recipientName: item.targetStaffName || item.recipientName || '',
        title: item.title,
        body: item.body,
        content: item.body
      });
      if (logs.length > 250) logs = logs.slice(0, 250);
      localStorage.setItem(PUSH_STORAGE_KEYS.LOGS, JSON.stringify(logs));
    } catch (e) {
      console.error('Lỗi khi lưu Push log:', e);
    }
  }

  // Lấy danh sách nhật ký đẩy toàn hệ thống
  getDeliveryLogs() {
    try {
      const logsStr = localStorage.getItem(PUSH_STORAGE_KEYS.LOGS);
      return logsStr ? JSON.parse(logsStr) : [];
    } catch (e) {
      return [];
    }
  }

  getSystemPushLogs() {
    return this.getDeliveryLogs();
  }

  // Bắn thử nghiệm Push Notification trên thiết bị hiện tại
  sendTestPush() {
    const currentUser = storage.getCurrentUser();
    const config = this.getConfig();

    this.playMedicalAlertChime('Báo động');

    this.showNativeBrowserNotification('🔔 [THỬ NGHIỆM] Thông Báo Đẩy Hoạt Động Tốt', {
      body: `Hệ thống Push Notification đã kết nối thành công tới thiết bị của ${currentUser ? currentUser.name : 'bạn'}.`,
      tag: 'hsba-test-push'
    });

    const testItem = {
      id: 'NOTIF-TEST-' + Date.now().toString(36),
      recordId: null,
      maKCB: 'BN-TEST',
      tenBenhNhan: 'Bệnh Nhân Kiểm Tra Thử Nghiệm',
      khoaPhong: currentUser ? currentUser.department : 'Toàn Viện',
      targetStaffId: currentUser ? currentUser.id : null,
      targetStaffName: currentUser ? currentUser.name : 'Người Dùng Kiểm Tra',
      recipientName: currentUser ? currentUser.name : 'Người Dùng Kiểm Tra',
      targetDept: currentUser ? currentUser.department : 'Toàn Viện',
      mucDoCanhBao: 'Nhắc nhở',
      title: '🔔 [THỬ NGHIỆM] Kiểm tra Thông Báo Đẩy',
      body: `Thiết bị đang nhận thông báo đẩy tốt. Chu kỳ nhắc: ${config.reminderIntervalHours} giờ/lần.`,
      timestamp: new Date().toISOString(),
      timeFormatted: new Date().toISOString().replace('T', ' ').substring(0, 16),
      isRead: false,
      read: false,
      isAuto: false,
      customReason: 'Kiểm tra kết nối thiết bị'
    };

    this.saveNotificationToInbox(testItem);
    this.logPushDelivery(testItem, null);
    this.showInAppBanner(testItem);
    this.notifyListeners();
    showToast('Đã gửi thông báo đẩy thử nghiệm thành công!', 'success');
  }

  sendTestNotification() {
    this.sendTestPush();
  }

  // Khởi động Bộ hẹn giờ tự động quét và đẩy thông báo định kỳ
  initAutoScheduler() {
    if (this.timerId) {
      clearInterval(this.timerId);
      this.timerId = null;
    }

    const config = this.getConfig();
    if (!config.enabled || !config.autoReminder) return;

    // Kiểm tra định kỳ mỗi 60 giây
    this.timerId = setInterval(() => {
      this.checkAndDispatchAutoReminders();
    }, 60 * 1000);

    // Kích hoạt quét nhanh sau 5 giây khi mở app
    setTimeout(() => {
      this.checkAndDispatchAutoReminders();
    }, 5000);
  }

  // Quét các lỗi chưa hoàn thành và kiểm tra xem đã qua chu kỳ cần nhắc chưa
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
      if (!record.lastPushSentAt && !record.lastZaloSentAt) {
        needSend = true;
      } else {
        const lastTimeStr = record.lastPushSentAt || record.lastZaloSentAt;
        const lastSentTime = new Date(lastTimeStr.replace(' ', 'T')).getTime();
        if (now - lastSentTime >= intervalMs) {
          needSend = true;
        }
      }

      if (needSend) {
        this.sendPushNotification(record.id, true, `Nhắc nhở tự động định kỳ (${config.reminderIntervalHours}h/lần)`);
        autoSentCount++;
      }
    });

    if (autoSentCount > 0) {
      console.log(`[Push Notification] Đã tự động bắn ${autoSentCount} thông báo đẩy định kỳ.`);
      if (window.hsbaApp && typeof window.hsbaApp.refreshAllViews === 'function') {
        window.hsbaApp.refreshAllViews();
      }
    }
  }
}

export const notificationService = new NotificationService();
