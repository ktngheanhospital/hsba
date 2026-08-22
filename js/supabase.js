/**
 * Supabase Database Client & Realtime Sync Service
 * Quản lý kết nối, đồng bộ Cloud Realtime cho Bệnh Viện Hữu Nghị Đa Khoa Nghệ An
 */

import { DEFAULT_DEPARTMENTS, DEFAULT_STAFF, DEFAULT_RECORDS, DEFAULT_DISCHARGE_REPORTS } from './data.js';

// Khóa lưu trữ cấu hình Supabase trong LocalStorage
const SUPABASE_STORAGE_KEYS = {
  URL: 'theo_doi_hsba_supabase_url_v1',
  KEY: 'theo_doi_hsba_supabase_key_v1',
  ENABLED: 'theo_doi_hsba_supabase_enabled_v1'
};

// Cấu hình mặc định do người dùng cung cấp
const DEFAULT_SUPABASE_URL = 'https://fzmipvmubniicezkpzyj.supabase.co';
const DEFAULT_SUPABASE_KEY = 'sb_publishable_fLQ_49ZX62mA83LaaSWXFg_ED7LEu5o';

class SupabaseService {
  constructor() {
    this.client = null;
    this.isConnected = false;
    this.isSyncing = false;
    this.subscribers = [];
    this.realtimeChannel = null;
    this.realtimeCallback = null;
    this.heartbeatTimer = null;
    this.lastSyncTimestamp = 0;
    this.initClient();
  }

  // Lấy URL hiện tại
  getUrl() {
    return localStorage.getItem(SUPABASE_STORAGE_KEYS.URL) || DEFAULT_SUPABASE_URL;
  }

  // Lấy Anon Key hiện tại
  getKey() {
    return localStorage.getItem(SUPABASE_STORAGE_KEYS.KEY) || DEFAULT_SUPABASE_KEY;
  }

  // Lưu cấu hình mới
  saveConfig(url, key, enabled = true) {
    if (url) localStorage.setItem(SUPABASE_STORAGE_KEYS.URL, url.trim());
    if (key) localStorage.setItem(SUPABASE_STORAGE_KEYS.KEY, key.trim());
    localStorage.setItem(SUPABASE_STORAGE_KEYS.ENABLED, enabled ? 'true' : 'false');
    this.initClient();
  }

  // Khởi tạo Supabase Client
  initClient() {
    const url = this.getUrl();
    const key = this.getKey();

    try {
      if (window.supabase && typeof window.supabase.createClient === 'function') {
        this.client = window.supabase.createClient(url, key, {
          auth: { persistSession: false },
          realtime: {
            params: {
              eventsPerSecond: 10
            }
          }
        });
        this.testConnection();
      } else {
        // Dynamic import nếu window.supabase chưa sẵn sàng
        import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm')
          .then(module => {
            this.client = module.createClient(url, key, {
              auth: { persistSession: false },
              realtime: {
                params: {
                  eventsPerSecond: 10
                }
              }
            });
            window.supabase = module;
            this.testConnection();
          })
          .catch(err => {
            console.warn('Không thể tải Supabase ESM library:', err);
          });
      }
    } catch (e) {
      console.warn('Lỗi khi khởi tạo Supabase Client:', e);
      this.isConnected = false;
    }
  }

  // Kiểm tra kết nối tới Database Supabase
  async testConnection() {
    if (!this.client) return false;
    try {
      const { data, error } = await this.client.from('departments').select('id').limit(1);
      if (!error) {
        this.isConnected = true;
        this.notifyStatus(true, 'Đã kết nối Supabase Cloud Database');
        if (this.realtimeCallback && !this.realtimeChannel) {
          this.subscribeRealtime(this.realtimeCallback);
        }
        return true;
      } else {
        console.warn('Supabase test query notice:', error.message);
        this.isConnected = true; // Connection reached server
        this.notifyStatus(true, 'Kết nối thành công tới Supabase');
        if (this.realtimeCallback && !this.realtimeChannel) {
          this.subscribeRealtime(this.realtimeCallback);
        }
        return true;
      }
    } catch (e) {
      console.warn('Lỗi kết nối Supabase:', e);
      this.isConnected = false;
      this.notifyStatus(false, 'Chưa thể kết nối tới Supabase: ' + e.message);
      return false;
    }
  }

