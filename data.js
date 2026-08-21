/**
 * Dữ liệu mặc định và Phân quyền cho ứng dụng THEO DÕI HSBA
 * Phân quyền chuyên biệt cho cả 4 khâu kiểm lỗi: Dược, Kế toán BH, KHTH, IT, Khoa phòng, Tổ rà soát, Admin
 */

export const ROLES = {
  DUOC: {
    id: 'DUOC',
    name: 'Khoa Dược (Dược sĩ lâm sàng)',
    shortName: 'Dược',
    description: 'ĐỘC QUYỀN kiểm duyệt khâu Dược (Thuốc, VTYT, Kháng sinh, Tương tác thuốc)',
    badgeClass: 'role-badge-duoc',
    icon: '💊',
    canAddError: true,
    canDeleteError: false,
    canChotThongCong: false,
    canAccessSettings: false, // Không có quyền truy cập Cài đặt
    allowedCheckSteps: ['duoc']
  },
  KETOAN_BH: {
    id: 'KETOAN_BH',
    name: 'Nhóm KTBH (Tổ Rà Soát & Kế Toán BHYT)',
    shortName: 'Nhóm KTBH',
    description: 'Tổ Rà Soát HSBA & Kế toán BHYT: Phụ trách rà soát phát hiện lỗi, ấn định Mức độ lỗi & duyệt khâu KTBH',
    badgeClass: 'role-badge-ketoan',
    icon: '💵',
    canAddError: true,
    canDeleteError: true,
    canChotThongCong: false,
    canAccessSettings: false, // Không có quyền truy cập Cài đặt
    allowedCheckSteps: ['ketoan']
  },
  KHTH: {
    id: 'KHTH',
    name: 'Kế hoạch Tổng hợp (KHTH)',
    shortName: 'KHTH',
    description: 'ĐỘC QUYỀN duyệt khâu KHTH (Hồ sơ, Chữ ký, Biên bản) & ĐỘC QUYỀN Chốt thông cổng ra viện',
    badgeClass: 'role-badge-khth',
    icon: '📋',
    canAddError: true,
    canDeleteError: true,
    canChotThongCong: true, // QUYỀN ĐỘC QUYỀN CHỐT THÔNG CỔNG
    canAccessSettings: false, // Không có quyền truy cập Cài đặt
    allowedCheckSteps: ['khth']
  },
  IT: {
    id: 'IT',
    name: 'Phòng Công nghệ Thông tin (IT)',
    shortName: 'IT',
    description: 'Quản trị Cài đặt kỹ thuật & Đồng bộ dữ liệu hệ thống',
    badgeClass: 'role-badge-it',
    icon: '💻',
    canAddError: true,
    canDeleteError: false,
    canChotThongCong: false,
    canAccessSettings: true, // Có quyền truy cập Cài đặt kỹ thuật
    allowedCheckSteps: []
  },
  NHOM_2: {
    id: 'NHOM_2',
    name: 'Khoa / Bác sĩ Điều Trị',
    shortName: 'Khoa/BS',
    description: 'Báo cáo danh sách ra viện hàng ngày, giải trình và cập nhật tình trạng khắc phục lỗi',
    badgeClass: 'role-badge-nhom2',
    icon: '👨‍⚕️',
    canAddError: false,
    canDeleteError: false,
    canChotThongCong: false,
    canAccessSettings: false, // Không có quyền truy cập Cài đặt
    allowedCheckSteps: []
  },
  ADMIN: {
    id: 'ADMIN',
    name: 'Quản trị viên (Toàn quyền)',
    shortName: 'Admin',
    description: 'Toàn quyền kiểm soát, duyệt tất cả các khâu kiểm lỗi, chốt thông cổng và Cài đặt hệ thống',
    badgeClass: 'role-badge-admin',
    icon: '👑',
    canAddError: true,
    canDeleteError: true,
    canChotThongCong: true,
    canAccessSettings: true, // Toàn quyền truy cập Cài đặt
    allowedCheckSteps: ['duoc', 'ketoan', 'khth']
  }
};

