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
    name: 'Kế toán Bảo hiểm (Viện phí & BHYT)',
    shortName: 'KT-BH',
    description: 'ĐỘC QUYỀN kiểm duyệt khâu Kế toán Bảo hiểm (Mức hưởng BHYT, Viện phí, Bảng kê)',
    badgeClass: 'role-badge-ketoan',
    icon: '💵',
    canAddError: true,
    canDeleteError: false,
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
    description: 'ĐỘC QUYỀN kiểm duyệt khâu IT (Dữ liệu HIS, XML cổng) & Quản trị Cài đặt kỹ thuật',
    badgeClass: 'role-badge-it',
    icon: '💻',
    canAddError: true,
    canDeleteError: false,
    canChotThongCong: false,
    canAccessSettings: true, // Có quyền truy cập Cài đặt kỹ thuật
    allowedCheckSteps: ['it']
  },
  NHOM_2: {
    id: 'NHOM_2',
    name: 'Khoa / Bác sĩ Điều Trị',
    shortName: 'Khoa/Bác sĩ',
    description: 'Báo cáo danh sách ra viện hàng ngày, giải trình và cập nhật tình trạng khắc phục lỗi',
    badgeClass: 'role-badge-nhom2',
    icon: '👨‍⚕️',
    canAddError: false,
    canDeleteError: false,
    canChotThongCong: false,
    canAccessSettings: false, // Không có quyền truy cập Cài đặt
    allowedCheckSteps: []
  },
  NHOM_1: {
    id: 'NHOM_1',
    name: 'Nhóm 1: Tổ Rà Soát HSBA',
    shortName: 'Tổ Rà Soát',
    description: 'Chuyên viên kiểm tra, rà soát phát hiện sai sót bệnh án định kỳ & kích hoạt nhắc Zalo',
    badgeClass: 'role-badge-nhom1',
    icon: '🔍',
    canAddError: true,
    canDeleteError: true,
    canChotThongCong: false,
    canAccessSettings: false, // Không có quyền truy cập Cài đặt
    allowedCheckSteps: []
  },
  ADMIN: {
    id: 'ADMIN',
    name: 'Quản trị viên (Toàn quyền)',
    shortName: 'Admin',
    description: 'Toàn quyền kiểm soát, duyệt tất cả 4 khâu kiểm lỗi, chốt thông cổng và Cài đặt hệ thống',
    badgeClass: 'role-badge-admin',
    icon: '👑',
    canAddError: true,
    canDeleteError: true,
    canChotThongCong: true,
    canAccessSettings: true, // Toàn quyền truy cập Cài đặt
    allowedCheckSteps: ['duoc', 'ketoan', 'khth', 'it']
  }
};

export const PERMISSION_COLUMNS = [
  { key: 'truyCapCaiDat', label: '1. Truy cập Phân hệ Cài đặt hệ thống', duoc: false, ketoan: false, khth: false, it: true, nhom1: false, nhom2: false, desc: 'ĐỘC QUYỀN: Quản trị viên & IT' },
  { key: 'kiemDuoc', label: '2. Khâu Dược (Thuốc, VTYT, Kháng sinh)', duoc: true, ketoan: false, khth: false, it: false, nhom1: false, nhom2: false, desc: 'Chỉ Khoa Dược & Admin duyệt' },
  { key: 'kiemKeToanBH', label: '3. Khâu Kế toán BH (Viện phí, BHYT)', duoc: false, ketoan: true, khth: false, it: false, nhom1: false, nhom2: false, desc: 'Chỉ Kế toán BHYT & Admin duyệt' },
  { key: 'kiemKHTH', label: '4. Khâu Kế hoạch Tổng hợp (Hồ sơ, Chữ ký)', duoc: false, ketoan: false, khth: true, it: false, nhom1: false, nhom2: false, desc: 'Chỉ KHTH & Admin duyệt' },
  { key: 'kiemIT', label: '5. Khâu IT (Dữ liệu HIS, Chuẩn hóa XML)', duoc: false, ketoan: false, khth: false, it: true, nhom1: false, nhom2: false, desc: 'Chỉ IT & Admin duyệt' },
  { key: 'chotThongCong', label: '6. Chốt Thông Cổng BHYT / Ra Viện', duoc: false, ketoan: false, khth: true, it: false, nhom1: false, nhom2: false, desc: 'ĐỘC QUYỀN: KHTH & Admin' },
  { key: 'maKCB', label: '7. Thông tin Rà soát lỗi (Mã KCB, Mức độ lỗi, Diễn giải...)', duoc: true, ketoan: true, khth: true, it: true, nhom1: true, nhom2: false, desc: 'Kế toán BHYT / Tổ rà soát / Bộ phận chuyên môn nhập' },
  { key: 'trangThaiLoi', label: '8. Tiến độ khắc phục & Ý kiến Khoa phòng', duoc: false, ketoan: false, khth: false, it: false, nhom1: false, nhom2: true, desc: 'Khoa phòng / Bác sĩ / Người sửa hồ sơ cập nhật' },
  { key: 'baoCaoDanhSachRaVien', label: '9. Báo cáo danh sách ra viện hàng ngày', duoc: true, ketoan: true, khth: true, it: true, nhom1: true, nhom2: true, desc: 'Các Khoa/Phòng nhập ca ra viện' },
  { key: 'baoCaoTinhTrangSuaLoi', label: '10. Báo cáo tình trạng sửa lỗi (Text)', duoc: true, ketoan: true, khth: true, it: true, nhom1: true, nhom2: true, desc: 'Khoa phòng cập nhật tiến độ' }
];