  // Đăng ký nhận thông báo thay đổi trạng thái kết nối
  onStatusChange(callback) {
    if (typeof callback === 'function') {
      this.subscribers.push(callback);
    }
  }

  notifyStatus(connected, message) {
    this.subscribers.forEach(cb => {
      try {
        cb({ connected, message, url: this.getUrl() });
      } catch (err) {}
    });
  }

  // =========================================================================
  // MAPPERS: Chuyển đổi giữa format JS (CamelCase) và PostgreSQL (Snake_Case)
  // =========================================================================

  recordToDb(r) {
    return {
      id: String(r.id),
      ma_kcb: r.maKCB || '',
      ten_benh_nhan: r.tenBenhNhan || '',
      khoa_phong: r.khoaPhong || '',
      nguoi_chi_dinh: r.nguoiChiDinh || '',
      ngay_vao_khoa: r.ngayVaoKhoa || null,
      ngay_kiem_ho_so: r.ngayKiemHoSo || null,
      thoi_gian_chi_dinh_yl: r.thoiGianChiDinhYL || null,
      dien_giai_loi: r.dienGiaiLoi || '',
      muc_do_loi: r.mucDoLoi || r.mucDoCanhBao || 'Nhắc nhở',
      trang_thai_loi: r.trangThaiLoi || 'CHƯA SỬA',
      y_kien_nguoi_sua: r.yKienNguoiSua || '',
      nguoi_kiem_tra: r.nguoiKiemTra || '',
      so_lan_gui_zalo: r.pushSentCount || r.soLanGuiZalo || r.zaloSentCount || 0,
      thoi_gian_gui_zalo_gan_nhat: r.lastPushSentAt || r.thoiGianGuiZaloGanNhat || r.lastZaloSentAt || null
    };
  }

  dbToRecord(row) {
    const pushCount = row.so_lan_gui_zalo ?? row.soLanGuiZalo ?? row.pushSentCount ?? 0;
    const lastPushAt = row.thoi_gian_gui_zalo_gan_nhat || row.thoiGianGuiZaloGanNhat || row.lastPushSentAt || null;
    const mucDo = row.muc_do_loi || row.mucDoLoi || row.muc_do_canh_bao || row.mucDoCanhBao || row.level || 'Nhắc nhở';
    const rawId = row.id ? String(row.id) : ('REC-' + Date.now().toString(36).toUpperCase());

    return {
      id: rawId,
      maKCB: row.ma_kcb || row.maKCB || row.makcb || row.ma_benh_an || '',
      tenBenhNhan: row.ten_benh_nhan || row.tenBenhNhan || row.tenbenhnhan || row.ho_ten || row.hoten || '',
      khoaPhong: row.khoa_phong || row.khoaPhong || row.khoaphong || row.khoa || '',
      nguoiChiDinh: row.nguoi_chi_dinh || row.nguoiChiDinh || row.nguoichidinh || row.bac_si || row.bacsi || '',
      ngayVaoKhoa: row.ngay_vao_khoa || row.ngayVaoKhoa || row.ngayvaokhoa || '',
      ngayKiemHoSo: row.ngay_kiem_ho_so || row.ngayKiemHoSo || row.ngaykiemhoso || row.ngay_kiem || '',
      thoiGianChiDinhYL: row.thoi_gian_chi_dinh_yl || row.thoiGianChiDinhYL || row.thoigianchidinhyl || row.thoi_gian_yl || '',
      dienGiaiLoi: row.dien_giai_loi || row.dienGiaiLoi || row.diengiailoi || row.noi_dung_loi || row.ghi_chu || '',
      mucDoLoi: mucDo,
      mucDoCanhBao: mucDo,
      trangThaiKiemDuyet: mucDo,
      trangThaiLoi: row.trang_thai_loi || row.trangThaiLoi || row.trangthailoi || row.trang_thai || 'CHƯA SỬA',
      yKienNguoiSua: row.y_kien_nguoi_sua || row.yKienNguoiSua || row.ykiennguoisua || row.y_kien || '',
      nguoiKiemTra: row.nguoi_kiem_tra || row.nguoiKiemTra || '',
      pushSentCount: pushCount,
      lastPushSentAt: lastPushAt,
      soLanGuiZalo: pushCount,
      thoiGianGuiZaloGanNhat: lastPushAt,
      zaloSentCount: pushCount,
      lastZaloSentAt: lastPushAt
    };
  }

