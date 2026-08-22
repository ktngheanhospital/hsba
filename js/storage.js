/**
 * Quản lý lưu trữ LocalStorage & Phân quyền cho ứng dụng THEO DÕI HSBA
 * Phân quyền chuyên biệt cho 4 khâu kiểm lỗi: Dược, Kế toán BH, KHTH, IT, Khoa phòng, Admin
 */

import { DEFAULT_DEPARTMENTS, DEFAULT_STAFF, DEFAULT_RECORDS, DEFAULT_DISCHARGE_REPORTS, ROLES, PERMISSION_COLUMNS } from './data.js';
import { supabaseService } from './supabase.js';

const STORAGE_KEYS = {
  RECORDS: 'theo_doi_hsba_records_v5',
  DISCHARGE_REPORTS: 'theo_doi_hsba_discharge_reports_v5',
  DEPARTMENTS: 'theo_doi_hsba_departments_v5',
  STAFF: 'theo_doi_hsba_staff_v5',
  INITIALIZED: 'theo_doi_hsba_init_v5',
  CURRENT_ROLE: 'theo_doi_hsba_role_v5',
  PERMISSIONS: 'theo_doi_hsba_permissions_v5',
  ACTIVE_DEPT: 'theo_doi_hsba_active_dept_v5',
  CURRENT_USER: 'theo_doi_hsba_current_user_v5',
  TOMBSTONES: 'theo_doi_hsba_tombstones_v5'
};

export class StorageService {
  constructor() {
    this.broadcastChannel = null;
    try {
      if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
        this.broadcastChannel = new BroadcastChannel('hsba_tab_sync_channel');
        this.broadcastChannel.onmessage = (event) => {
          if (event && event.data && event.data.type === 'DATA_UPDATED') {
            console.log('🔄 Đồng bộ dữ liệu giữa các tab qua BroadcastChannel');
            if (window.hsbaApp && typeof window.hsbaApp.refreshAllViews === 'function') {
              window.hsbaApp.refreshAllViews();
            }
          }
        };
      }
    } catch (e) {}