export const MUC_DO_LOI = [
  { id: 'NHAC_NHO', label: 'Nhắc nhở', color: 'warning', bg: '#fef3c7', text: '#b45309', border: '#fde68a', icon: '🟡' },
  { id: 'YEU_CAU_KIEM_TRA', label: 'Yêu cầu kiểm tra', color: 'purple', bg: '#f3e8ff', text: '#7e22ce', border: '#ddd6fe', icon: '🟣' },
  { id: 'BAO_DONG', label: 'Báo động', color: 'danger', bg: '#fee2e2', text: '#b91c1c', border: '#fecaca', icon: '🚨' }
];

export const MUC_DO_CANH_BAO = [
  { id: 'BAO_DONG', label: 'Báo động', color: 'danger', bg: '#fee2e2', text: '#b91c1c', border: '#fca5a5' },
  { id: 'YEU_CAU_KIEM_TRA', label: 'Yêu cầu kiểm tra', color: 'purple', bg: '#f3e8ff', text: '#7e22ce', border: '#ddd6fe' },
  { id: 'NHAC_NHO', label: 'Nhắc nhở', color: 'warning', bg: '#fef3c7', text: '#b45309', border: '#fde68a' }
];

export const TRANG_THAI_KIEM_DUYET = [
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
    id: 'NV00', 
    username: 'admin', 
    password: '123', 
    name: 'Quản Trị Viên Hệ Thống', 
    department: 'Ban Giám Đốc / Phòng CNTT', 
    position: 'Quản trị viên Hệ thống (Admin)', 
    phone: '0900000000', 
    zaloId: 'admin_hsba', 
    defaultRole: 'ADMIN', 
    avatarEmoji: '👑' 
  },

  // Bác sĩ điều trị (Khoa phòng - Nhóm 2)
  { 
    id: 'NV02', 
    username: 'mai_noi', 
    password: '123', 
    name: 'BS. CKI. Trần Thị Mai', 
    department: 'Khoa Nội Tổng hợp', 
    position: 'Bác sĩ Điều trị', 
    phone: '0983112233', 
    zaloId: 'bs_mai_noi', 
    defaultRole: 'NHOM_2', 
    avatarEmoji: '👩‍⚕️' 
  },
  { 
    id: 'NV01', 
    username: 'hung_cc', 
    password: '123', 
    name: 'BS. CKII. Nguyễn Văn Hùng', 
    department: 'Khoa Cấp cứu & Hồi sức tích cực', 
    position: 'Bác sĩ Trưởng khoa', 
    phone: '0912345678', 
    zaloId: 'dr_hung_cc', 
    defaultRole: 'NHOM_2', 
    avatarEmoji: '👨‍⚕️' 
  },
  { 
    id: 'NV03', 
    username: 'long_tim', 
    password: '123', 
    name: 'ThS. BS. Lê Hoàng Long', 
    department: 'Khoa Nội Tim mạch', 
    position: 'Bác sĩ Điều trị', 
    phone: '0905667788', 
    zaloId: 'dr_long_timmach', 
    defaultRole: 'NHOM_2', 
    avatarEmoji: '👨‍⚕️' 
  },
  { 
    id: 'NV04', 
    username: 'tuan_ngoai', 
    password: '123', 
    name: 'BS. CKI. Phạm Minh Tuấn', 
    department: 'Khoa Ngoại Tổng hợp', 
    position: 'Bác sĩ Điều trị', 
    phone: '0974556677', 
    zaloId: 'bs_tuan_ngoai', 
    defaultRole: 'NHOM_2', 
    avatarEmoji: '👨‍⚕️' 
  },
  
  // Khoa Dược (Duyệt khâu Dược)
  { 
    id: 'NV10', 
    username: 'duoc', 
    password: '123', 
    name: 'ThS. DS. Đặng Thu Hà', 
    department: 'Khoa Dược', 
    position: 'Dược sĩ Lâm sàng & Duyệt Dược', 
    phone: '0978990011', 
    zaloId: 'ds_thuha_duoc', 
    defaultRole: 'DUOC', 
    avatarEmoji: '💊' 
  },
  
  // Kế toán Bảo hiểm (Duyệt khâu Kế toán BH)
  { 
    id: 'NV13', 
    username: 'ketoan', 
    password: '123', 
    name: 'CN. Nguyễn Thị Minh Trang', 
    department: 'Phòng Tài chính Kế toán (BHYT)', 
    position: 'Kế toán Trưởng giám định BHYT', 
    phone: '0988776655', 
    zaloId: 'trang_ktbh_bv', 
    defaultRole: 'KETOAN_BH', 
    avatarEmoji: '💵' 
  },

  // Kế hoạch Tổng hợp (Duyệt khâu KHTH & Chốt cổng)
  { 
    id: 'NV08', 
    username: 'khth', 
    password: '123', 
    name: 'ThS. BS. Phan Thanh Sơn', 
    department: 'Phòng Kế hoạch Tổng hợp', 
    position: 'Trưởng phòng KHTH & Chốt cổng', 
    phone: '0913998877', 
    zaloId: 'dr_son_khth', 
    defaultRole: 'KHTH', 
    avatarEmoji: '📋' 
  },
  { 
    id: 'NV09', 
    username: 'rasoat', 
    password: '123', 
    name: 'CN. Nguyễn Thị Thu Hà', 
    department: 'Phòng Kế hoạch Tổng hợp', 
    position: 'Tổ Rà Soát HSBA & Giám Sát', 
    phone: '0977223344', 
    zaloId: 'ha_qlcl_bv', 
    defaultRole: 'NHOM_1', 
    avatarEmoji: '🔍' 
  },
  
  // Công nghệ Thông tin (Duyệt khâu IT & Cài đặt)
  { 
    id: 'NV11', 
    username: 'it', 
    password: '123', 
    name: 'KS. Lê Minh Trí', 
    department: 'Phòng Công nghệ Thông tin', 
    position: 'Kỹ sư Quản trị HIS & Cổng BHXH', 
    phone: '0909887766', 
    zaloId: 'tri_it_his', 
    defaultRole: 'IT', 
    avatarEmoji: '💻' 
  }
];