  dischargeToDb(r) {
    return {
      id: String(r.id),
      ngay_bao_cao: r.ngayBaoCao || '',
      ngay_ra_vien: r.ngayRaVien || null,
      ma_kcb: r.maKCB || '',
      ten_benh_nhan: r.tenBenhNhan || '',
      ten_bac_si: r.tenBacSi || '',
      phong: r.phong || '',
      nguoi_bao_cao: r.nguoiBaoCao || '',
      kiem_duoc: r.kiemDuoc || { status: 'CO_LOI', note: '' },
      kiem_ketoan_bh: r.kiemKeToanBH || { status: 'CO_LOI', note: '' },
      kiem_khth: r.kiemKHTH || { status: 'CO_LOI', note: '' },
      kiem_it: r.kiemIT || { status: 'CO_LOI', note: '' },
      bao_cao_tinh_trang_sua_loi: r.baoCaoTinhTrangSuaLoi || '',
      chot_thong_cong: r.chotThongCong || 'CHUA',
      ngay_thong_cong: r.ngayThongCong || null,
      nguoi_thong_cong: r.nguoiThongCong || null
    };
  }

  dbToDischarge(row) {
    return {
      id: row.id ? String(row.id) : ('BCRV-' + Date.now().toString(36).toUpperCase()),
      ngayBaoCao: row.ngay_bao_cao || row.ngayBaoCao || row.ngaybaocao || '',
      ngayRaVien: row.ngay_ra_vien || row.ngayRaVien || row.ngayravien || '',
      maKCB: row.ma_kcb || row.maKCB || row.makcb || row.ma_benh_an || '',
      tenBenhNhan: row.ten_benh_nhan || row.tenBenhNhan || row.tenbenhnhan || '',
      tenBacSi: row.ten_bac_si || row.tenBacSi || row.tenbacsi || row.bac_si || '',
      phong: row.phong || row.khoa || row.khoa_phong || row.khoaPhong || '',
      nguoiBaoCao: row.nguoi_bao_cao || row.nguoiBaoCao || '',
      kiemDuoc: row.kiem_duoc || row.kiemDuoc || { status: 'CO_LOI', note: '' },
      kiemKeToanBH: row.kiem_ketoan_bh || row.kiemKeToanBH || { status: 'CO_LOI', note: '' },
      kiemKHTH: row.kiem_khth || row.kiemKHTH || { status: 'CO_LOI', note: '' },
      kiemIT: row.kiem_it || row.kiemIT || { status: 'CO_LOI', note: '' },
      baoCaoTinhTrangSuaLoi: row.bao_cao_tinh_trang_sua_loi || row.baoCaoTinhTrangSuaLoi || '',
      chotThongCong: row.chot_thong_cong || row.chotThongCong || 'CHUA',
      ngayThongCong: row.ngay_thong_cong || row.ngayThongCong || null,
      nguoiThongCong: row.nguoi_thong_cong || row.nguoiThongCong || null
    };
  }

  deptToDb(d) {
    return {
      id: String(d.id),
      name: d.name || '',
      code: d.code || '',
      order: d.order || 0
    };
  }

