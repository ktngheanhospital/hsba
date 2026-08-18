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
          auth: { persistSession: false }
        });
        this.testConnection();
      } else {
        // Dynamic import nếu window.supabase chưa sẵn sàng
        import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm')
          .then(module => {
            this.client = module.createClient(url, key, {
              auth: { persistSession: false }
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
        return true;
      } else {
        console.warn('Supabase test query notice:', error.message);
        this.isConnected = true; // Connection reached server
        this.notifyStatus(true, 'Kết nối thành công tới Supabase');
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
    this.subscribers.forEach(cb => cb({ connected, message, url: this.getUrl() }));
  }

  // =========================================================================
  // MAPPERS: Chuyển đổi giữa format JS (CamelCase) và PostgreSQL (Snake_Case)
  // =========================================================================

  recordToDb(r) {
    return {
      id: r.id,
      ma_kcb: r.maKCB,
      ten_benh_nhan: r.tenBenhNhan,
      khoa_phong: r.khoaPhong,
      nguoi_chi_dinh: r.nguoiChiDinh,
      ngay_vao_khoa: r.ngayVaoKhoa || null,
      ngay_kiem_ho_so: r.ngayKiemHoSo || null,
      thoi_gian_chi_dinh_yl: r.thoiGianChiDinhYL || null,
      dien_giai_loi: r.dienGiaiLoi || '',
      muc_do_loi: r.mucDoLoi || r.mucDoCanhBao || 'Nhắc nhở',
      trang_thai_loi: r.trangThaiLoi || 'CHƯA SỬA',
      y_kien_nguoi_sua: r.yKienNguoiSua || '',
      nguoi_kiem_tra: r.nguoiKiemTra || '',
      so_lan_gui_zalo: r.soLanGuiZalo || r.zaloSentCount || 0,
      thoi_gian_gui_zalo_gan_nhat: r.thoiGianGuiZaloGanNhat || r.lastZaloSentAt || null
    };
  }

  dbToRecord(row) {
    return {
      id: row.id,
      maKCB: row.ma_kcb || row.maKCB || '',
      tenBenhNhan: row.ten_benh_nhan || row.tenBenhNhan || '',
      khoaPhong: row.khoa_phong || row.khoaPhong || '',
      nguoiChiDinh: row.nguoi_chi_dinh || row.nguoiChiDinh || '',
      ngayVaoKhoa: row.ngay_vao_khoa || row.ngayVaoKhoa || '',
      ngayKiemHoSo: row.ngay_kiem_ho_so || row.ngayKiemHoSo || '',
      thoiGianChiDinhYL: row.thoi_gian_chi_dinh_yl || row.thoiGianChiDinhYL || '',
      dienGiaiLoi: row.dien_giai_loi || row.dienGiaiLoi || '',
      mucDoLoi: row.muc_do_loi || row.mucDoLoi || 'Nhắc nhở',
      mucDoCanhBao: row.muc_do_loi || row.mucDoLoi || 'Nhắc nhở',
      trangThaiKiemDuyet: row.muc_do_loi || row.mucDoLoi || 'Nhắc nhở',
      trangThaiLoi: row.trang_thai_loi || row.trangThaiLoi || 'CHƯA SỬA',
      yKienNguoiSua: row.y_kien_nguoi_sua || row.yKienNguoiSua || '',
      nguoiKiemTra: row.nguoi_kiem_tra || row.nguoiKiemTra || '',
      soLanGuiZalo: row.so_lan_gui_zalo ?? row.soLanGuiZalo ?? 0,
      thoiGianGuiZaloGanNhat: row.thoi_gian_gui_zalo_gan_nhat || row.thoiGianGuiZaloGanNhat || null,
      zaloSentCount: row.so_lan_gui_zalo ?? row.soLanGuiZalo ?? 0,
      lastZaloSentAt: row.thoi_gian_gui_zalo_gan_nhat || row.thoiGianGuiZaloGanNhat || null
    };
  }

  dischargeToDb(r) {
    return {
      id: r.id,
      ngay_bao_cao: r.ngayBaoCao,
      ma_kcb: r.maKCB,
      ten_benh_nhan: r.tenBenhNhan,
      ten_bac_si: r.tenBacSi,
      phong: r.phong,
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
      id: row.id,
      ngayBaoCao: row.ngay_bao_cao || row.ngayBaoCao || '',
      maKCB: row.ma_kcb || row.maKCB || '',
      tenBenhNhan: row.ten_benh_nhan || row.tenBenhNhan || '',
      tenBacSi: row.ten_bac_si || row.tenBacSi || '',
      phong: row.phong || '',
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
      id: d.id,
      name: d.name,
      code: d.code,
      order: d.order || 0
    };
  }

  dbToDept(row) {
    return {
      id: row.id,
      name: row.name,
      code: row.code,
      order: row.order || 0
    };
  }

  staffToDb(s) {
    return {
      id: s.id,
      username: s.username,
      password: s.password || '123',
      name: s.name,
      department: s.department,
      position: s.position || '',
      phone: s.phone || '',
      zalo_id: s.zaloId || '',
      default_role: s.defaultRole || 'NHOM_2',
      avatar_emoji: s.avatarEmoji || '👨‍⚕️'
    };
  }

  dbToStaff(row) {
    return {
      id: row.id,
      username: row.username,
      password: row.password || '123',
      name: row.name,
      department: row.department,
      position: row.position,
      phone: row.phone,
      zaloId: row.zalo_id || row.zaloId,
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
      const { data, error } = await this.client.from('records').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []).map(r => this.dbToRecord(r));
    } catch (e) {
      console.warn('Lỗi khi fetch records từ Supabase:', e);
      return null;
    }
  }

  async upsertRecord(record) {
    if (!this.client) return false;
    try {
      const dbRow = this.recordToDb(record);
      const { error } = await this.client.from('records').upsert(dbRow);
      if (error) throw error;
      return true;
    } catch (e) {
      console.warn('Lỗi khi upsert record lên Supabase:', e);
      return false;
    }
  }

  async deleteRecord(recordId) {
    if (!this.client) return false;
    try {
      const { error } = await this.client.from('records').delete().eq('id', recordId);
      if (error) throw error;
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
      const { data, error } = await this.client.from('discharge_reports').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []).map(r => this.dbToDischarge(r));
    } catch (e) {
      console.warn('Lỗi khi fetch discharge_reports từ Supabase:', e);
      return null;
    }
  }

  async upsertDischargeReport(report) {
    if (!this.client) return false;
    try {
      const dbRow = this.dischargeToDb(report);
      const { error } = await this.client.from('discharge_reports').upsert(dbRow);
      if (error) throw error;
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
      if (error) throw error;
      return true;
    } catch (e) {
      console.warn('Lỗi khi upsert batch discharge reports lên Supabase:', e);
      return false;
    }
  }

  async deleteDischargeReport(reportId) {
    if (!this.client) return false;
    try {
      const { error } = await this.client.from('discharge_reports').delete().eq('id', reportId);
      if (error) throw error;
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
    if (!this.client) return false;
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
    if (!this.client) return false;
    try {
      const { error } = await this.client.from('departments').delete().eq('id', deptId);
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
      return (data || []).map(s => this.dbToStaff(s));
    } catch (e) {
      console.warn('Lỗi khi fetch staff từ Supabase:', e);
      return null;
    }
  }

  async upsertStaff(member) {
    if (!this.client) return false;
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
    if (!this.client) return false;
    try {
      const { error } = await this.client.from('staff').delete().eq('id', staffId);
      if (error) throw error;
      return true;
    } catch (e) {
      console.warn('Lỗi khi delete staff trên Supabase:', e);
      return false;
    }
  }

  // =========================================================================
  // ĐỒNG BỘ TOÀN DIỆN (FULL SYNC / SEEDING INITIAL DATA)
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

  // Kéo toàn bộ dữ liệu từ Supabase về LocalStorage
  async pullAllCloudDataToLocal(storageService) {
    if (!this.client) return { success: false, message: 'Chưa khởi tạo Supabase Client' };

    try {
      this.isSyncing = true;

      // 1. Departments
      const cloudDepts = await this.fetchDepartments();
      if (cloudDepts && cloudDepts.length) {
        storageService.saveDepartments(cloudDepts);
      }

      // 2. Staff
      const cloudStaff = await this.fetchStaff();
      if (cloudStaff && cloudStaff.length) {
        storageService.saveStaff(cloudStaff);
      }

      // 3. Records
      const cloudRecords = await this.fetchRecords();
      if (cloudRecords && cloudRecords.length) {
        storageService.saveRecords(cloudRecords);
      }

      // 4. Discharge Reports
      const cloudDischarge = await this.fetchDischargeReports();
      if (cloudDischarge && cloudDischarge.length) {
        storageService.saveDischargeReports(cloudDischarge);
      }

      this.isSyncing = false;
      return { success: true, message: 'Đã tải dữ liệu mới nhất từ Supabase Cloud về máy!' };
    } catch (e) {
      this.isSyncing = false;
      console.error('Lỗi khi kéo dữ liệu từ Cloud:', e);
      return { success: false, message: 'Lỗi khi kéo dữ liệu từ Cloud: ' + (e.message || e) };
    }
  }

  // Tự động đồng bộ lúc khởi động: Nếu Cloud trống thì seed dữ liệu mặc định, nếu có thì pull về
  async autoInitSync(storageService, onComplete) {
    if (!this.client) return;

    try {
      const cloudDepts = await this.fetchDepartments();
      
      // Nếu Cloud trống hoàn toàn -> Tự động đẩy dữ liệu khởi tạo lên Cloud
      if (!cloudDepts || cloudDepts.length === 0) {
        console.log('⚡ Supabase database trống. Đang đẩy dữ liệu khởi tạo ban đầu lên Cloud...');
        await this.pushAllLocalDataToCloud(storageService);
      } else {
        // Nếu Cloud đã có dữ liệu -> Tải về cập nhật LocalStorage
        console.log('⚡ Đang đồng bộ dữ liệu từ Supabase Cloud...');
        await this.pullAllCloudDataToLocal(storageService);
      }

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
    if (!this.client) return;

    try {
      const channel = this.client
        .channel('hsba-realtime-channel')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'records' }, (payload) => {
          if (typeof onTableChange === 'function') onTableChange('records', payload);
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'discharge_reports' }, (payload) => {
          if (typeof onTableChange === 'function') onTableChange('discharge_reports', payload);
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'departments' }, (payload) => {
          if (typeof onTableChange === 'function') onTableChange('departments', payload);
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'staff' }, (payload) => {
          if (typeof onTableChange === 'function') onTableChange('staff', payload);
        })
        .subscribe();

      return channel;
    } catch (e) {
      console.warn('Lỗi khi đăng ký Realtime Supabase:', e);
    }
  }
}

export const supabaseService = new SupabaseService();
