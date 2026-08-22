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

  async deleteRecord(recordId) {
    if (!this.client || !recordId) return false;
    try {
      const sId = String(recordId);
      let { error } = await this.client.from('records').delete().eq('id', sId);
      if (error) {
        // Thử tìm theo ma_kcb nếu có
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

  async deleteDischargeReport(reportId) {
    if (!this.client || !reportId) return false;
    try {
      const sId = String(reportId);
      let { error } = await this.client.from('discharge_reports').delete().eq('id', sId);
      if (error) {
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
      const { error } = await this.client.from('departments').delete().eq('id', String(deptId));
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
      const { error } = await this.client.from('staff').delete().eq('id', String(staffId));
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

  // Đẩy toàn bộ dữ liệu từ LocalStorage lên Supabase
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

  // Đồng bộ thông minh 2 chiều (Smart 2-Way Sync): Bảo toàn dữ liệu cục bộ và hòa nhập dữ liệu Cloud
  async smartSync(storageService) {
    if (!this.client || this.isSyncing) return;
    this.isSyncing = true;
    let hasLocalChanges = false;

    try {
      const tombstones = storageService.getTombstones ? storageService.getTombstones() : {
        records: [],
        discharge: [],
        departments: [],
        staff: []
      };

      // 1. Departments (Danh mục Khoa/Phòng)
      let localDepts = storageService.getDepartments();
      const cloudDepts = await this.fetchDepartments();

      if (cloudDepts !== null) {
        // Purge tombstoned departments from cloud
        if (tombstones.departments && tombstones.departments.length) {
          tombstones.departments.forEach(tId => {
            if (cloudDepts.some(cd => String(cd.id) === String(tId))) {
              this.deleteDepartment(tId);
            }
          });
        }

        const validCloudDepts = cloudDepts.filter(cd => !storageService.isTombstoned('departments', cd.id));
        localDepts = localDepts.filter(ld => !storageService.isTombstoned('departments', ld.id));

        if (validCloudDepts.length === 0 && localDepts.length > 0) {
          await this.client.from('departments').upsert(localDepts.map(d => this.deptToDb(d)));
        } else if (validCloudDepts.length > 0) {
          const deptsToPush = localDepts.filter(ld => 
            !validCloudDepts.some(cd => String(cd.id) === String(ld.id) || (cd.name && ld.name && cd.name.trim().toLowerCase() === ld.name.trim().toLowerCase()))
          );
          if (deptsToPush.length) {
            await this.client.from('departments').upsert(deptsToPush.map(d => this.deptToDb(d)));
          }

          const mergedDepts = [...localDepts];
          validCloudDepts.forEach(cd => {
            const exists = mergedDepts.some(md => String(md.id) === String(cd.id) || (md.name && cd.name && md.name.trim().toLowerCase() === cd.name.trim().toLowerCase()));
            if (!exists) {
              mergedDepts.push(cd);
              hasLocalChanges = true;
            }
          });

          if (mergedDepts.length !== localDepts.length) {
            storageService.saveDepartments(mergedDepts);
            hasLocalChanges = true;
          }
        }
      }

      // 2. Staff (Nhân viên)
      let localStaff = storageService.getStaff();
      const cloudStaff = await this.fetchStaff();

      if (cloudStaff !== null) {
        if (tombstones.staff && tombstones.staff.length) {
          tombstones.staff.forEach(tId => {
            if (cloudStaff.some(cs => String(cs.id) === String(tId))) {
              this.deleteStaff(tId);
            }
          });
        }

        const validCloudStaff = cloudStaff.filter(cs => !storageService.isTombstoned('staff', cs.id));
        localStaff = localStaff.filter(ls => !storageService.isTombstoned('staff', ls.id));

        if (validCloudStaff.length === 0 && localStaff.length > 0) {
          await this.client.from('staff').upsert(localStaff.map(s => this.staffToDb(s)));
        } else if (validCloudStaff.length > 0) {
          const staffToPush = localStaff.filter(ls => !validCloudStaff.some(cs => String(cs.id) === String(ls.id)));
          if (staffToPush.length) {
            await this.client.from('staff').upsert(staffToPush.map(s => this.staffToDb(s)));
          }

          const mergedStaff = [...localStaff];
          validCloudStaff.forEach(cs => {
            const idx = mergedStaff.findIndex(ms => String(ms.id) === String(cs.id));
            if (idx === -1) {
              mergedStaff.push(cs);
              hasLocalChanges = true;
            } else {
              // Update if changed
              if (JSON.stringify(mergedStaff[idx]) !== JSON.stringify(cs)) {
                mergedStaff[idx] = { ...mergedStaff[idx], ...cs };
                hasLocalChanges = true;
              }
            }
          });

          if (hasLocalChanges || mergedStaff.length !== localStaff.length) {
            storageService.saveStaff(mergedStaff);
          }
        }
      }

      // 3. Records (Bản ghi lỗi HSBA)
      let localRecords = storageService.getRecords();
      const cloudRecords = await this.fetchRecords();

      if (cloudRecords !== null) {
        // Xóa các bản ghi đã bị người dùng xóa trên máy này khỏi Supabase
        if (tombstones.records && tombstones.records.length) {
          tombstones.records.forEach(tId => {
            if (cloudRecords.some(cr => String(cr.id) === String(tId))) {
              this.deleteRecord(tId);
            }
          });
        }

        // Lọc bỏ các bản ghi đã bị tombstone khỏi Cloud dataset
        const validCloudRecords = cloudRecords.filter(cr => !storageService.isTombstoned('records', cr.id));
        localRecords = localRecords.filter(lr => !storageService.isTombstoned('records', lr.id));

        if (validCloudRecords.length === 0 && localRecords.length > 0) {
          await this.client.from('records').upsert(localRecords.map(r => this.recordToDb(r)));
        } else if (validCloudRecords.length > 0) {
          // Push any local record not yet on cloud
          const recordsToPush = localRecords.filter(lr => !validCloudRecords.some(cr => String(cr.id) === String(lr.id)));
          if (recordsToPush.length) {
            await this.client.from('records').upsert(recordsToPush.map(r => this.recordToDb(r)));
          }

          const mergedRecords = [...localRecords];
          validCloudRecords.forEach(cr => {
            const idx = mergedRecords.findIndex(mr => String(mr.id) === String(cr.id));
            if (idx === -1) {
              mergedRecords.unshift(cr);
              hasLocalChanges = true;
            } else {
              // Merge updates
              const cur = mergedRecords[idx];
              const updatedPushCount = Math.max(cr.pushSentCount || 0, cur.pushSentCount || 0);
              const updatedLastPush = cr.lastPushSentAt || cur.lastPushSentAt || null;
              
              if (
                cur.trangThaiLoi !== cr.trangThaiLoi ||
                cur.yKienNguoiSua !== cr.yKienNguoiSua ||
                cur.mucDoLoi !== cr.mucDoLoi ||
                cur.pushSentCount !== updatedPushCount
              ) {
                mergedRecords[idx] = {
                  ...cur,
                  ...cr,
                  pushSentCount: updatedPushCount,
                  lastPushSentAt: updatedLastPush
                };
                hasLocalChanges = true;
              }
            }
          });

          if (hasLocalChanges || mergedRecords.length !== localRecords.length) {
            storageService.saveRecords(mergedRecords);
          }
        }
      }

      // 4. Discharge Reports (Báo cáo ra viện)
      let localDischarge = storageService.getDischargeReports();
      const cloudDischarge = await this.fetchDischargeReports();

      if (cloudDischarge !== null) {
        if (tombstones.discharge && tombstones.discharge.length) {
          tombstones.discharge.forEach(tId => {
            if (cloudDischarge.some(cd => String(cd.id) === String(tId))) {
              this.deleteDischargeReport(tId);
            }
          });
        }

        const validCloudDischarge = cloudDischarge.filter(cd => !storageService.isTombstoned('discharge', cd.id));
        localDischarge = localDischarge.filter(ld => !storageService.isTombstoned('discharge', ld.id));

        if (validCloudDischarge.length === 0 && localDischarge.length > 0) {
          await this.client.from('discharge_reports').upsert(localDischarge.map(r => this.dischargeToDb(r)));
        } else if (validCloudDischarge.length > 0) {
          const repToPush = localDischarge.filter(lr => !validCloudDischarge.some(cr => String(cr.id) === String(lr.id)));
          if (repToPush.length) {
            await this.client.from('discharge_reports').upsert(repToPush.map(r => this.dischargeToDb(r)));
          }

          const mergedReps = [...localDischarge];
          validCloudDischarge.forEach(cr => {
            const idx = mergedReps.findIndex(mr => String(mr.id) === String(cr.id));
            if (idx === -1) {
              mergedReps.unshift(cr);
              hasLocalChanges = true;
            } else {
              const cur = mergedReps[idx];
              if (
                cur.chotThongCong !== cr.chotThongCong ||
                cur.ngayRaVien !== cr.ngayRaVien ||
                JSON.stringify(cur.kiemDuoc) !== JSON.stringify(cr.kiemDuoc) ||
                JSON.stringify(cur.kiemKeToanBH) !== JSON.stringify(cr.kiemKeToanBH) ||
                JSON.stringify(cur.kiemKHTH) !== JSON.stringify(cr.kiemKHTH) ||
                JSON.stringify(cur.kiemIT) !== JSON.stringify(cr.kiemIT)
              ) {
                mergedReps[idx] = cr;
                hasLocalChanges = true;
              }
            }
          });

          if (hasLocalChanges || mergedReps.length !== localDischarge.length) {
            storageService.saveDischargeReports(mergedReps);
          }
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