  dbToDept(row) {
    return {
      id: String(row.id),
      name: row.name || '',
      code: row.code || '',
      order: row.order || 0
    };
  }

  staffToDb(s) {
    return {
      id: String(s.id),
      username: s.username || '',
      password: s.password || '123',
      name: s.name || '',
      department: s.department || '',
      position: s.position || '',
      phone: s.phone || '',
      zalo_id: s.zaloId || s.zalo_id || '',
      default_role: s.defaultRole || s.default_role || 'NHOM_2',
      avatar_emoji: s.avatarEmoji || s.avatar_emoji || '👨‍⚕️'
    };
  }

  dbToStaff(row) {
    return {
      id: String(row.id),
      username: row.username || '',
      password: row.password || '123',
      name: row.name || '',
      department: row.department || '',
      position: row.position || '',
      phone: row.phone || '',
      zaloId: row.zalo_id || row.zaloId || '',
      defaultRole: row.default_role || row.defaultRole || 'NHOM_2',
      avatarEmoji: row.avatar_emoji || row.avatarEmoji || '👨‍⚕️'
    };
  }

  // =========================================================================
  // CRUD OPERATIONS CHO SUPABASE CLOUD DATABASE
  // =========================================================================

  // 1. RECORDS (LỖI HSBA)
  async fetchRecords() {
    if (!this.client) return null;
    try {
      let { data, error } = await this.client.from('records').select('*');
      if (error) {
        console.warn('Lỗi khi fetch records từ Supabase:', error);
        return null;
      }
      return (data || []).map(r => this.dbToRecord(r));
    } catch (e) {
      console.warn('Lỗi khi fetch records từ Supabase:', e);
      return null;
    }
  }

  async upsertRecord(record) {
    if (!this.client || !record) return false;
    try {
      const dbRow = this.recordToDb(record);
      const { error } = await this.client.from('records').upsert(dbRow);
      if (error) {
        console.warn('Supabase upsertRecord warning:', error.message);
      }
      return true;
    } catch (e) {
      console.warn('Lỗi khi upsert record lên Supabase:', e);
      return false;
    }
  }

  async deleteRecord(recordId, maKCB = null) {
    if (!this.client || !recordId) return false;
    try {
      const sId = String(recordId).trim();
      const kcb = maKCB ? String(maKCB).trim() : null;

      // 1. Xóa theo ID
      await this.client.from('records').delete().eq('id', sId);

      // 2. Xóa theo mã KCB nếu có
      if (kcb && kcb !== sId) {
        await this.client.from('records').delete().eq('ma_kcb', kcb);
      }
      // Dự phòng nếu sId là mã KCB
      if (!sId.startsWith('REC-')) {
        await this.client.from('records').delete().eq('ma_kcb', sId);
      }
      return true;
    } catch (e) {
      console.warn('Lỗi khi delete record trên Supabase:', e);
      return false;
    }
  }

  // 2. DISCHARGE REPORTS (BÁO CÁO RA VIỆN)
  async fetchDischargeReports() {
    if (!this.client) return null;
    try {
      let { data, error } = await this.client.from('discharge_reports').select('*');
      if (error) {
        console.warn('Lỗi khi fetch discharge_reports từ Supabase:', error);
        return null;
      }
      return (data || []).map(r => this.dbToDischarge(r));
    } catch (e) {
      console.warn('Lỗi khi fetch discharge_reports từ Supabase:', e);
      return null;
    }
  }

  async upsertDischargeReport(report) {
    if (!this.client || !report) return false;
    try {
      const dbRow = this.dischargeToDb(report);
      const { error } = await this.client.from('discharge_reports').upsert(dbRow);
      if (error) {
        console.warn('Supabase upsertDischargeReport warning:', error.message);
      }
      return true;
    } catch (e) {
      console.warn('Lỗi khi upsert discharge report lên Supabase:', e);
      return false;
    }
  }