    this.initStorage();
  }

  notifyTabs() {
    try {
      if (this.broadcastChannel) {
        this.broadcastChannel.postMessage({ type: 'DATA_UPDATED', timestamp: Date.now() });
      }
    } catch (e) {}
  }

  // --- QUẢN LÝ DANH SÁCH BẢN GHI ĐÃ XÓA (TOMBSTONES) ---
  getTombstones() {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.TOMBSTONES);
      return raw ? JSON.parse(raw) : { records: {}, discharge: {}, departments: {}, staff: {} };
    } catch (e) {
      return { records: {}, discharge: {}, departments: {}, staff: {} };
    }
  }

  saveTombstones(ts) {
    try {
      localStorage.setItem(STORAGE_KEYS.TOMBSTONES, JSON.stringify(ts));
    } catch (e) {}
  }

  getTombstoneIds(type) {
    const ts = this.getTombstones();
    return Object.keys(ts[type] || {});
  }

  addTombstone(type, id) {
    if (!id) return;
    const ts = this.getTombstones();
    if (!ts[type]) ts[type] = {};
    ts[type][String(id)] = Date.now();
    this.saveTombstones(ts);
  }

  isTombstoned(type, id) {
    if (!id) return false;
    const ts = this.getTombstones();
    return !!(ts[type] && ts[type][String(id)]);
  }

  removeTombstone(type, id) {
    if (!id) return;
    const ts = this.getTombstones();
    if (ts[type] && ts[type][String(id)]) {
      delete ts[type][String(id)];
      this.saveTombstones(ts);
    }
  }

  initStorage() {
    const isInit = localStorage.getItem(STORAGE_KEYS.INITIALIZED);
    if (!isInit) {
      this.resetToDefaults();
    }
    this.cleanMockData();

    // Tự động đồng bộ với Supabase Cloud Database & Kích hoạt Realtime
    setTimeout(() => {
      supabaseService.autoInitSync(this, () => {
        if (window.hsbaApp) {
          window.hsbaApp.refreshAllViews();
        }
      });

      // Lắng nghe thay đổi Realtime từ các máy khác
      supabaseService.subscribeRealtime((table, payload) => {
        this.handleRealtimeEvent(table, payload);
      });

      // Khởi động Heartbeat Polling & Focus Sync tự động
      supabaseService.startHeartbeatSync(this, () => {
        if (window.hsbaApp && typeof window.hsbaApp.refreshAllViews === 'function') {
          window.hsbaApp.refreshAllViews();
        }
      });
    }, 200);
  }

  // Tự động dọn dẹp các mockup dữ liệu mẫu ban đầu (không xóa dữ liệu thật của người dùng)
  cleanMockData() {
    try {
      const legacyMockStaffIds = ['NV00', 'NV01', 'NV02', 'NV03', 'NV04', 'NV08', 'NV09', 'NV10', 'NV11', 'NV13'];

      // 1. Chỉ lọc bỏ các tài khoản mockup cũ có tên 'Trần Thị Mai' hoặc ID rác NV00..
      const staffJson = localStorage.getItem(STORAGE_KEYS.STAFF);
      if (staffJson) {
        try {
          let staff = JSON.parse(staffJson);
          if (Array.isArray(staff)) {
            const cleaned = staff.filter(s => !legacyMockStaffIds.includes(s.id) && !(s.name && s.name.includes('Trần Thị Mai')));
            if (cleaned.length !== staff.length) {
              this.saveStaff(cleaned);
            }
          }
        } catch (err) {}
      }

      // 2. Dọn dẹp bản ghi rác/test cũ nếu còn lưu trong localStorage của trình duyệt
      this.addTombstone('records', 'REC-1006');
      this.addTombstone('records', 'test');
      const recordsJson = localStorage.getItem(STORAGE_KEYS.RECORDS);
      if (recordsJson) {
        try {
          let records = JSON.parse(recordsJson);
          if (Array.isArray(records)) {
            const cleanedRecords = records.filter(r => {
              if (r.id === 'REC-1006') return false;
              if ((r.maKCB || '').trim().toLowerCase() === 'test' && (r.tenBenhNhan || '').toLowerCase().includes('adsfasdfasdf')) return false;
              return true;
            });
            if (cleanedRecords.length !== records.length) {
              this.saveRecords(cleanedRecords);
            }
          }
        } catch (err) {}
      }
    } catch (e) {
      console.warn('Lỗi khi dọn dẹp mockup:', e);
    }
  }

  handleRealtimeEvent(table, payload) {
    if (!payload) return;
    console.log(`⚡ Realtime update từ Cloud [${table}]:`, payload.eventType);

    if (table === 'records') {
      if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
        if (!payload.new) return;
        const record = supabaseService.dbToRecord(payload.new);
        if (this.isTombstoned('records', record.id)) return;

        const records = this.getRecords();
        const idx = records.findIndex(r => r.id === record.id);
        if (idx !== -1) {
          records[idx] = {
            ...records[idx],
            ...record,
            lastPushSentAt: record.lastPushSentAt || records[idx].lastPushSentAt || null,
            lastZaloSentAt: record.lastZaloSentAt || records[idx].lastZaloSentAt || null,
            pushSentCount: Math.max(record.pushSentCount || 0, records[idx].pushSentCount || 0),
            pushHistory: (record.pushHistory && record.pushHistory.length) ? record.pushHistory : (records[idx].pushHistory || [])
          };
        } else {
          records.unshift(record);
        }
        this.saveRecords(records);
      } else if (payload.eventType === 'DELETE') {
        const oldId = payload.old ? payload.old.id : null;
        const oldKcb = payload.old ? payload.old.ma_kcb : null;
        if (oldId) this.addTombstone('records', oldId);
        if (oldKcb) this.addTombstone('records', oldKcb);
        let records = this.getRecords();
        records = records.filter(r => {
          if (oldId && (String(r.id) === String(oldId) || r.id === oldId)) return false;
          if (oldKcb && (String(r.maKCB) === String(oldKcb) || r.maKCB === oldKcb)) return false;
          return true;
        });
        this.saveRecords(records);
      }
    } else if (table === 'discharge_reports') {
      if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
        if (!payload.new) return;
        const rep = supabaseService.dbToDischarge(payload.new);
        if (this.isTombstoned('discharge', rep.id)) return;

        const reps = this.getDischargeReports();
        const idx = reps.findIndex(r => r.id === rep.id);
        if (idx !== -1) reps[idx] = rep;
        else reps.unshift(rep);
        this.saveDischargeReports(reps);
      } else if (payload.eventType === 'DELETE') {
        const oldId = payload.old ? payload.old.id : null;
        const oldKcb = payload.old ? payload.old.ma_kcb : null;
        if (oldId) this.addTombstone('discharge', oldId);
        if (oldKcb) this.addTombstone('discharge', oldKcb);
        let reps = this.getDischargeReports();
        reps = reps.filter(r => {
          if (oldId && (String(r.id) === String(oldId) || r.id === oldId)) return false;
          if (oldKcb && (String(r.maKCB) === String(oldKcb) || r.maKCB === oldKcb)) return false;
          return true;
        });
        this.saveDischargeReports(reps);
      }
    } else if (table === 'departments') {
      if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
        if (!payload.new) return;
        const dept = supabaseService.dbToDept(payload.new);
        if (this.isTombstoned('departments', dept.id)) return;

        const depts = this.getDepartments();
        const idx = depts.findIndex(d => d.id === dept.id);
        if (idx !== -1) depts[idx] = dept;
        else depts.push(dept);
        this.saveDepartments(depts);
      } else if (payload.eventType === 'DELETE') {
        const delId = payload.old ? payload.old.id : null;
        if (delId) {
          this.addTombstone('departments', delId);
          let depts = this.getDepartments();
          depts = depts.filter(d => d.id !== String(delId) && d.id !== delId);
          this.saveDepartments(depts);
        }
      }
    } else if (table === 'staff') {
      if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
        if (!payload.new) return;
        const staffMember = supabaseService.dbToStaff(payload.new);
        if (this.isTombstoned('staff', staffMember.id)) return;

        const staffList = this.getStaff();
        const idx = staffList.findIndex(s => s.id === staffMember.id);
        if (idx !== -1) staffList[idx] = staffMember;
        else staffList.push(staffMember);
        this.saveStaff(staffList);
      } else if (payload.eventType === 'DELETE') {
        const delId = payload.old ? payload.old.id : null;
        if (delId) {
          this.addTombstone('staff', delId);
          let staffList = this.getStaff();
          staffList = staffList.filter(s => s.id !== String(delId) && s.id !== delId);
          this.saveStaff(staffList);
        }
      }
    }

    this.notifyTabs();
    if (window.hsbaApp && typeof window.hsbaApp.refreshAllViews === 'function') {
      window.hsbaApp.refreshAllViews();
    }
  }

  // --- QUẢN LÝ XÁC THỰC & ĐĂNG NHẬP (AUTHENTICATION) ---
  isAuthenticated() {
    return !!this.getCurrentUser();
  }

  getCurrentUser() {
    try {
      const userJson = localStorage.getItem(STORAGE_KEYS.CURRENT_USER);
      return userJson ? JSON.parse(userJson) : null;
    } catch (e) {
      return null;
    }
  }

  setCurrentUser(user) {
    if (user) {
      localStorage.setItem(STORAGE_KEYS.CURRENT_USER, JSON.stringify(user));
      // Tự động đồng bộ vai trò và khoa phòng công tác theo đúng Profile của tài khoản
      const roleToSet = user.defaultRole && ROLES[user.defaultRole] ? user.defaultRole : 'NHOM_2';
      this.setCurrentRole(roleToSet);
      
      if (user.department) {
        this.setActiveDepartment(user.department);
      }
      return true;
    }
    return false;
  }

  login(username, password) {
    if (!username) {
      return { success: false, message: 'Vui lòng nhập tên đăng nhập hoặc số điện thoại!' };
    }

    const cleanUser = username.trim().toLowerCase();
    const cleanPass = password ? password.trim() : '';
    const staffList = this.getStaff();

    // Tìm theo username, số điện thoại, mã nhân viên (id), tên, hoặc role
    // Tìm chính xác theo username, số điện thoại, mã nhân viên (id) hoặc tên
    const staff = staffList.find(s => 
      (s.username && s.username.toLowerCase() === cleanUser) ||
      (s.phone && s.phone.replace(/[^0-9]/g, '') === cleanUser.replace(/[^0-9]/g, '') && cleanUser.length >= 8) ||
      (s.id && s.id.toLowerCase() === cleanUser) ||
      (s.name && s.name.toLowerCase() === cleanUser)
    );

    if (!staff) {
      return { success: false, message: 'Tài khoản không tồn tại trong hệ thống!' };
    }

    // Kiểm tra chính xác mật khẩu của tài khoản đó
    const expectedPass = staff.password !== undefined && staff.password !== null && staff.password !== '' 
      ? String(staff.password).trim() 
      : '123';

    if (cleanPass !== expectedPass) {
      return { success: false, message: 'Mật khẩu không chính xác!' };
    }

    this.setCurrentUser(staff);
    return { success: true, user: staff };
  }

  // Đổi mật khẩu cho tài khoản người dùng
  changePassword(userId, oldPassword, newPassword, bypassOldPassword = false) {
    if (!userId) {
      return { success: false, message: 'Không tìm thấy thông tin tài khoản cần đổi mật khẩu!' };
    }

    const staffList = this.getStaff();
    const staff = staffList.find(s => s.id === userId);
    if (!staff) {
      return { success: false, message: 'Tài khoản không tồn tại trong hệ thống!' };
    }

    const cleanOld = oldPassword ? String(oldPassword).trim() : '';
    const cleanNew = newPassword ? String(newPassword).trim() : '';

    if (!cleanNew) {
      return { success: false, message: 'Vui lòng nhập mật khẩu mới!' };
    }

    if (cleanNew.length < 3) {
      return { success: false, message: 'Mật khẩu mới phải có ít nhất 3 ký tự!' };
    }

    if (!bypassOldPassword) {
      const currentPass = staff.password !== undefined && staff.password !== null && staff.password !== ''
        ? String(staff.password).trim()
        : '123';

      if (cleanOld !== currentPass) {
        return { success: false, message: 'Mật khẩu hiện tại không chính xác!' };
      }
    }

    const updated = this.updateStaff(staff.id, { password: cleanNew });
    if (updated) {
      return { success: true, message: 'Đổi mật khẩu thành công!' };
    }
    return { success: false, message: 'Không thể lưu mật khẩu mới. Vui lòng thử lại!' };
  }

  // Đổi mật khẩu dựa theo Tên đăng nhập hoặc Số điện thoại (Dùng khi quên hoặc từ màn hình đăng nhập)
  changePasswordByUsernameOrPhone(usernameOrPhone, oldPassword, newPassword) {
    if (!usernameOrPhone) {
      return { success: false, message: 'Vui lòng nhập tên đăng nhập hoặc số điện thoại!' };
    }

    const cleanUser = usernameOrPhone.trim().toLowerCase();
    const staffList = this.getStaff();

    const staff = staffList.find(s => 
      (s.username && s.username.toLowerCase() === cleanUser) ||
      (s.phone && s.phone.replace(/[^0-9]/g, '') === cleanUser.replace(/[^0-9]/g, '') && cleanUser.length >= 8) ||
      (s.id && s.id.toLowerCase() === cleanUser)
    );

    if (!staff) {
      return { success: false, message: 'Không tìm thấy tài khoản với thông tin đã nhập!' };
    }

    return this.changePassword(staff.id, oldPassword, newPassword, false);
  }

  loginAsStaff(staffId) {
    const staffList = this.getStaff();
    const staff = staffList.find(s => s.id === staffId);
    if (staff) {
      this.setCurrentUser(staff);
      return { success: true, user: staff };
    }
    return { success: false, message: 'Không tìm thấy thông tin nhân viên' };
  }

  logout() {
    localStorage.removeItem(STORAGE_KEYS.CURRENT_USER);
    localStorage.removeItem(STORAGE_KEYS.CURRENT_ROLE);
    return true;
  }

  // --- QUẢN LÝ KHOA MẶC ĐỊNH CỦA NHÂN VIÊN ---
  getActiveDepartment() {
    try {
      const user = this.getCurrentUser();
      if (user && user.department) {
        return user.department;
      }
      const dept = localStorage.getItem(STORAGE_KEYS.ACTIVE_DEPT);
      if (dept) return dept;
      const depts = this.getDepartments();
      return depts.length > 0 ? depts[0].name : '';
    } catch (e) {
      return '';
    }
  }

  setActiveDepartment(deptName) {
    if (deptName) {
      localStorage.setItem(STORAGE_KEYS.ACTIVE_DEPT, deptName);
      return true;
    }
    return false;
  }

  // --- QUẢN LÝ VAI TRÒ & PHÂN QUYỀN (ROLES & PERMISSIONS) ---
  getCurrentRole() {
    try {
      const user = this.getCurrentUser();
      if (user && user.defaultRole && ROLES[user.defaultRole]) {
        return user.defaultRole;
      }
      const roleId = localStorage.getItem(STORAGE_KEYS.CURRENT_ROLE);
      return roleId && ROLES[roleId] ? roleId : 'ADMIN';
    } catch (e) {
      return 'ADMIN';
    }
  }

  setCurrentRole(roleId) {
    if (ROLES[roleId]) {
      localStorage.setItem(STORAGE_KEYS.CURRENT_ROLE, roleId);
      return true;
    }
    return false;
  }

  getRoleDetails(roleId = null) {
    const activeRoleId = roleId || this.getCurrentRole();
    return ROLES[activeRoleId] || ROLES.ADMIN;
  }

  isAdmin(roleId = null) {
    const activeRole = roleId || this.getCurrentRole();
    return activeRole === 'ADMIN';
  }

  // PHÂN QUYỀN CÁC KHÂU KIỂM LỖI CHUYÊN MÔN:
  canCheckDischargeStep(stepKey, roleId = null) {
    const activeRole = roleId || this.getCurrentRole();
    if (activeRole === 'ADMIN') return true;

    const matrix = this.getPermissionsMatrix();
    let permKey = '';
    if (stepKey === 'duoc') permKey = 'kiemDuoc';
    else if (stepKey === 'ketoan') permKey = 'kiemKeToanBH';
    else if (stepKey === 'khth') permKey = 'kiemKHTH';

    const perm = matrix.find(p => p.key === permKey);
    if (!perm) return false;

    if (activeRole === 'DUOC') return !!perm.duoc;
    if (activeRole === 'KETOAN_BH' || activeRole === 'NHOM_1') return !!perm.ketoan;
    if (activeRole === 'KHTH') return !!perm.khth;
    if (activeRole === 'IT') return false;
    if (activeRole === 'NHOM_2') return !!perm.nhom2;

    return false;
  }

  // PHÂN QUYỀN ĐỘC QUYỀN CHỐT THÔNG CỔNG:
  canChotThongCong(roleId = null) {
    const activeRoleId = roleId || this.getCurrentRole();
    if (activeRoleId === 'ADMIN') return true;

    const matrix = this.getPermissionsMatrix();
    const perm = matrix.find(p => p.key === 'chotThongCong');
    if (!perm) return activeRoleId === 'KHTH';

    if (activeRoleId === 'DUOC') return !!perm.duoc;
    if (activeRoleId === 'KETOAN_BH') return !!perm.ketoan;
    if (activeRoleId === 'KHTH') return !!perm.khth;
    if (activeRoleId === 'IT') return !!perm.it;
    if (activeRoleId === 'NHOM_2') return !!perm.nhom2;

    return false;
  }

  // PHÂN QUYỀN TRUY CẬP PHÂN HỆ CÀI ĐẶT:
  canAccessSettings(roleId = null) {
    const activeRoleId = roleId || this.getCurrentRole();
    if (activeRoleId === 'ADMIN') return true;

    const matrix = this.getPermissionsMatrix();
    const perm = matrix.find(p => p.key === 'truyCapCaiDat');
    if (!perm) return activeRoleId === 'IT';

    if (activeRoleId === 'DUOC') return !!perm.duoc;
    if (activeRoleId === 'KETOAN_BH') return !!perm.ketoan;
    if (activeRoleId === 'KHTH') return !!perm.khth;
    if (activeRoleId === 'IT') return !!perm.it;
    if (activeRoleId === 'NHOM_2') return !!perm.nhom2;

    return false;
  }

  canEditField(fieldKey, roleId = null) {
    const activeRoleId = roleId || this.getCurrentRole();
    if (activeRoleId === 'ADMIN') return true;

    const matrix = this.getPermissionsMatrix();
    const perm = matrix.find(p => p.key === fieldKey);
    if (!perm) return true;

    if (activeRoleId === 'DUOC') return !!perm.duoc;
    if (activeRoleId === 'KETOAN_BH' || activeRoleId === 'NHOM_1') return !!perm.ketoan;
    if (activeRoleId === 'KHTH') return !!perm.khth;
    if (activeRoleId === 'IT') return !!perm.it;
    if (activeRoleId === 'NHOM_2') return !!perm.nhom2;

    return false;
  }

  canAddRecord(roleId = null) {
    const activeRoleId = roleId || this.getCurrentRole();
    const role = ROLES[activeRoleId] || ROLES.ADMIN;
    return !!role.canAddError;
  }

  canDeleteRecord(roleId = null) {
    const activeRoleId = roleId || this.getCurrentRole();
    const role = ROLES[activeRoleId] || ROLES.ADMIN;
    return !!role.canDeleteError;
  }

  // PHÂN QUYỀN ĐỘC QUYỀN XÓA BÁO CÁO RA VIỆN (CHỈ NHÓM KHOA/BÁC SĨ & ADMIN):
  canDeleteDischargeReport(roleId = null) {
    const activeRoleId = roleId || this.getCurrentRole();
    if (activeRoleId === 'ADMIN') return true;

    const matrix = this.getPermissionsMatrix();
    const perm = matrix.find(p => p.key === 'xoaBaoCaoRaVien');
    if (perm) {
      if (activeRoleId === 'DUOC') return !!perm.duoc;
      if (activeRoleId === 'KETOAN_BH' || activeRoleId === 'NHOM_1') return !!perm.ketoan;
      if (activeRoleId === 'KHTH') return !!perm.khth;
      if (activeRoleId === 'IT') return !!perm.it;
      if (activeRoleId === 'NHOM_2') return !!perm.nhom2;
    }

    return activeRoleId === 'NHOM_2';
  }

  getPermissionsMatrix() {
    try {
      const customPerms = localStorage.getItem(STORAGE_KEYS.PERMISSIONS);
      if (!customPerms) return PERMISSION_COLUMNS;

      const saved = JSON.parse(customPerms);
      // Merge: đảm bảo tất cả key mới từ PERMISSION_COLUMNS đều có mặt
      const merged = PERMISSION_COLUMNS.map(defaultRow => {
        const savedRow = saved.find(s => s.key === defaultRow.key);
        if (savedRow) {
          // Merge các cột mới (nhom1,...) nếu chưa có trong dữ liệu cũ
          return { ...defaultRow, ...savedRow, label: defaultRow.label, desc: defaultRow.desc };
        }
        return { ...defaultRow };
      });
      return merged;
    } catch (e) {
      return PERMISSION_COLUMNS;
    }
  }

  savePermissionsMatrix(matrix) {
    localStorage.setItem(STORAGE_KEYS.PERMISSIONS, JSON.stringify(matrix));
    return true;
  }

  // --- QUẢN LÝ BẢN GHI LỖI HSBA (RECORDS) ---
  getRecords() {
    try {
      const recordsJson = localStorage.getItem(STORAGE_KEYS.RECORDS);
      let records = recordsJson ? JSON.parse(recordsJson) : [];
      return records.map(r => {
        if (!r.mucDoLoi) {
          if (r.mucDoCanhBao === 'Khẩn cấp' || r.trangThaiKiemDuyet === 'CHƯA SỬA' || r.mucDoCanhBao === 'Báo động') {
            r.mucDoLoi = 'Báo động';
          } else if (r.mucDoCanhBao === 'Cao (Nghiêm trọng)' || r.mucDoCanhBao === 'Cao' || r.trangThaiKiemDuyet === 'YÊU CẦU KIỂM TRA LẠI' || r.mucDoCanhBao === 'Yêu cầu kiểm tra') {
            r.mucDoLoi = 'Yêu cầu kiểm tra';
          } else {
            r.mucDoLoi = 'Nhắc nhở';
          }
        }
        return r;
      });
    } catch (e) {
      console.error('Lỗi khi đọc danh sách lỗi:', e);
      return [];
    }
  }

  saveRecords(records) {
    try {
      localStorage.setItem(STORAGE_KEYS.RECORDS, JSON.stringify(records));
      return true;
    } catch (e) {
      console.error('Lỗi khi lưu danh sách lỗi:', e);
      return false;
    }
  }

  addRecord(recordData) {
    const records = this.getRecords();
    const nowStr = new Date().toISOString().replace('T', ' ').substring(0, 16);
    const newId = 'REC-' + Date.now().toString(36).toUpperCase() + '-' + Math.floor(1000 + Math.random() * 9000);

    const newRecord = {
      id: newId,
      maKCB: recordData.maKCB || '',
      tenBenhNhan: recordData.tenBenhNhan || '',
      khoaPhong: recordData.khoaPhong || '',
      nguoiChiDinh: recordData.nguoiChiDinh || '',
      ngayVaoKhoa: recordData.ngayVaoKhoa || '',
      ngayKiemHoSo: recordData.ngayKiemHoSo || '',
      thoiGianChiDinhYL: recordData.thoiGianChiDinhYL || '',
      mucDoLoi: recordData.mucDoLoi || recordData.mucDoCanhBao || 'Nhắc nhở',
      mucDoCanhBao: recordData.mucDoLoi || recordData.mucDoCanhBao || 'Nhắc nhở',
      dienGiaiLoi: recordData.dienGiaiLoi || '',
      trangThaiKiemDuyet: recordData.trangThaiKiemDuyet || recordData.mucDoLoi || 'Nhắc nhở',
      trangThaiLoi: recordData.trangThaiLoi || 'CHƯA SỬA',
      yKienNguoiSua: recordData.yKienNguoiSua || '',
      ngayTao: nowStr,
      ngayCapNhat: nowStr,
      chotRaVien: false,
      ngayChotRaVien: null,
      pushSentCount: recordData.pushSentCount || recordData.zaloSentCount || 0,
      lastPushSentAt: recordData.lastPushSentAt || recordData.lastZaloSentAt || null,
      pushHistory: recordData.pushHistory || [],
      zaloSentCount: recordData.pushSentCount || recordData.zaloSentCount || 0,
      lastZaloSentAt: recordData.lastPushSentAt || recordData.lastZaloSentAt || null,
      zaloHistory: recordData.pushHistory || recordData.zaloHistory || []
    };

    this.removeTombstone('records', newId);
    records.unshift(newRecord);
    this.saveRecords(records);
    this.syncDischargeReportsKetoan(newRecord.maKCB);
    this.notifyTabs();
    supabaseService.upsertRecord(newRecord);
    return newRecord;
  }

  updateRecord(recordId, updateFields) {
    if (!recordId || this.isTombstoned('records', recordId)) return false;
    const records = this.getRecords();
    const index = records.findIndex(r => r.id === recordId);
    if (index === -1) return false;
    if (records[index].maKCB && this.isTombstoned('records', records[index].maKCB)) return false;

    const nowStr = new Date().toISOString().replace('T', ' ').substring(0, 16);
    records[index] = {
      ...records[index],
      ...updateFields,
      ngayCapNhat: nowStr
    };

    this.saveRecords(records);
    this.syncDischargeReportsKetoan(records[index].maKCB);
    this.notifyTabs();
    supabaseService.upsertRecord(records[index]);
    return records[index];
  }

  deleteRecord(recordId) {
    if (!recordId) return false;
    this.addTombstone('records', recordId);
    let records = this.getRecords();
    const targetRecord = records.find(r => r.id === recordId || r.maKCB === recordId);
    const targetMaKCB = targetRecord ? targetRecord.maKCB : null;
    if (targetMaKCB) {
      this.addTombstone('records', targetMaKCB);
    }
    records = records.filter(r => r.id !== recordId && (!targetMaKCB || r.maKCB !== targetMaKCB));
    this.saveRecords(records);
    if (targetMaKCB) {
      this.syncDischargeReportsKetoan(targetMaKCB);
    }
    this.notifyTabs();
    supabaseService.deleteRecord(recordId, targetMaKCB);
    return true;
  }

  // Tự động kiểm tra trạng thái KT-BH từ Danh sách lỗi dựa theo mã KCB:
  // Nếu "Mức độ lỗi" là "Không có lỗi" -> "Đã kiểm, không lỗi" (KHONG_LOI), ngược lại -> "Có lỗi" (CO_LOI)
  evaluateKetoanStatusFromRecords(maKCB) {
    if (!maKCB) return { status: 'CO_LOI', note: '' };
    const key = maKCB.trim().toLowerCase();
    const records = this.getRecords();
    const matched = records.filter(r => (r.maKCB || '').trim().toLowerCase() === key);
    if (matched.length === 0) {
      return { status: 'CO_LOI', note: '' };
    }

    // Kiểm tra xem các bản ghi rà soát có lỗi hay không
    const errorRecords = matched.filter(r => {
      const lvl = (r.mucDoLoi || r.mucDoCanhBao || '').trim();
      return lvl !== 'Không có lỗi' && lvl !== 'KHONG_CO_LOI' && lvl !== 'KHÔNG CÓ LỖI';
    });

    if (errorRecords.length === 0) {
      return { status: 'KHONG_LOI', note: 'Rà soát: Không có lỗi' };
    } else {
      const notes = errorRecords.map(r => r.dienGiaiLoi || r.mucDoLoi).filter(Boolean).join('; ');
      return { status: 'CO_LOI', note: notes || 'Có lỗi rà soát' };
    }
  }

  syncDischargeReportsKetoan(targetMaKCB = null) {
    const reports = this.getDischargeReports();
    if (!reports.length) return;
    let changed = false;

    reports.forEach(rep => {
      if (!rep.maKCB) return;
      if (!targetMaKCB || (rep.maKCB.trim().toLowerCase() === targetMaKCB.trim().toLowerCase())) {
        const calculated = this.evaluateKetoanStatusFromRecords(rep.maKCB);
        const records = this.getRecords();
        const hasMatchedRecord = records.some(r => (r.maKCB || '').trim().toLowerCase() === rep.maKCB.trim().toLowerCase());
        if (hasMatchedRecord) {
          if (!rep.kiemKeToanBH || rep.kiemKeToanBH.status !== calculated.status || rep.kiemKeToanBH.note !== calculated.note) {
            rep.kiemKeToanBH = calculated;
            changed = true;
          }
        }
      }
    });

    if (changed) {
      this.saveDischargeReports(reports);
    }
  }

  // --- QUẢN LÝ BÁO CÁO VÀ CHỐT RA VIỆN HÀNG NGÀY (DISCHARGE REPORTS) ---
  getDischargeReports() {
    try {
      const reportsJson = localStorage.getItem(STORAGE_KEYS.DISCHARGE_REPORTS);
      const reports = reportsJson ? JSON.parse(reportsJson) : [];
      return reports;
    } catch (e) {
      console.error('Lỗi khi đọc báo cáo ra viện:', e);
      return [];
    }
  }

  saveDischargeReports(reports) {
    try {
      localStorage.setItem(STORAGE_KEYS.DISCHARGE_REPORTS, JSON.stringify(reports));
      return true;
    } catch (e) {
      console.error('Lỗi khi lưu báo cáo ra viện:', e);
      return false;
    }
  }

  addDischargeReport(reportData) {
    const reports = this.getDischargeReports();
    const newId = 'BCRV-' + Date.now().toString(36).toUpperCase();
    this.removeTombstone('discharge', newId);
    const today = new Date().toISOString().slice(0, 10);
    const reportDate = reportData.ngayBaoCao || today;

    // Tính thời gian ra viện mặc định 8h30 ngày N+1 nếu chưa truyền vào
    let defaultDischargeTime = '';
    try {
      const parts = reportDate.split('-');
      if (parts.length === 3) {
        const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
        d.setDate(d.getDate() + 1);
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const dt = String(d.getDate()).padStart(2, '0');
        defaultDischargeTime = `${y}-${m}-${dt}T08:30`;
      }
    } catch (e) {
      defaultDischargeTime = `${reportDate}T08:30`;
    }

    const autoKetoan = this.evaluateKetoanStatusFromRecords(reportData.maKCB);

    const newReport = {
      id: newId,
      ngayBaoCao: reportDate,
      ngayRaVien: reportData.ngayRaVien || defaultDischargeTime,
      maKCB: reportData.maKCB || '',
      tenBenhNhan: reportData.tenBenhNhan || '',
      tenBacSi: reportData.tenBacSi || '',
      phong: reportData.phong || this.getActiveDepartment(),
      kiemDuoc: reportData.kiemDuoc || { status: 'CO_LOI', note: '' },
      kiemKeToanBH: (reportData.kiemKeToanBH && reportData.kiemKeToanBH.status !== 'CO_LOI') ? reportData.kiemKeToanBH : autoKetoan,
      kiemKHTH: reportData.kiemKHTH || { status: 'CO_LOI', note: '' },
      baoCaoTinhTrangSuaLoi: reportData.baoCaoTinhTrangSuaLoi || '',
      chotThongCong: reportData.chotThongCong || 'CHUA',
      ngayThongCong: reportData.ngayThongCong || null,
      nguoiThongCong: reportData.nguoiThongCong || null
    };

    reports.unshift(newReport);
    this.saveDischargeReports(reports);
    this.notifyTabs();
    supabaseService.upsertDischargeReport(newReport);
    return newReport;
  }

  addBatchDischargeReports(reportsList) {
    if (!Array.isArray(reportsList) || !reportsList.length) return [];
    const currentReports = this.getDischargeReports();
    const activeDept = this.getActiveDepartment();
    const today = new Date().toISOString().slice(0, 10);

    const createdList = [];
    reportsList.forEach((item, idx) => {
      if (item.maKCB && item.tenBenhNhan) {
        const newId = 'BCRV-' + (Date.now() + idx).toString(36).toUpperCase();
        this.removeTombstone('discharge', newId);
        const reportDate = item.ngayBaoCao || today;

        let defaultDischargeTime = '';
        try {
          const parts = reportDate.split('-');
          if (parts.length === 3) {
            const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
            d.setDate(d.getDate() + 1);
            const y = d.getFullYear();
            const m = String(d.getMonth() + 1).padStart(2, '0');
            const dt = String(d.getDate()).padStart(2, '0');
            defaultDischargeTime = `${y}-${m}-${dt}T08:30`;
          }
        } catch (e) {
          defaultDischargeTime = `${reportDate}T08:30`;
        }

        const autoKetoan = this.evaluateKetoanStatusFromRecords(item.maKCB);

        const newRep = {
          id: newId,
          ngayBaoCao: reportDate,
          ngayRaVien: item.ngayRaVien || defaultDischargeTime,
          maKCB: item.maKCB.trim(),
          tenBenhNhan: item.tenBenhNhan.trim(),
          tenBacSi: (item.tenBacSi || '').trim(),
          phong: item.phong || activeDept,
          kiemDuoc: { status: 'CO_LOI', note: '' },
          kiemKeToanBH: autoKetoan,
          kiemKHTH: { status: 'CO_LOI', note: '' },
          baoCaoTinhTrangSuaLoi: '',
          chotThongCong: 'CHUA',
          ngayThongCong: null,
          nguoiThongCong: null
        };
        currentReports.unshift(newRep);
        createdList.push(newRep);
      }
    });

    this.saveDischargeReports(currentReports);
    this.notifyTabs();
    supabaseService.upsertBatchDischargeReports(createdList);
    return createdList;
  }

  updateDischargeReport(reportId, updateFields) {
    if (!reportId || this.isTombstoned('discharge', reportId)) return false;
    const reports = this.getDischargeReports();
    const index = reports.findIndex(r => r.id === reportId);
    if (index === -1) return false;
    if (reports[index].maKCB && this.isTombstoned('discharge', reports[index].maKCB)) return false;

    reports[index] = {
      ...reports[index],
      ...updateFields
    };

    this.saveDischargeReports(reports);
    this.notifyTabs();
    supabaseService.upsertDischargeReport(reports[index]);
    return reports[index];
  }

  deleteDischargeReport(reportId) {
    if (!reportId) return false;
    if (!this.canDeleteDischargeReport()) {
      console.warn('Quyền bị từ chối: Chỉ nhóm Khoa / Bác sĩ điều trị hoặc Admin mới có quyền xóa báo cáo ra viện!');
      return false;
    }
    this.addTombstone('discharge', reportId);
    let reports = this.getDischargeReports();
    const targetRep = reports.find(r => r.id === reportId || r.maKCB === reportId);
    const targetMaKCB = targetRep ? targetRep.maKCB : null;
    if (targetMaKCB) {
      this.addTombstone('discharge', targetMaKCB);
    }
    reports = reports.filter(r => r.id !== reportId && (!targetMaKCB || r.maKCB !== targetMaKCB));
    this.saveDischargeReports(reports);
    this.notifyTabs();
    supabaseService.deleteDischargeReport(reportId, targetMaKCB);
    return true;
  }

  // --- QUẢN LÝ KHOA/PHÒNG (DEPARTMENTS) ---
  getDepartments() {
    try {
      const deptsJson = localStorage.getItem(STORAGE_KEYS.DEPARTMENTS);
      if (!deptsJson) return DEFAULT_DEPARTMENTS;
      const parsed = JSON.parse(deptsJson);
      return Array.isArray(parsed) && parsed.length > 0 ? parsed : DEFAULT_DEPARTMENTS;
    } catch (e) {
      return DEFAULT_DEPARTMENTS;
    }
  }

  saveDepartments(depts) {
    if (Array.isArray(depts)) {
      localStorage.setItem(STORAGE_KEYS.DEPARTMENTS, JSON.stringify(depts));
      return true;
    }
    return false;
  }

  addDepartment(dept) {
    const depts = this.getDepartments();
    const cleanName = (dept.name || '').trim();
    const cleanCode = (dept.code || '').trim();
    const maxNum = depts.reduce((max, d) => {
      const num = parseInt((d.id || '').replace(/\D/g, ''), 10);
      return !isNaN(num) && num > max ? num : max;
    }, 0);
    const newId = 'KP' + String(maxNum + 1).padStart(2, '0');
    this.removeTombstone('departments', newId);
    const newDept = { id: newId, name: cleanName, code: cleanCode, order: depts.length + 1 };
    depts.push(newDept);
    this.saveDepartments(depts);
    this.notifyTabs();
    supabaseService.upsertDepartment(newDept);
    return newDept;
  }

  updateDepartment(id, updates) {
    const depts = this.getDepartments();
    const index = depts.findIndex(d => d.id === id);
    if (index !== -1) {
      const oldName = (depts[index].name || '').trim();
      const newName = updates.name !== undefined ? updates.name.trim() : oldName;
      const newCode = updates.code !== undefined ? updates.code.trim() : depts[index].code;

      depts[index] = { ...depts[index], ...updates, name: newName, code: newCode };
      this.saveDepartments(depts);
      this.notifyTabs();
      supabaseService.upsertDepartment(depts[index]);

      // Cascade update to records, staff, discharge_reports, and activeDepartment if department name changed
      if (newName && newName !== oldName) {
        // 1. Records
        const records = this.getRecords();
        let recordsChanged = false;
        records.forEach(r => {
          if ((r.khoaPhong || '').trim().toLowerCase() === oldName.toLowerCase()) {
            r.khoaPhong = newName;
            recordsChanged = true;
          }
        });
        if (recordsChanged) this.saveRecords(records);

        // 2. Staff
        const staff = this.getStaff();
        let staffChanged = false;
        staff.forEach(s => {
          if ((s.department || '').trim().toLowerCase() === oldName.toLowerCase()) {
            s.department = newName;
            staffChanged = true;
          }
        });
        if (staffChanged) this.saveStaff(staff);

        // 3. Discharge Reports
        const reports = this.getDischargeReports();
        let reportsChanged = false;
        reports.forEach(rep => {
          if ((rep.phong || '').trim().toLowerCase() === oldName.toLowerCase()) {
            rep.phong = newName;
            reportsChanged = true;
          }
        });
        if (reportsChanged) this.saveDischargeReports(reports);

        // 4. Active Department
        const activeDept = this.getActiveDepartment();
        if ((activeDept || '').trim().toLowerCase() === oldName.toLowerCase()) {
          this.setActiveDepartment(newName);
        }
      }
      return true;
    }
    return false;
  }

  deleteDepartment(id) {
    if (!id) return false;
    this.addTombstone('departments', id);
    let depts = this.getDepartments();
    depts = depts.filter(d => d.id !== id);
    this.saveDepartments(depts);
    this.notifyTabs();
    supabaseService.deleteDepartment(id);
    return true;
  }

  // --- QUẢN LÝ NHÂN VIÊN (STAFF) ---
  getStaff() {
    try {
      const staffJson = localStorage.getItem(STORAGE_KEYS.STAFF);
      let list = staffJson !== null ? JSON.parse(staffJson) : null;
      
      if (!list || !Array.isArray(list)) {
        list = [...DEFAULT_STAFF];
        localStorage.setItem(STORAGE_KEYS.STAFF, JSON.stringify(list));
      }

      return list.map(s => {
        if (s.defaultRole === 'NHOM_1') {
          return { ...s, defaultRole: 'KETOAN_BH' };
        }
        if (!s.username) {
          s.username = s.id ? s.id.toLowerCase() : 'user';
        }
        return s;
      });
    } catch (e) {
      return [...DEFAULT_STAFF];
    }
  }

  saveStaff(staffList) {
    localStorage.setItem(STORAGE_KEYS.STAFF, JSON.stringify(staffList));
  }

  addStaff(staffMember) {
    const staffList = this.getStaff();
    const newId = 'NV' + String(staffList.length + 1).padStart(2, '0');
    this.removeTombstone('staff', newId);
    const roleKey = staffMember.defaultRole || 'NHOM_2';
    
    // Tự sinh username nếu chưa có
    let username = staffMember.username ? staffMember.username.trim().toLowerCase() : '';
    if (!username) {
      username = 'user_' + newId.toLowerCase();
    }

    const emojiMap = {
      ADMIN: '👑',
      KHTH: '📋',
      KETOAN_BH: '💵',
      DUOC: '💊',
      IT: '💻',
      NHOM_2: '👨‍⚕️'
    };

    const newStaff = {
      id: newId,
      username: username,
      password: staffMember.password || '123',
      name: staffMember.name,
      department: staffMember.department,
      position: staffMember.position || 'Bác sĩ điều trị',
      phone: staffMember.phone || '',
      zaloId: staffMember.zaloId || '',
      defaultRole: roleKey,
      avatarEmoji: staffMember.avatarEmoji || emojiMap[roleKey] || '👨‍⚕️'
    };
    staffList.push(newStaff);
    this.saveStaff(staffList);
    this.notifyTabs();
    supabaseService.upsertStaff(newStaff);
    return newStaff;
  }

  updateStaff(id, updates) {
    const staffList = this.getStaff();
    const index = staffList.findIndex(s => s.id === id);
    if (index !== -1) {
      staffList[index] = { ...staffList[index], ...updates };
      this.saveStaff(staffList);
      this.notifyTabs();
      supabaseService.upsertStaff(staffList[index]);

      // Đồng bộ tức thời hồ sơ và phân quyền nếu nhân viên này đang đăng nhập
      const currentUser = this.getCurrentUser();
      if (currentUser && currentUser.id === id) {
        const updatedCurrentUser = { ...currentUser, ...updates };
        this.setCurrentUser(updatedCurrentUser);
      }
      return true;
    }
    return false;
  }

  deleteStaff(id) {
    if (!id) return false;
    this.addTombstone('staff', id);
    let staffList = this.getStaff();
    staffList = staffList.filter(s => s.id !== id);
    this.saveStaff(staffList);
    this.notifyTabs();
    supabaseService.deleteStaff(id);
    return true;
  }

  // --- RESET & BACKUP ---
  resetToDefaults() {
    localStorage.setItem(STORAGE_KEYS.RECORDS, JSON.stringify(DEFAULT_RECORDS));
    localStorage.setItem(STORAGE_KEYS.DISCHARGE_REPORTS, JSON.stringify(DEFAULT_DISCHARGE_REPORTS));
    localStorage.setItem(STORAGE_KEYS.DEPARTMENTS, JSON.stringify(DEFAULT_DEPARTMENTS));
    localStorage.setItem(STORAGE_KEYS.STAFF, JSON.stringify(DEFAULT_STAFF));
    localStorage.setItem(STORAGE_KEYS.PERMISSIONS, JSON.stringify(PERMISSION_COLUMNS));
    localStorage.setItem(STORAGE_KEYS.CURRENT_ROLE, 'ADMIN');
    localStorage.setItem(STORAGE_KEYS.ACTIVE_DEPT, DEFAULT_DEPARTMENTS[0].name);
    localStorage.setItem(STORAGE_KEYS.INITIALIZED, 'true');
    return true;
  }

  exportBackup() {
    return JSON.stringify({
      records: this.getRecords(),
      dischargeReports: this.getDischargeReports(),
      departments: this.getDepartments(),
      staff: this.getStaff(),
      permissions: this.getPermissionsMatrix(),
      activeDepartment: this.getActiveDepartment(),
      exportDate: new Date().toISOString()
    }, null, 2);
  }

  importBackup(jsonString) {
    try {
      const data = JSON.parse(jsonString);
      if (data.records) this.saveRecords(data.records);
      if (data.dischargeReports) this.saveDischargeReports(data.dischargeReports);
      if (data.departments) this.saveDepartments(data.departments);
      if (data.staff) this.saveStaff(data.staff);
      if (data.permissions) this.savePermissionsMatrix(data.permissions);
      if (data.activeDepartment) this.setActiveDepartment(data.activeDepartment);
      return true;
    } catch (e) {
      console.error('Lỗi khi phục hồi backup:', e);
      return false;
    }
  }
}

export const storage = new StorageService();
