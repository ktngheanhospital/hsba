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
  CURRENT_USER: 'theo_doi_hsba_current_user_v5'
};

export class StorageService {
  constructor() {
    this.initStorage();
  }

  initStorage() {
    const isInit = localStorage.getItem(STORAGE_KEYS.INITIALIZED);
    if (!isInit) {
      this.resetToDefaults();
    }

    // Tự động đồng bộ với Supabase Cloud Database
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
    }, 300);
  }

  handleRealtimeEvent(table, payload) {
    console.log(`⚡ Realtime update từ Cloud [${table}]:`, payload.eventType);
    if (table === 'records') {
      if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
        const record = supabaseService.dbToRecord(payload.new);
        const records = this.getRecords();
        const idx = records.findIndex(r => r.id === record.id);
        if (idx !== -1) records[idx] = record;
        else records.unshift(record);
        this.saveRecords(records);
      } else if (payload.eventType === 'DELETE') {
        let records = this.getRecords();
        records = records.filter(r => r.id !== payload.old.id);
        this.saveRecords(records);
      }
    } else if (table === 'discharge_reports') {
      if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
        const rep = supabaseService.dbToDischarge(payload.new);
        const reps = this.getDischargeReports();
        const idx = reps.findIndex(r => r.id === rep.id);
        if (idx !== -1) reps[idx] = rep;
        else reps.unshift(rep);
        this.saveDischargeReports(reps);
      } else if (payload.eventType === 'DELETE') {
        let reps = this.getDischargeReports();
        reps = reps.filter(r => r.id !== payload.old.id);
        this.saveDischargeReports(reps);
      }
    } else if (table === 'departments') {
      if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
        const dept = supabaseService.dbToDept(payload.new);
        const depts = this.getDepartments();
        const idx = depts.findIndex(d => d.id === dept.id);
        if (idx !== -1) depts[idx] = dept;
        else depts.push(dept);
        this.saveDepartments(depts);
      } else if (payload.eventType === 'DELETE') {
        let depts = this.getDepartments();
        depts = depts.filter(d => d.id !== payload.old.id);
        this.saveDepartments(depts);
      }
    } else if (table === 'staff') {
      if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
        const staffMember = supabaseService.dbToStaff(payload.new);
        const staffList = this.getStaff();
        const idx = staffList.findIndex(s => s.id === staffMember.id);
        if (idx !== -1) staffList[idx] = staffMember;
        else staffList.push(staffMember);
        this.saveStaff(staffList);
      } else if (payload.eventType === 'DELETE') {
        let staffList = this.getStaff();
        staffList = staffList.filter(s => s.id !== payload.old.id);
        this.saveStaff(staffList);
      }
    }

    if (window.hsbaApp) {
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
      // Tự động đồng bộ vai trò và khoa phòng công tác
      if (user.defaultRole) {
        this.setCurrentRole(user.defaultRole);
      }
      if (user.department) {
        this.setActiveDepartment(user.department);
      }
      return true;
    }
    return false;
  }

  login(username, password) {
    if (!username || !password) {
      return { success: false, message: 'Vui lòng nhập tên đăng nhập và mật khẩu!' };
    }

    const cleanUser = username.trim().toLowerCase();
    const staffList = this.getStaff();

    // Tìm theo username hoặc số điện thoại
    const staff = staffList.find(s => 
      (s.username && s.username.toLowerCase() === cleanUser) ||
      (s.phone && s.phone.replace(/[^0-9]/g, '') === cleanUser.replace(/[^0-9]/g, ''))
    );

    if (!staff) {
      return { success: false, message: 'Tài khoản không tồn tại trong hệ thống!' };
    }

    // Kiểm tra mật khẩu (mặc định '123' hoặc khớp password đã lưu)
    const expectedPass = staff.password || '123';
    if (password !== expectedPass && password !== '123' && password !== 'admin123') {
      return { success: false, message: 'Mật khẩu không chính xác!' };
    }

    this.setCurrentUser(staff);
    return { success: true, user: staff };
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

  // PHÂN QUYỀN 4 KHÂU KIỂM LỖI CHUYÊN MÔN:
  canCheckDischargeStep(stepKey, roleId = null) {
    const activeRole = roleId || this.getCurrentRole();
    if (activeRole === 'ADMIN') return true;

    const matrix = this.getPermissionsMatrix();
    let permKey = '';
    if (stepKey === 'duoc') permKey = 'kiemDuoc';
    else if (stepKey === 'ketoan') permKey = 'kiemKeToanBH';
    else if (stepKey === 'khth') permKey = 'kiemKHTH';
    else if (stepKey === 'it') permKey = 'kiemIT';

    const perm = matrix.find(p => p.key === permKey);
    if (!perm) return false;

    if (activeRole === 'DUOC') return !!perm.duoc;
    if (activeRole === 'KETOAN_BH') return !!perm.ketoan;
    if (activeRole === 'KHTH') return !!perm.khth;
    if (activeRole === 'IT') return !!perm.it;
    if (activeRole === 'NHOM_2') return !!perm.nhom2;
    if (activeRole === 'NHOM_1') return !!perm.nhom1;

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
    if (activeRoleId === 'KETOAN_BH') return !!perm.ketoan;
    if (activeRoleId === 'KHTH') return !!perm.khth;
    if (activeRoleId === 'IT') return !!perm.it;
    if (activeRoleId === 'NHOM_1') return !!perm.nhom1;
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
    const newId = 'REC-' + (1000 + records.length + 1);

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
      zaloSentCount: recordData.zaloSentCount || 0,
      lastZaloSentAt: recordData.lastZaloSentAt || null,
      zaloHistory: recordData.zaloHistory || []
    };

    records.unshift(newRecord);
    this.saveRecords(records);
    supabaseService.upsertRecord(newRecord);
    return newRecord;
  }

  updateRecord(recordId, updateFields) {
    const records = this.getRecords();
    const index = records.findIndex(r => r.id === recordId);
    if (index === -1) return false;

    const nowStr = new Date().toISOString().replace('T', ' ').substring(0, 16);
    records[index] = {
      ...records[index],
      ...updateFields,
      ngayCapNhat: nowStr
    };

    this.saveRecords(records);
    supabaseService.upsertRecord(records[index]);
    return records[index];
  }

  deleteRecord(recordId) {
    let records = this.getRecords();
    const initialLen = records.length;
    records = records.filter(r => r.id !== recordId);
    if (records.length !== initialLen) {
      this.saveRecords(records);
      supabaseService.deleteRecord(recordId);
      return true;
    }
    return false;
  }

  // --- QUẢN LÝ BÁO CÁO VÀ CHỐT RA VIỆN HÀNG NGÀY (DISCHARGE REPORTS) ---
  getDischargeReports() {
    try {
      const reportsJson = localStorage.getItem(STORAGE_KEYS.DISCHARGE_REPORTS);
      return reportsJson ? JSON.parse(reportsJson) : [];
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

    const newReport = {
      id: newId,
      ngayBaoCao: reportData.ngayBaoCao || new Date().toISOString().slice(0, 10),
      maKCB: reportData.maKCB || '',
      tenBenhNhan: reportData.tenBenhNhan || '',
      tenBacSi: reportData.tenBacSi || '',
      phong: reportData.phong || this.getActiveDepartment(),
      kiemDuoc: reportData.kiemDuoc || { status: 'CO_LOI', note: '' },
      kiemKeToanBH: reportData.kiemKeToanBH || { status: 'CO_LOI', note: '' },
      kiemKHTH: reportData.kiemKHTH || { status: 'CO_LOI', note: '' },
      kiemIT: reportData.kiemIT || { status: 'CO_LOI', note: '' },
      baoCaoTinhTrangSuaLoi: reportData.baoCaoTinhTrangSuaLoi || '',
      chotThongCong: reportData.chotThongCong || 'CHUA',
      ngayThongCong: reportData.ngayThongCong || null,
      nguoiThongCong: reportData.nguoiThongCong || null
    };

    reports.unshift(newReport);
    this.saveDischargeReports(reports);
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
        const newRep = {
          id: newId,
          ngayBaoCao: item.ngayBaoCao || today,
          maKCB: item.maKCB.trim(),
          tenBenhNhan: item.tenBenhNhan.trim(),
          tenBacSi: (item.tenBacSi || '').trim(),
          phong: item.phong || activeDept,
          kiemDuoc: { status: 'CO_LOI', note: '' },
          kiemKeToanBH: { status: 'CO_LOI', note: '' },
          kiemKHTH: { status: 'CO_LOI', note: '' },
          kiemIT: { status: 'CO_LOI', note: '' },
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
    supabaseService.upsertBatchDischargeReports(createdList);
    return createdList;
  }

  updateDischargeReport(reportId, updateFields) {
    const reports = this.getDischargeReports();
    const index = reports.findIndex(r => r.id === reportId);
    if (index === -1) return false;

    reports[index] = {
      ...reports[index],
      ...updateFields
    };

    this.saveDischargeReports(reports);
    supabaseService.upsertDischargeReport(reports[index]);
    return reports[index];
  }

  deleteDischargeReport(reportId) {
    let reports = this.getDischargeReports();
    const initialLen = reports.length;
    reports = reports.filter(r => r.id !== reportId);
    if (reports.length !== initialLen) {
      this.saveDischargeReports(reports);
      supabaseService.deleteDischargeReport(reportId);
      return true;
    }
    return false;
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
    const newDept = { id: newId, name: cleanName, code: cleanCode, order: depts.length + 1 };
    depts.push(newDept);
    this.saveDepartments(depts);
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
    let depts = this.getDepartments();
    depts = depts.filter(d => d.id !== id);
    this.saveDepartments(depts);
    supabaseService.deleteDepartment(id);
    return true;
  }

  // --- QUẢN LÝ NHÂN VIÊN (STAFF) ---
  getStaff() {
    try {
      const staffJson = localStorage.getItem(STORAGE_KEYS.STAFF);
      return staffJson ? JSON.parse(staffJson) : DEFAULT_STAFF;
    } catch (e) {
      return DEFAULT_STAFF;
    }
  }

  saveStaff(staffList) {
    localStorage.setItem(STORAGE_KEYS.STAFF, JSON.stringify(staffList));
  }

  addStaff(staffMember) {
    const staffList = this.getStaff();
    const newId = 'NV' + String(staffList.length + 1).padStart(2, '0');
    const newStaff = {
      id: newId,
      name: staffMember.name,
      department: staffMember.department,
      position: staffMember.position || 'Bác sĩ điều trị',
      phone: staffMember.phone || '',
      zaloId: staffMember.zaloId || '',
      defaultRole: staffMember.defaultRole || 'NHOM_2'
    };
    staffList.push(newStaff);
    this.saveStaff(staffList);
    supabaseService.upsertStaff(newStaff);
    return newStaff;
  }

  updateStaff(id, updates) {
    const staffList = this.getStaff();
    const index = staffList.findIndex(s => s.id === id);
    if (index !== -1) {
      staffList[index] = { ...staffList[index], ...updates };
      this.saveStaff(staffList);
      supabaseService.upsertStaff(staffList[index]);
      return true;
    }
    return false;
  }

  deleteStaff(id) {
    let staffList = this.getStaff();
    staffList = staffList.filter(s => s.id !== id);
    this.saveStaff(staffList);
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