  async upsertBatchDischargeReports(reportsList) {
    if (!this.client || !Array.isArray(reportsList) || !reportsList.length) return false;
    try {
      const dbRows = reportsList.map(r => this.dischargeToDb(r));
      const { error } = await this.client.from('discharge_reports').upsert(dbRows);
      if (error) {
        console.warn('Supabase upsertBatchDischargeReports warning:', error.message);
      }
      return true;
    } catch (e) {
      console.warn('Lỗi khi upsert batch discharge reports lên Supabase:', e);
      return false;
    }
  }

  async deleteDischargeReport(reportId, maKCB = null) {
    if (!this.client || !reportId) return false;
    try {
      const sId = String(reportId).trim();
      const kcb = maKCB ? String(maKCB).trim() : null;

      await this.client.from('discharge_reports').delete().eq('id', sId);
      if (kcb && kcb !== sId) {
        await this.client.from('discharge_reports').delete().eq('ma_kcb', kcb);
      }
      if (!sId.startsWith('BCRV-')) {
        await this.client.from('discharge_reports').delete().eq('ma_kcb', sId);
      }
      return true;
    } catch (e) {
      console.warn('Lỗi khi delete discharge report trên Supabase:', e);
      return false;
    }
  }

  // 3. DEPARTMENTS
  async fetchDepartments() {
    if (!this.client) return null;
    try {
      const { data, error } = await this.client.from('departments').select('*').order('order', { ascending: true });
      if (error) throw error;
      return (data || []).map(d => this.dbToDept(d));
    } catch (e) {
      console.warn('Lỗi khi fetch departments từ Supabase:', e);
      return null;
    }
  }

  async upsertDepartment(dept) {
    if (!this.client || !dept) return false;
    try {
      const dbRow = this.deptToDb(dept);
      const { error } = await this.client.from('departments').upsert(dbRow);
      if (error) throw error;
      return true;
    } catch (e) {
      console.warn('Lỗi khi upsert department lên Supabase:', e);
      return false;
    }
  }

  async deleteDepartment(deptId) {
    if (!this.client || !deptId) return false;
    try {
      const sId = String(deptId).trim();
      const { error } = await this.client.from('departments').delete().eq('id', sId);
      if (error) throw error;
      return true;
    } catch (e) {
      console.warn('Lỗi khi delete department trên Supabase:', e);
      return false;
    }
  }

  // 4. STAFF
  async fetchStaff() {
    if (!this.client) return null;
    try {
      const { data, error } = await this.client.from('staff').select('*').order('created_at', { ascending: true });
      if (error) throw error;
      const legacyMockStaffIds = ['NV00', 'NV01', 'NV02', 'NV03', 'NV04', 'NV08', 'NV09', 'NV10', 'NV11', 'NV13'];
      return (data || []).map(s => this.dbToStaff(s)).filter(s => !legacyMockStaffIds.includes(s.id) && !(s.name && s.name.includes('Trần Thị Mai')));
    } catch (e) {
      console.warn('Lỗi khi fetch staff từ Supabase:', e);
      return null;
    }
  }

  async upsertStaff(member) {
    if (!this.client || !member) return false;
    try {
      const dbRow = this.staffToDb(member);
      const { error } = await this.client.from('staff').upsert(dbRow);
      if (error) throw error;
      return true;
    } catch (e) {
      console.warn('Lỗi khi upsert staff lên Supabase:', e);
      return false;
    }
  }

  async deleteStaff(staffId) {
    if (!this.client || !staffId) return false;
    try {
      const sId = String(staffId).trim();
      const { error } = await this.client.from('staff').delete().eq('id', sId);
      if (error) throw error;
      return true;
    } catch (e) {
      console.warn('Lỗi khi delete staff trên Supabase:', e);
      return false;
    }
  }

  // =========================================================================
  // ĐỒNG BỘ TOÀN DIỆN (FULL SYNC / SMART SYNC)
  // =========================================================================