// Hàm tạo ngày tương đối
function getRelativeDateStr(daysAgo = 0) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

export const DEFAULT_RECORDS = [
  {
    id: 'REC-1001',
    maKCB: 'BN-2026-08412',
    tenBenhNhan: 'Nguyễn Văn An',
    khoaPhong: 'Khoa Cấp cứu & Hồi sức tích cực',
    nguoiChiDinh: 'BS. CKII. Nguyễn Văn Hùng',
    ngayVaoKhoa: getRelativeDateStr(3),
    ngayKiemHoSo: getRelativeDateStr(0),
    thoiGianChiDinhYL: `${getRelativeDateStr(3)} 08:30`,
    mucDoLoi: 'Báo động',
    mucDoCanhBao: 'Báo động',
    dienGiaiLoi: 'Chỉ định kháng sinh Ceftriaxone 2g tiêm IV nhưng thiếu ghi nhận kết quả test lẩy da kháng sinh và tiền sử dị ứng trong phiếu khám ban đầu.',
    trangThaiKiemDuyet: 'Báo động',
    trangThaiLoi: 'CHƯA SỬA',
    yKienNguoiSua: '',
    ngayTao: `${getRelativeDateStr(0)} 09:15`,
    ngayCapNhat: `${getRelativeDateStr(0)} 09:15`,
    chotRaVien: false,
    ngayChotRaVien: null,
    zaloSentCount: 1,
    lastZaloSentAt: `${getRelativeDateStr(0)} 09:20`,
    zaloHistory: []
  },
  {
    id: 'REC-1002',
    maKCB: 'BN-2026-08412',
    tenBenhNhan: 'Nguyễn Văn An',
    khoaPhong: 'Khoa Cấp cứu & Hồi sức tích cực',
    nguoiChiDinh: 'BS. CKII. Nguyễn Văn Hùng',
    ngayVaoKhoa: getRelativeDateStr(3),
    ngayKiemHoSo: getRelativeDateStr(1),
    thoiGianChiDinhYL: `${getRelativeDateStr(2)} 14:00`,
    mucDoLoi: 'Nhắc nhở',
    mucDoCanhBao: 'Nhắc nhở',
    dienGiaiLoi: 'Phiếu theo dõi truyền dịch thiếu ký nhận thời gian kết thúc chai Natri Clorid 0.9% 500ml và tốc độ nhỏ giọt thực tế.',
    trangThaiKiemDuyet: 'Nhắc nhở',
    trangThaiLoi: 'ĐÃ XEM - ĐANG SỬA',
    yKienNguoiSua: 'Đã nhắc điều dưỡng ca trực bổ sung chữ ký và thời gian kết thúc vào tờ chăm sóc.',
    ngayTao: `${getRelativeDateStr(1)} 09:20`,
    ngayCapNhat: `${getRelativeDateStr(0)} 10:45`,
    chotRaVien: false,
    ngayChotRaVien: null,
    zaloSentCount: 2,
    lastZaloSentAt: `${getRelativeDateStr(0)} 11:20`,
    zaloHistory: []
  },
  {
    id: 'REC-1004',
    maKCB: 'BN-2026-07890',
    tenBenhNhan: 'Lê Đình Trọng',
    khoaPhong: 'Khoa Ngoại Tổng hợp',
    nguoiChiDinh: 'BS. CKI. Phạm Minh Tuấn',
    ngayVaoKhoa: getRelativeDateStr(6),
    ngayKiemHoSo: getRelativeDateStr(2),
    thoiGianChiDinhYL: `${getRelativeDateStr(5)} 15:45`,
    mucDoLoi: 'Yêu cầu kiểm tra',
    mucDoCanhBao: 'Yêu cầu kiểm tra',
    dienGiaiLoi: 'Phiếu phẫu thuật nội soi viêm ruột thừa cấp thiếu chữ ký của Bác sĩ phụ mổ và thiếu mô tả vị trí vết mổ dẫn lưu.',
    trangThaiKiemDuyet: 'Yêu cầu kiểm tra',
    trangThaiLoi: 'CHƯA SỬA',
    yKienNguoiSua: '',
    ngayTao: `${getRelativeDateStr(2)} 11:00`,
    ngayCapNhat: `${getRelativeDateStr(2)} 11:00`,
    chotRaVien: false,
    ngayChotRaVien: null,
    zaloSentCount: 3,
    lastZaloSentAt: `${getRelativeDateStr(2)} 15:00`,
    zaloHistory: []
  },
  {
    id: 'REC-1003',
    maKCB: 'BN-2026-09105',
    tenBenhNhan: 'Trần Thị Mai Hương',
    khoaPhong: 'Khoa Nội Tổng hợp',
    nguoiChiDinh: 'BS. CKI. Trần Thị Mai',
    ngayVaoKhoa: getRelativeDateStr(5),
    ngayKiemHoSo: getRelativeDateStr(1),
    thoiGianChiDinhYL: `${getRelativeDateStr(4)} 09:00`,
    mucDoLoi: 'Nhắc nhở',
    mucDoCanhBao: 'Nhắc nhở',
    dienGiaiLoi: 'Chỉ định xét nghiệm HbA1c và Glucose máu đói nhưng chẩn đoán chính chưa thể hiện mã ICD Đái tháo đường type 2 (E11.9).',
    trangThaiKiemDuyet: 'Nhắc nhở',
    trangThaiLoi: 'ĐÃ XONG',
    yKienNguoiSua: 'Đã bổ sung mã ICD chẩn đoán kèm theo ĐTĐ type 2 vào tờ trích biên bản hội chẩn và phần mềm HIS.',
    ngayTao: `${getRelativeDateStr(1)} 14:10`,
    ngayCapNhat: `${getRelativeDateStr(0)} 08:30`,
    chotRaVien: false,
    ngayChotRaVien: null,
    zaloSentCount: 1,
    lastZaloSentAt: `${getRelativeDateStr(1)} 14:15`,
    zaloHistory: []
  }
];