export const PERMISSION_COLUMNS = [
  { key: 'truyCapCaiDat', label: '1. Truy cập Phân hệ Cài đặt hệ thống', duoc: false, ketoan: false, khth: false, it: true, nhom2: false, desc: 'ĐỘC QUYỀN: Quản trị viên & IT' },
  { key: 'kiemDuoc', label: '2. Khâu Dược (Thuốc, VTYT, Kháng sinh)', duoc: true, ketoan: false, khth: false, it: false, nhom2: false, desc: 'Chỉ Khoa Dược & Admin duyệt' },
  { key: 'kiemKeToanBH', label: '3. Khâu KTBH (Viện phí, BHYT)', duoc: false, ketoan: true, khth: false, it: false, nhom2: false, desc: 'Nhóm KTBH & Admin duyệt (Tự động theo Rà soát lỗi)' },
  { key: 'kiemKHTH', label: '4. Khâu Kế hoạch Tổng hợp (Hồ sơ, Chữ ký)', duoc: false, ketoan: false, khth: true, it: false, nhom2: false, desc: 'Chỉ KHTH & Admin duyệt' },
  { key: 'chotThongCong', label: '5. Chốt Thông Cổng BHYT / Ra Viện', duoc: false, ketoan: false, khth: true, it: false, nhom2: false, desc: 'ĐỘC QUYỀN: KHTH & Admin' },
  { key: 'maKCB', label: '6. Thông tin Rà soát lỗi (Mã KCB, Mức độ lỗi, Diễn giải...)', duoc: true, ketoan: true, khth: true, it: true, nhom2: false, desc: 'Nhóm KTBH / Bộ phận chuyên môn / KHTH nhập' },
  { key: 'trangThaiLoi', label: '7. Tiến độ khắc phục & Ý kiến Khoa phòng', duoc: false, ketoan: false, khth: false, it: false, nhom2: true, desc: 'Khoa phòng / Bác sĩ / Người sửa hồ sơ cập nhật' },
  { key: 'baoCaoDanhSachRaVien', label: '8. Báo cáo danh sách ra viện hàng ngày', duoc: true, ketoan: true, khth: true, it: true, nhom2: true, desc: 'Các Khoa/Phòng nhập ca ra viện' },
  { key: 'baoCaoTinhTrangSuaLoi', label: '9. Báo cáo tình trạng sửa lỗi (Text)', duoc: true, ketoan: true, khth: true, it: true, nhom2: true, desc: 'Khoa phòng cập nhật tiến độ' },
  { key: 'xoaBaoCaoRaVien', label: '10. Xóa báo cáo ra viện / duyệt thông cổng', duoc: false, ketoan: false, khth: false, it: false, nhom2: true, desc: 'ĐỘC QUYỀN: Khoa / Bác sĩ Điều Trị (NHOM_2) & Admin' }
];

export const MUC_DO_LOI = [
  { id: 'KHONG_CO_LOI', label: 'Không có lỗi', color: 'success', bg: '#dcfce7', text: '#15803d', border: '#bbf7d0', icon: '🟢' },
  { id: 'NHAC_NHO', label: 'Nhắc nhở', color: 'warning', bg: '#fef3c7', text: '#b45309', border: '#fde68a', icon: '🟡' },
  { id: 'YEU_CAU_KIEM_TRA', label: 'Yêu cầu kiểm tra', color: 'purple', bg: '#f3e8ff', text: '#7e22ce', border: '#ddd6fe', icon: '🟣' },
  { id: 'BAO_DONG', label: 'Báo động', color: 'danger', bg: '#fee2e2', text: '#b91c1c', border: '#fecaca', icon: '🚨' }
];

export const MUC_DO_CANH_BAO = [
  { id: 'KHONG_CO_LOI', label: 'Không có lỗi', color: 'success', bg: '#dcfce7', text: '#15803d', border: '#bbf7d0' },
  { id: 'BAO_DONG', label: 'Báo động', color: 'danger', bg: '#fee2e2', text: '#b91c1c', border: '#fca5a5' },
  { id: 'YEU_CAU_KIEM_TRA', label: 'Yêu cầu kiểm tra', color: 'purple', bg: '#f3e8ff', text: '#7e22ce', border: '#ddd6fe' },
  { id: 'NHAC_NHO', label: 'Nhắc nhở', color: 'warning', bg: '#fef3c7', text: '#b45309', border: '#fde68a' }
];

export const TRANG_THAI_KIEM_DUYET = [
  { id: 'KHONG_CO_LOI', label: 'Không có lỗi', color: 'success', bg: '#dcfce7', text: '#15803d' },
  { id: 'NHAC_NHO', label: 'Nhắc nhở', color: 'warning', bg: '#fef3c7', text: '#b45309' },
  { id: 'YEU_CAU_KIEM_TRA', label: 'Yêu cầu kiểm tra', color: 'purple', bg: '#f3e8ff', text: '#7e22ce' },
  { id: 'BAO_DONG', label: 'Báo động', color: 'danger', bg: '#fee2e2', text: '#b91c1c' }
];

export const TRANG_THAI_LOI = [
  { id: 'CHUA_SUA', label: 'CHƯA SỬA', color: 'danger', bg: '#fee2e2', text: '#b91c1c' },
  { id: 'DA_XEM_DANG_SUA', label: 'ĐÃ XEM - ĐANG SỬA', color: 'warning', bg: '#ffedd5', text: '#c2410c' },
  { id: 'DA_XONG', label: 'ĐÃ XONG', color: 'success', bg: '#dcfce7', text: '#15803d' },
  { id: 'HUY_CHUYEN_VIEN', label: 'HỦY CHUYỂN VIỆN', color: 'neutral', bg: '#f1f5f9', text: '#475569' },
  { id: 'KHAC', label: 'KHÁC', color: 'secondary', bg: '#e2e8f0', text: '#334155' }
];