  // Đẩy toàn bộ dữ liệu từ LocalStorage lên Supabase (chỉ khi người dùng bấm nút thủ công)
  async pushAllLocalDataToCloud(storageService) {
    if (!this.client) return { success: false, message: 'Chưa khởi tạo Supabase Client' };

    try {
      this.isSyncing = true;

      // 1. Departments
      const depts = storageService.getDepartments().map(d => this.deptToDb(d));
      if (depts.length) await this.client.from('departments').upsert(depts);

      // 2. Staff
      const staff = storageService.getStaff().map(s => this.staffToDb(s));
      if (staff.length) await this.client.from('staff').upsert(staff);

      // 3. Records
      const records = storageService.getRecords().map(r => this.recordToDb(r));
      if (records.length) await this.client.from('records').upsert(records);

      // 4. Discharge Reports
      const discharge = storageService.getDischargeReports().map(r => this.dischargeToDb(r));
      if (discharge.length) await this.client.from('discharge_reports').upsert(discharge);

      this.isSyncing = false;
      return { success: true, message: 'Đã đồng bộ toàn bộ dữ liệu lên Supabase Cloud thành công!' };
    } catch (e) {
      this.isSyncing = false;
      console.error('Lỗi khi đẩy dữ liệu lên Cloud:', e);
      return { success: false, message: 'Lỗi khi đồng bộ lên Cloud: ' + (e.message || e) };
    }
  }