export const DEFAULT_DISCHARGE_REPORTS = [
  {
    id: 'BCRV-2026-001',
    ngayBaoCao: getRelativeDateStr(0),
    maKCB: 'BN-2026-08412',
    tenBenhNhan: 'Nguyễn Văn An',
    tenBacSi: 'BS. CKII. Nguyễn Văn Hùng',
    phong: 'Khoa Cấp cứu & Hồi sức tích cực',
    kiemDuoc: {
      status: 'CO_LOI',
      note: 'Thiếu kết quả test lẩy da kháng sinh Ceftriaxone\nCần bổ sung phiếu kết quả thử phản ứng thuốc trước khi ra viện'
    },
    kiemKeToanBH: {
      status: 'KHONG_LOI',
      note: ''
    },
    kiemKHTH: {
      status: 'CO_LOI',
      note: 'Phiếu truyền dịch thiếu ký nhận kết thúc ca trực'
    },
    kiemIT: {
      status: 'KHONG_LOI',
      note: ''
    },
    baoCaoTinhTrangSuaLoi: 'Khoa đang yêu cầu điều dưỡng ca trực bổ sung chữ ký',
    chotThongCong: 'CHUA',
    ngayThongCong: null,
    nguoiThongCong: null
  },
  {
    id: 'BCRV-2026-002',
    ngayBaoCao: getRelativeDateStr(0),
    maKCB: 'BN-2026-09105',
    tenBenhNhan: 'Trần Thị Mai Hương',
    tenBacSi: 'BS. CKI. Trần Thị Mai',
    phong: 'Khoa Nội Tổng hợp',
    kiemDuoc: {
      status: 'KHONG_LOI',
      note: ''
    },
    kiemKeToanBH: {
      status: 'KHONG_LOI',
      note: ''
    },
    kiemKHTH: {
      status: 'KHONG_LOI',
      note: ''
    },
    kiemIT: {
      status: 'KHONG_LOI',
      note: ''
    },
    baoCaoTinhTrangSuaLoi: 'Đã hoàn tất toàn bộ hồ sơ và khớp dữ liệu HIS',
    chotThongCong: 'CO',
    ngayThongCong: `${getRelativeDateStr(0)} 15:30`,
    nguoiThongCong: 'ThS. BS. Phan Thanh Sơn (KHTH)'
  },
  {
    id: 'BCRV-2026-003',
    ngayBaoCao: getRelativeDateStr(1),
    maKCB: 'BN-2026-07890',
    tenBenhNhan: 'Lê Đình Trọng',
    tenBacSi: 'BS. CKI. Phạm Minh Tuấn',
    phong: 'Khoa Ngoại Tổng hợp',
    kiemDuoc: {
      status: 'KHONG_LOI',
      note: ''
    },
    kiemKeToanBH: {
      status: 'CO_LOI',
      note: 'Thiếu áp mã phẫu thuật nội soi loại 2'
    },
    kiemKHTH: {
      status: 'CO_LOI',
      note: 'Phiếu phẫu thuật thiếu chữ ký bác sĩ phụ mổ'
    },
    kiemIT: {
      status: 'CO_LOI',
      note: 'Lỗi mã XML bảng kê 130 chưa đồng bộ với danh mục HIS'
    },
    baoCaoTinhTrangSuaLoi: 'BS Tuấn đã ký bổ sung, IT đã ánh xạ lại mã XML',
    chotThongCong: 'CHUA',
    ngayThongCong: null,
    nguoiThongCong: null
  }
];