export const DEFAULT_DEPARTMENTS = [
  { id: 'KP01', name: 'Khoa Cấp cứu & Hồi sức tích cực', code: 'CC-HSTC', order: 1 },
  { id: 'KP02', name: 'Khoa Nội Tổng hợp', code: 'NTH', order: 2 },
  { id: 'KP03', name: 'Khoa Nội Tim mạch', code: 'NTM', order: 3 },
  { id: 'KP04', name: 'Khoa Ngoại Tổng hợp', code: 'NGOAI-TH', order: 4 },
  { id: 'KP05', name: 'Khoa Ngoại Chấn thương Chỉnh hình', code: 'CTCH', order: 5 },
  { id: 'KP06', name: 'Khoa Phụ Sản', code: 'SAN', order: 6 },
  { id: 'KP07', name: 'Khoa Nhi', code: 'NHI', order: 7 },
  { id: 'KP08', name: 'Khoa Gây mê Hồi sức', code: 'GMHS', order: 8 },
  { id: 'KP09', name: 'Khoa Truyền nhiễm', code: 'TN', order: 9 },
  { id: 'KP10', name: 'Khoa Khám bệnh', code: 'KKB', order: 10 },
  { id: 'KP11', name: 'Phòng Kế hoạch Tổng hợp', code: 'KHTH', order: 11 },
  { id: 'KP12', name: 'Phòng Công nghệ Thông tin', code: 'CNTT', order: 12 },
  { id: 'KP13', name: 'Khoa Dược', code: 'DUOC', order: 13 },
  { id: 'KP14', name: 'Phòng Tài chính Kế toán (BHYT)', code: 'TCKT-BH', order: 14 }
];

export const DEFAULT_STAFF = [
  // Quản trị viên hệ thống (Admin)
  { 
    id: 'NV_ADMIN', 
    username: 'admin', 
    password: '123', 
    name: 'Quản Trị Viên Hệ Thống', 
    department: 'Phòng Công nghệ Thông tin', 
    position: 'Quản trị viên (Admin)', 
    phone: '', 
    zaloId: '', 
    defaultRole: 'ADMIN', 
    avatarEmoji: '👑' 
  },

  // Phòng Kế hoạch Tổng hợp (Duyệt KHTH & Chốt cổng)
  { 
    id: 'NV_KHTH', 
    username: 'khth', 
    password: '123', 
    name: 'Phòng Kế hoạch Tổng hợp', 
    department: 'Phòng Kế hoạch Tổng hợp', 
    position: 'Chuyên viên KHTH / Chốt cổng', 
    phone: '', 
    zaloId: '', 
    defaultRole: 'KHTH', 
    avatarEmoji: '📋' 
  },

  // Nhóm KTBH (Tổ Rà Soát & Kế toán BHYT)
  { 
    id: 'NV_RASOAT', 
    username: 'rasoat', 
    password: '123', 
    name: 'Tổ Rà Soát HSBA', 
    department: 'Phòng Kế hoạch Tổng hợp', 
    position: 'Cán bộ Rà Soát HSBA', 
    phone: '', 
    zaloId: '', 
    defaultRole: 'KETOAN_BH', 
    avatarEmoji: '🔍' 
  },

  // Khoa Dược (Duyệt khâu Dược)
  { 
    id: 'NV_DUOC', 
    username: 'duoc', 
    password: '123', 
    name: 'Khoa Dược', 
    department: 'Khoa Dược', 
    position: 'Dược sĩ / Duyệt Dược', 
    phone: '', 
    zaloId: '', 
    defaultRole: 'DUOC', 
    avatarEmoji: '💊' 
  },
  
  // Kế toán Bảo hiểm (Nhóm KTBH)
  { 
    id: 'NV_KETOAN', 
    username: 'ketoan', 
    password: '123', 
    name: 'Phòng Tài chính Kế toán (BHYT)', 
    department: 'Phòng Tài chính Kế toán (BHYT)', 
    position: 'Kế toán Giám định BHYT', 
    phone: '', 
    zaloId: '', 
    defaultRole: 'KETOAN_BH', 
    avatarEmoji: '💵' 
  },

  // Công nghệ Thông tin (Duyệt khâu IT & HIS)
  { 
    id: 'NV_IT', 
    username: 'it', 
    password: '123', 
    name: 'Phòng Công nghệ Thông tin', 
    department: 'Phòng Công nghệ Thông tin', 
    position: 'Kỹ sư Quản trị HIS & Cổng BHXH', 
    phone: '', 
    zaloId: '', 
    defaultRole: 'IT', 
    avatarEmoji: '💻' 
  },

  // Bác sĩ điều trị / Khoa phòng lâm sàng (Nhóm 2)
  { 
    id: 'NV_KHOA', 
    username: 'khoa', 
    password: '123', 
    name: 'Khoa Lâm sàng / Bác sĩ', 
    department: 'Khoa Nội Tổng hợp', 
    position: 'Bác sĩ Điều trị', 
    phone: '', 
    zaloId: '', 
    defaultRole: 'NHOM_2', 
    avatarEmoji: '👨‍⚕️' 
  }
];

export const DEFAULT_RECORDS = [];

export const DEFAULT_DISCHARGE_REPORTS = [];