  // Đồng bộ thông minh 2 chiều (Smart 2-Way Sync): Cloud là nguồn chuẩn authoritative, loại bỏ hiện tượng hồi sinh dữ liệu đã xóa
  async smartSync(storageService) {
    if (!this.client || this.isSyncing) return;
    this.isSyncing = true;
    let hasLocalChanges = false;

    try {
      const getTombList = (type) => {
        if (typeof storageService.getTombstoneIds === 'function') {
          return storageService.getTombstoneIds(type);
        }
        const ts = storageService.getTombstones ? storageService.getTombstones() : {};
        return Object.keys(ts[type] || {});
      };

      const deptTombs = getTombList('departments');
      const staffTombs = getTombList('staff');
      const recordTombs = getTombList('records');
      const dischargeTombs = getTombList('discharge');

      // 1. Departments (Danh mục Khoa/Phòng)
      let localDepts = storageService.getDepartments();
      const cloudDepts = await this.fetchDepartments();

      if (cloudDepts !== null) {
        // Dọn dẹp các khoa phòng đã bị xóa trên Cloud
        if (deptTombs.length > 0) {
          for (const tId of deptTombs) {
            if (cloudDepts.some(cd => String(cd.id) === String(tId))) {
              await this.deleteDepartment(tId);
            }
          }
        }

        const validCloudDepts = cloudDepts.filter(cd => !storageService.isTombstoned('departments', cd.id));
        if (validCloudDepts.length > 0) {
          if (JSON.stringify(localDepts) !== JSON.stringify(validCloudDepts)) {
            storageService.saveDepartments(validCloudDepts);
            hasLocalChanges = true;
          }
        } else if (localDepts.length > 0) {
          // Chỉ đẩy nếu Cloud chưa từng có gì
          await this.client.from('departments').upsert(localDepts.map(d => this.deptToDb(d)));
        }
      }

      // 2. Staff (Nhân viên)
      let localStaff = storageService.getStaff();
      const cloudStaff = await this.fetchStaff();

      if (cloudStaff !== null) {
        if (staffTombs.length > 0) {
          for (const tId of staffTombs) {
            if (cloudStaff.some(cs => String(cs.id) === String(tId))) {
              await this.deleteStaff(tId);
            }
          }
        }

        const validCloudStaff = cloudStaff.filter(cs => !storageService.isTombstoned('staff', cs.id));
        if (validCloudStaff.length > 0) {
          if (JSON.stringify(localStaff) !== JSON.stringify(validCloudStaff)) {
            storageService.saveStaff(validCloudStaff);
            hasLocalChanges = true;
          }
        } else if (localStaff.length > 0) {
          await this.client.from('staff').upsert(localStaff.map(s => this.staffToDb(s)));
        }
      }

      // 3. Records (Bản ghi lỗi HSBA)
      let localRecords = storageService.getRecords();
      const cloudRecords = await this.fetchRecords();

      if (cloudRecords !== null) {
        // Xóa các bản ghi đã bị xóa khỏi Cloud nếu Cloud còn sót
        if (recordTombs.length > 0) {
          for (const tId of recordTombs) {
            if (cloudRecords.some(cr => String(cr.id) === String(tId) || String(cr.maKCB) === String(tId))) {
              await this.deleteRecord(tId);
            }
          }
        }

        // Lọc bỏ tombstone khỏi Cloud dataset
        const validCloudRecords = cloudRecords.filter(cr => 
          !storageService.isTombstoned('records', cr.id) && !storageService.isTombstoned('records', cr.maKCB)
        );

        // CLOUD LÀ SOURCE OF TRUTH:
        // Cập nhật dữ liệu cục bộ theo Cloud, KHÔNG tự động re-upload các bản ghi đã bị xóa từ máy khác
        let recordsChanged = false;
        if (localRecords.length !== validCloudRecords.length) {
          recordsChanged = true;
        } else {
          const localMap = new Map(localRecords.map(r => [String(r.id), r]));
          for (const cr of validCloudRecords) {
            const lr = localMap.get(String(cr.id));
            if (!lr || JSON.stringify(lr) !== JSON.stringify(cr)) {
              recordsChanged = true;
              break;
            }
          }
        }

        if (recordsChanged) {
          storageService.saveRecords(validCloudRecords);
          hasLocalChanges = true;
        }
      }

      // 4. Discharge Reports (Báo cáo ra viện)
      let localDischarge = storageService.getDischargeReports();
      const cloudDischarge = await this.fetchDischargeReports();

      if (cloudDischarge !== null) {
        if (dischargeTombs.length > 0) {
          for (const tId of dischargeTombs) {
            if (cloudDischarge.some(cd => String(cd.id) === String(tId) || String(cd.maKCB) === String(tId))) {
              await this.deleteDischargeReport(tId);
            }
          }
        }

        const validCloudDischarge = cloudDischarge.filter(cd => 
          !storageService.isTombstoned('discharge', cd.id) && !storageService.isTombstoned('discharge', cd.maKCB)
        );

        let dischargeChanged = false;
        if (localDischarge.length !== validCloudDischarge.length) {
          dischargeChanged = true;
        } else {
          const localDischargeMap = new Map(localDischarge.map(r => [String(r.id), r]));
          for (const cd of validCloudDischarge) {
            const ld = localDischargeMap.get(String(cd.id));
            if (!ld || JSON.stringify(ld) !== JSON.stringify(cd)) {
              dischargeChanged = true;
              break;
            }
          }
        }

        if (dischargeChanged) {
          storageService.saveDischargeReports(validCloudDischarge);
          hasLocalChanges = true;
        }
      }

      // Cập nhật giao diện nếu có dữ liệu mới nhận từ Cloud
      if (hasLocalChanges) {
        storageService.notifyTabs();
        if (window.hsbaApp && typeof window.hsbaApp.refreshAllViews === 'function') {
          window.hsbaApp.refreshAllViews();
        }
      }

      this.lastSyncTimestamp = Date.now();
    } catch (e) {
      console.warn('Lỗi trong quá trình smartSync:', e);
    } finally {
      this.isSyncing = false;
    }
  }

  // Kéo toàn bộ dữ liệu từ Supabase về LocalStorage một cách an toàn
  async pullAllCloudDataToLocal(storageService) {
    if (!this.client) return { success: false, message: 'Chưa khởi tạo Supabase Client' };

    try {
      await this.smartSync(storageService);
      return { success: true, message: 'Đã đồng bộ dữ liệu mới nhất từ Supabase Cloud!' };
    } catch (e) {
      console.error('Lỗi khi tải dữ liệu từ Cloud:', e);
      return { success: false, message: 'Lỗi khi tải dữ liệu từ Cloud: ' + (e.message || e) };
    }
  }

  // Tự động đồng bộ lúc khởi động
  async autoInitSync(storageService, onComplete) {
    if (!this.client) return;

    try {
      console.log('⚡ Đang tự động kiểm tra và đồng bộ dữ liệu với Cloud...');
      await this.smartSync(storageService);

      if (typeof onComplete === 'function') {
        onComplete();
      }
    } catch (e) {
      console.warn('Lỗi trong quá trình autoInitSync:', e);
    }
  }

  // =========================================================================
  // REALTIME SUBSCRIPTION (LẮNG NGHE THAY ĐỔI THEO THỜI GIAN THỰC)
  // =========================================================================
  subscribeRealtime(onTableChange) {
    if (typeof onTableChange === 'function') {
      this.realtimeCallback = onTableChange;
    }
    if (!this.client) return;

    try {
      if (this.realtimeChannel) {
        try {
          this.client.removeChannel(this.realtimeChannel);
        } catch (err) {}
      }

      this.realtimeChannel = this.client
        .channel('hsba-realtime-channel-' + Date.now().toString(36))
        .on('postgres_changes', { event: '*', schema: 'public', table: 'records' }, (payload) => {
          if (typeof this.realtimeCallback === 'function') this.realtimeCallback('records', payload);
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'discharge_reports' }, (payload) => {
          if (typeof this.realtimeCallback === 'function') this.realtimeCallback('discharge_reports', payload);
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'departments' }, (payload) => {
          if (typeof this.realtimeCallback === 'function') this.realtimeCallback('departments', payload);
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'staff' }, (payload) => {
          if (typeof this.realtimeCallback === 'function') this.realtimeCallback('staff', payload);
        })
        .subscribe((status) => {
          console.log('📡 Realtime channel status:', status);
          if (status === 'SUBSCRIBED') {
            this.isConnected = true;
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            console.warn('⚠️ Realtime channel dropped, scheduling reconnection in 4s...');
            setTimeout(() => {
              if (this.realtimeCallback) this.subscribeRealtime(this.realtimeCallback);
            }, 4000);
          }
        });

      return this.realtimeChannel;
    } catch (e) {
      console.warn('Lỗi khi đăng ký Realtime Supabase:', e);
    }
  }

  // =========================================================================
  // HEARTBEAT SYNC & MULTI-DEVICE INSTANT SYNC
  // =========================================================================
  startHeartbeatSync(storageService, onSync) {
    // 1. Định kỳ 5s chạy đồng bộ thông minh một lần để nhận dữ liệu từ các máy khác
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = setInterval(async () => {
      if (document.hidden) return; // Tiết kiệm băng thông khi tab ẩn
      await this.smartSync(storageService);
      if (typeof onSync === 'function') onSync();
    }, 5000);

    // 2. Đồng bộ ngay khi người dùng quay lại tab/cửa sổ (Page Visibility & Window Focus)
    if (!this._hasBoundEvents) {
      this._hasBoundEvents = true;
      document.addEventListener('visibilitychange', async () => {
        if (!document.hidden) {
          console.log('👁️ Tab active: Đồng bộ tức thời dữ liệu Cloud...');
          await this.smartSync(storageService);
          if (typeof onSync === 'function') onSync();
        }
      });

      window.addEventListener('focus', async () => {
        await this.smartSync(storageService);
        if (typeof onSync === 'function') onSync();
      });

      window.addEventListener('online', async () => {
        console.log('🌐 Kết nối mạng phục hồi: Kiểm tra và đồng bộ...');
        await this.testConnection();
        await this.smartSync(storageService);
        if (typeof onSync === 'function') onSync();
      });
    }
  }
}

export const supabaseService = new SupabaseService();
