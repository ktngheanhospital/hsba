/**
 * Các hàm tiện ích hỗ trợ định dạng, tìm kiếm, xuất file Excel/CSV và hiển thị Badge
 */

import { MUC_DO_CANH_BAO, TRANG_THAI_KIEM_DUYET, TRANG_THAI_LOI } from './data.js';

// Định dạng ngày dạng DD/MM/YYYY
export function formatDateVN(dateStr) {
  if (!dateStr) return '---';
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return dateStr;
}

// Định dạng ngày giờ dạng HH:mm DD/MM/YYYY
export function formatDateTimeVN(dateTimeStr) {
  if (!dateTimeStr) return '---';
  const cleanStr = dateTimeStr.replace('T', ' ');
  const [datePart, timePart] = cleanStr.split(' ');
  const formattedDate = formatDateVN(datePart);
  if (!timePart) return formattedDate;
  const shortTime = timePart.substring(0, 5); // HH:mm
  return `${shortTime} ${formattedDate}`;
}

// Định dạng thời gian ra viện: Giờ: Phút, Ngày/tháng/năm (ví dụ: 08:30, 22/08/2026)
export function formatDischargeDateTimeVN(dateTimeStr) {
  if (!dateTimeStr) return '---';
  const cleanStr = dateTimeStr.replace('T', ' ').trim();
  const parts = cleanStr.split(' ');
  const datePart = parts[0] || '';
  const timePart = parts[1] || '';
  const formattedDate = formatDateVN(datePart);
  if (!timePart) return `08:30, ${formattedDate}`;
  const shortTime = timePart.substring(0, 5);
  return `${shortTime}, ${formattedDate}`;
}

// Lấy ngày giờ mặc định ra viện: 8h30 ngày N+1 (với N là ngày báo cáo YYYY-MM-DD)
export function getDefaultDischargeDateTime(reportDateStr) {
  let baseDate = new Date();
  if (reportDateStr) {
    const parts = reportDateStr.split('-');
    if (parts.length === 3) {
      const year = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1;
      const day = parseInt(parts[2], 10);
      baseDate = new Date(year, month, day);
    }
  }
  if (isNaN(baseDate.getTime())) baseDate = new Date();

  const nextDay = new Date(baseDate);
  nextDay.setDate(nextDay.getDate() + 1);

  const y = nextDay.getFullYear();
  const m = String(nextDay.getMonth() + 1).padStart(2, '0');
  const d = String(nextDay.getDate()).padStart(2, '0');

  return `${y}-${m}-${d}T08:30`;
}

// Lấy ngày hiện tại YYYY-MM-DD
export function getTodayDateString() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Lấy ngày giờ hiện tại YYYY-MM-DD HH:mm
export function getNowDateTimeString() {
  const d = new Date();
  const dateStr = getTodayDateString();
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${dateStr} ${hours}:${minutes}`;
}

// Bỏ dấu tiếng Việt để tìm kiếm không dấu
export function removeVietnameseTones(str) {
  if (!str) return '';
  str = str.toLowerCase();
  str = str.replace(/à|á|ạ|ả|ã|â|ầ|ấ|ậ|ẩ|ẫ|ă|ằ|ắ|ặ|ẳ|ẵ/g, 'a');
  str = str.replace(/è|é|ẹ|ẻ|ẽ|ê|ề|ế|ệ|ể|ễ/g, 'e');
  str = str.replace(/ì|í|ị|ỉ|ĩ/g, 'i');
  str = str.replace(/ò|ó|ọ|ỏ|õ|ô|ồ|ố|ộ|ổ|ỗ|ơ|ờ|ớ|ợ|ở|ỡ/g, 'o');
  str = str.replace(/ù|ú|ụ|ủ|ũ|ư|ừ|ứ|ự|ử|ữ/g, 'u');
  str = str.replace(/ỳ|ý|ỵ|ỷ|ỹ/g, 'y');
  str = str.replace(/đ/g, 'd');
  str = str.replace(/\u0300|\u0301|\u0303|\u0309|\u0323/g, ''); // Huyền sắc hỏi ngã nặng
  str = str.replace(/\u02C6|\u0306|\u031B/g, ''); // Â, Ê, Ă, Ơ, Ư
  return str.trim();
}

// Lấy badge Mức độ lỗi (Gồm: Không có lỗi, Nhắc nhở, Yêu cầu kiểm tra, Báo động)
export function getMucDoLoiBadge(levelStr) {
  let normalized = (levelStr || '').trim();
  if (normalized === 'KHONG_CO_LOI' || normalized === 'Không có lỗi' || normalized === 'KHÔNG CÓ LỖI' || normalized === 'KHÔNG CÓ LỖI') normalized = 'Không có lỗi';
  else if (normalized === 'Khẩn cấp' || normalized === 'BAO_DONG' || normalized === 'CHƯA SỬA') normalized = 'Báo động';
  else if (normalized === 'YÊU CẦU KIỂM TRA LẠI' || normalized === 'YEU_CAU_KIEM_TRA' || normalized === 'Cao (Nghiêm trọng)' || normalized === 'Cao') normalized = 'Yêu cầu kiểm tra';
  else if (normalized === 'NHẮC NHỞ' || normalized === 'NHAC_NHO' || normalized === 'ĐÃ SỬA' || normalized === 'Trung bình' || normalized === 'Nhẹ') normalized = 'Nhắc nhở';

  if (!normalized) normalized = 'Nhắc nhở';

  let badgeClass = 'badge-warn-nhe';
  let dotClass = 'dot-warning';
  let icon = '🟡';

  if (normalized === 'Không có lỗi') {
    badgeClass = 'badge-status-success';
    dotClass = 'dot-success';
    icon = '🟢';
  } else if (normalized === 'Báo động') {
    badgeClass = 'badge-warn-khan-cap';
    dotClass = 'dot-danger';
    icon = '🚨';
  } else if (normalized === 'Yêu cầu kiểm tra') {
    badgeClass = 'badge-status-purple';
    dotClass = 'dot-purple';
    icon = '🟣';
  } else {
    badgeClass = 'badge-warn-cao';
    dotClass = 'dot-warning';
    icon = '🟡';
  }

  return `
    <span class="badge-tag ${badgeClass}" title="Mức độ lỗi: ${escapeHtml(normalized)}">
      <span class="badge-dot ${dotClass}"></span>
      <span>${escapeHtml(normalized)}</span>
    </span>
  `;
}

// Lấy badge Mức độ cảnh báo (Clean SaaS Style)
export function getWarningBadge(levelStr) {
  return getMucDoLoiBadge(levelStr);
}

// Lấy badge Trạng thái rà soát/kiểm duyệt (đồng bộ với Mức độ lỗi)
export function getReviewStatusBadge(statusStr) {
  return getMucDoLoiBadge(statusStr);
}

// Lấy badge Trạng thái lỗi (Nhóm 2 cập nhật)
export function getErrorStatusBadge(statusStr) {
  const status = TRANG_THAI_LOI.find(s => s.label === statusStr || s.id === statusStr) || {
    label: statusStr || 'CHƯA SỬA',
    color: 'danger'
  };

  let statusClass = 'badge-status-danger';
  let dotClass = 'dot-danger';

  if (status.color === 'success' || statusStr === 'ĐÃ XONG') {
    statusClass = 'badge-status-success';
    dotClass = 'dot-success';
  } else if (status.color === 'warning' || statusStr === 'ĐÃ XEM - ĐANG SỬA') {
    statusClass = 'badge-status-warning';
    dotClass = 'dot-warning';
  } else if (status.color === 'info' || statusStr === 'GIẢI TRÌNH/Ý KIẾN KHÁC') {
    statusClass = 'badge-status-neutral';
    dotClass = 'dot-neutral';
  }

  return `
    <span class="status-badge ${statusClass}">
      <span class="status-dot ${dotClass}"></span>
      <span>${escapeHtml(status.label)}</span>
    </span>
  `;
}

// Hiển thị Toast thông báo hiện đại chuẩn SaaS
export function showToast(message, type = 'success', duration = 3500) {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast-item toast-${type}`;
  
  let iconSvg = `<svg class="toast-svg-icon" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/></svg>`;
  if (type === 'error' || type === 'danger') {
    iconSvg = `<svg class="toast-svg-icon" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd"/></svg>`;
  } else if (type === 'warning') {
    iconSvg = `<svg class="toast-svg-icon" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd"/></svg>`;
  } else if (type === 'info') {
    iconSvg = `<svg class="toast-svg-icon" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd"/></svg>`;
  }

  toast.innerHTML = `
    <div class="toast-icon-wrapper">${iconSvg}</div>
    <div class="toast-content">
      <div class="toast-message">${escapeHtml(message)}</div>
    </div>
    <button class="toast-close-btn" onclick="this.closest('.toast-item').remove()" aria-label="Đóng">&times;</button>
  `;

  container.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.add('toast-show');
  });

  setTimeout(() => {
    toast.classList.remove('toast-show');
    toast.classList.add('toast-hide');
    setTimeout(() => {
      if (toast.parentElement) toast.remove();
    }, 250);
  }, duration);
}

// Tránh XSS
export function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Xuất file Excel / CSV đầy đủ 12 cột với UTF-8 BOM
export function exportRecordsToCSV(records, filename = 'Bao_cao_Ra_soat_HSBA.csv') {
  if (!records || !records.length) {
    showToast('Không có dữ liệu để xuất file!', 'warning');
    return;
  }

  const headers = [
    'STT',
    'Mã KCB',
    'Tên Bệnh nhân',
    'Khoa/Phòng',
    'Người chỉ định/thực hiện',
    'Ngày vào khoa',
    'Ngày kiểm hồ sơ',
    'Thời gian chỉ định/thực hiện YL',
    'Mức độ cảnh báo',
    'Diễn giải lỗi',
    'Trạng thái rà soát',
    'Trạng thái lỗi',
    'Ý kiến người sửa lỗi',
    'Chốt ra viện',
    'Ngày cập nhật'
  ];

  const rows = records.map((r, index) => [
    index + 1,
    `"${(r.maKCB || '').replace(/"/g, '""')}"`,
    `"${(r.tenBenhNhan || '').replace(/"/g, '""')}"`,
    `"${(r.khoaPhong || '').replace(/"/g, '""')}"`,
    `"${(r.nguoiChiDinh || '').replace(/"/g, '""')}"`,
    `"${formatDateVN(r.ngayVaoKhoa)}"`,
    `"${formatDateVN(r.ngayKiemHoSo)}"`,
    `"${r.thoiGianChiDinhYL || ''}"`,
    `"${r.mucDoCanhBao || ''}"`,
    `"${(r.dienGiaiLoi || '').replace(/"/g, '""').replace(/\n/g, ' ')}"`,
    `"${r.trangThaiKiemDuyet || ''}"`,
    `"${r.trangThaiLoi || ''}"`,
    `"${(r.yKienNguoiSua || '').replace(/"/g, '""').replace(/\n/g, ' ')}"`,
    r.chotRaVien ? `"ĐÃ CHỐT (${formatDateVN(r.ngayChotRaVien)})"` : '"CHƯA CHỐT"',
    `"${r.ngayCapNhat || ''}"`
  ]);

  const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(row => row.join(','))].join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  showToast(`Đã xuất thành công ${records.length} bản ghi!`, 'success');
}

// In phiếu rà soát lỗi hồ sơ
export function printRecordSheet(record) {
  const printWindow = window.open('', '_blank', 'width=850,height=900');
  if (!printWindow) {
    alert('Vui lòng cho phép popup để mở trang in!');
    return;
  }

  const html = `
    <!DOCTYPE html>
    <html lang="vi">
    <head>
      <meta charset="UTF-8">
      <title>Phiếu Rà Soát HSBA - ${escapeHtml(record.maKCB)}</title>
      <style>
        body { font-family: 'Times New Roman', Times, serif; font-size: 14pt; line-height: 1.5; padding: 30px; color: #111; }
        .header { display: flex; justify-content: space-between; border-bottom: 2px solid #333; padding-bottom: 15px; margin-bottom: 20px; }
        .hospital-name { font-weight: bold; text-transform: uppercase; font-size: 13pt; }
        .title { text-align: center; font-size: 18pt; font-weight: bold; margin: 20px 0 5px 0; text-transform: uppercase; }
        .subtitle { text-align: center; font-style: italic; margin-bottom: 25px; }
        .grid-info { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 20px; }
        .info-row { display: flex; margin-bottom: 8px; }
        .info-label { font-weight: bold; width: 220px; flex-shrink: 0; }
        .info-val { flex: 1; }
        .section-box { border: 1px solid #777; border-radius: 6px; padding: 15px; margin-bottom: 20px; }
        .section-title { font-weight: bold; font-size: 14pt; margin-top: 0; margin-bottom: 10px; border-bottom: 1px dashed #999; padding-bottom: 5px; }
        .warning-tag { display: inline-block; padding: 4px 10px; font-weight: bold; border-radius: 4px; border: 1px solid #333; }
        .signature-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; text-align: center; margin-top: 50px; }
        .sig-title { font-weight: bold; margin-bottom: 70px; }
        @media print {
          body { padding: 0; }
          .no-print { display: none; }
        }
      </style>
    </head>
    <body>
      <div class="header">
        <div>
          <div class="hospital-name">BỆNH VIỆN / TRUNG TÂM Y TẾ</div>
          <div>HỘI ĐỒNG THUỐC & ĐIỀU TRỊ - TỔ RÀ SOÁT HSBA</div>
        </div>
        <div style="text-align: right;">
          <div>Mã biên bản: <strong>${escapeHtml(record.id)}</strong></div>
          <div>Ngày in: ${formatDateVN(getTodayDateString())}</div>
        </div>
      </div>

      <div class="title">PHIẾU PHẢN HỒI RÀ SOÁT HỒ SƠ BỆNH ÁN</div>
      <div class="subtitle">(Dùng cho công tác kiểm tra, giám sát chất lượng hồ sơ bệnh án)</div>

      <div class="section-box">
        <div class="section-title">I. THÔNG TIN BỆNH NHÂN & HỒ SƠ</div>
        <div class="grid-info">
          <div><strong>Mã KCB:</strong> ${escapeHtml(record.maKCB)}</div>
          <div><strong>Tên Bệnh nhân:</strong> <span style="text-transform: uppercase; font-weight: bold;">${escapeHtml(record.tenBenhNhan)}</span></div>
          <div><strong>Khoa/Phòng:</strong> ${escapeHtml(record.khoaPhong)}</div>
          <div><strong>Người chỉ định/thực hiện:</strong> ${escapeHtml(record.nguoiChiDinh || '---')}</div>
          <div><strong>Ngày vào khoa:</strong> ${formatDateVN(record.ngayVaoKhoa)}</div>
          <div><strong>Ngày kiểm hồ sơ:</strong> ${formatDateVN(record.ngayKiemHoSo)}</div>
          <div><strong>Thời gian ra/thực hiện YL:</strong> ${escapeHtml(record.thoiGianChiDinhYL)}</div>
          <div><strong>Mức độ cảnh báo:</strong> <span class="warning-tag">${escapeHtml(record.mucDoCanhBao)}</span></div>
        </div>
      </div>

      <div class="section-box">
        <div class="section-title">II. NỘI DUNG SAI SÓT / LỖI ĐƯỢC PHÁT HIỆN</div>
        <p style="white-space: pre-wrap; font-size: 13pt; min-height: 50px;">${escapeHtml(record.dienGiaiLoi)}</p>
        <div style="margin-top: 10px;">
          <strong>Trạng thái rà soát:</strong> ${escapeHtml(record.trangThaiKiemDuyet)} | 
          <strong>Trạng thái khắc phục:</strong> ${escapeHtml(record.trangThaiLoi)}
        </div>
      </div>

      <div class="section-box">
        <div class="section-title">III. Ý KIẾN / BIỆN PHÁP KHẮC PHỤC CỦA KHOA PHÒNG</div>
        <p style="white-space: pre-wrap; font-size: 13pt; min-height: 60px;">${escapeHtml(record.yKienNguoiSua || '(Chưa có ý kiến phản hồi)')}</p>
      </div>

      <div class="signature-grid">
        <div>
          <div class="sig-title">NGƯỜI RÀ SOÁT HSBA</div>
          <div>(Ký, ghi rõ họ tên)</div>
        </div>
        <div>
          <div class="sig-title">NGƯỜI SỬA LỖI / BÁC SĨ</div>
          <div>(Ký, ghi rõ họ tên)</div>
        </div>
        <div>
          <div class="sig-title">TRƯỞNG KHOA / PHÒNG</div>
          <div>(Ký, ghi rõ họ tên)</div>
        </div>
      </div>

      <div class="no-print" style="margin-top: 40px; text-align: center;">
        <button onclick="window.print()" style="padding: 10px 24px; font-size: 14pt; cursor: pointer; background: #0284c7; color: #fff; border: none; border-radius: 6px;">In phiếu ngay</button>
      </div>
    </body>
    </html>
  `;

  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
}

// Trích xuất chuỗi ngày YYYY-MM-DD từ đối tượng bản ghi hoặc báo cáo ra viện
export function extractDateString(item) {
  if (!item) return '';
  if (typeof item === 'string') {
    const clean = item.replace('T', ' ').trim();
    const datePart = clean.split(' ')[0] || '';
    if (datePart.length === 10 && datePart.includes('-')) return datePart;
    if (datePart.length === 10 && datePart.includes('/')) {
      const p = datePart.split('/');
      if (p.length === 3) return `${p[2]}-${p[1]}-${p[0]}`;
    }
    return datePart.substring(0, 10);
  }
  const rawDate = item.ngayBaoCao || item.ngayRaVien || item.ngayKiemHoSo || item.thoiGianChiDinhYL || item.ngayCapNhat || item.ngayTao || '';
  if (!rawDate) return '';
  const clean = String(rawDate).replace('T', ' ').trim();
  const datePart = clean.split(' ')[0] || '';
  return datePart.substring(0, 10);
}

// Kiểm tra chuỗi ngày có khớp với bộ lọc thời gian (DAY, MONTH, YEAR, ALL)
export function matchesTimePeriod(dateStr, timeFilter) {
  if (!timeFilter || timeFilter.type === 'ALL') return true;
  if (!dateStr) return false;
  const d = dateStr.substring(0, 10);
  if (timeFilter.type === 'DAY') {
    return d === timeFilter.value;
  }
  if (timeFilter.type === 'MONTH') {
    return d.substring(0, 7) === timeFilter.value;
  }
  if (timeFilter.type === 'YEAR') {
    return d.substring(0, 4) === String(timeFilter.value);
  }
  return true;
}

// ==========================================================================
// TÍNH TOÁN SỐ LIỆU TỔNG QUAN DASHBOARD (ĐIỀU KIỆN 1 & ĐIỀU KIỆN 2 CÓ LỌC THỜI GIAN)
// ==========================================================================
export function computeDashboardStats(allRecords, allDischargeReports, departments, timeFilter = { type: 'DAY', value: getTodayDateString() }) {
  // Lọc dữ liệu theo thời gian đã chọn
  const dischargeReports = (allDischargeReports || []).filter(d => matchesTimePeriod(extractDateString(d), timeFilter));
  const records = (allRecords || []).filter(r => matchesTimePeriod(extractDateString(r), timeFilter));

  // 1. Tạo Map hồ sơ ra viện theo maKCB chuẩn hóa
  const dischargeMap = new Map();
  dischargeReports.forEach(d => {
    const key = (d.maKCB || '').trim().toLowerCase();
    if (key) {
      if (!dischargeMap.has(key)) {
        dischargeMap.set(key, []);
      }
      dischargeMap.get(key).push(d);
    }
  });

  // 2. Phân loại lỗi theo Điều kiện 1 và Điều kiện 2
  const dk1Errors = [];
  const dk2Errors = [];

  records.forEach(r => {
    const key = (r.maKCB || '').trim().toLowerCase();
    const matchedDischarges = dischargeMap.get(key) || [];

    if (matchedDischarges.length > 0) {
      matchedDischarges.forEach(discharge => {
        const dischargeDateRaw = discharge.ngayRaVien || discharge.ngayBaoCao || '';
        const dischargeDate = dischargeDateRaw.substring(0, 10);
        const reportDate = (discharge.ngayBaoCao || '').substring(0, 10);

        // Tính ngày N+1
        let nextDayStr = '';
        if (dischargeDate) {
          const parts = dischargeDate.split('-');
          if (parts.length === 3) {
            const dt = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
            dt.setDate(dt.getDate() + 1);
            const y = dt.getFullYear();
            const m = String(dt.getMonth() + 1).padStart(2, '0');
            const d = String(dt.getDate()).padStart(2, '0');
            nextDayStr = `${y}-${m}-${d}`;
          }
        }

        const isUnresolved = r.trangThaiLoi !== 'ĐÃ XONG';

        // ĐIỀU KIỆN 1: Hồ sơ chuyển viện hoặc ra viện trong ngày (trùng ngày báo cáo), xét tại 16:01 ngày N, TIẾN ĐỘ SỬA !== 'ĐÃ XONG'
        const isSameDay = (dischargeDate === reportDate) || (r.trangThaiLoi === 'HỦY CHUYỂN VIỆN');
        if (isSameDay && isUnresolved) {
          dk1Errors.push({
            ...r,
            dischargeRecord: discharge,
            dischargeDate: dischargeDate,
            checkDeadline: `16:01, ${formatDateVN(dischargeDate)}`,
            conditionType: 'DK1'
          });
        }

        // ĐIỀU KIỆN 2: Hồ sơ ra viện, xét tại 16:01 ngày hôm sau (16:01 ngày N+1), TIẾN ĐỘ SỬA !== 'ĐÃ XONG'
        if (isUnresolved) {
          dk2Errors.push({
            ...r,
            dischargeRecord: discharge,
            dischargeDate: dischargeDate,
            checkDeadline: `16:01, ${formatDateVN(nextDayStr || dischargeDate)} (N+1)`,
            conditionType: 'DK2'
          });
        }
      });
    }
  });

  // 3. Thống kê theo Khoa/Phòng
  const deptStats = (departments || []).map(d => {
    const deptName = d.name;
    const deptClean = deptName.trim().toLowerCase();

    const deptDischarges = dischargeReports.filter(dr => (dr.phong || '').trim().toLowerCase() === deptClean);
    const totalDischarge = deptDischarges.length;
    const passedDischarge = deptDischarges.filter(dr => dr.chotThongCong === 'CO').length;
    const pendingDischarge = totalDischarge - passedDischarge;

    const deptRecords = records.filter(r => (r.khoaPhong || '').trim().toLowerCase() === deptClean);
    const totalErrors = deptRecords.length;
    const unresolvedErrors = deptRecords.filter(r => r.trangThaiLoi !== 'ĐÃ XONG').length;

    const deptDK1 = dk1Errors.filter(e => (e.khoaPhong || '').trim().toLowerCase() === deptClean || (e.dischargeRecord && (e.dischargeRecord.phong || '').trim().toLowerCase() === deptClean)).length;
    const deptDK2 = dk2Errors.filter(e => (e.khoaPhong || '').trim().toLowerCase() === deptClean || (e.dischargeRecord && (e.dischargeRecord.phong || '').trim().toLowerCase() === deptClean)).length;

    return {
      id: d.id,
      name: deptName,
      code: d.code,
      totalDischarge,
      passedDischarge,
      pendingDischarge,
      passRatio: totalDischarge > 0 ? Math.round((passedDischarge / totalDischarge) * 100) : 0,
      totalErrors,
      unresolvedErrors,
      dk1Count: deptDK1,
      dk2Count: deptDK2
    };
  });

  // 4. Danh sách người phạm lỗi (Người ra y lệnh / chỉ định) kèm Khoa/Phòng
  const violatorMap = new Map();
  records.forEach(r => {
    const rawDoctor = (r.nguoiChiDinh || '').trim();
    const dept = (r.khoaPhong || '').trim() || 'Chung';
    // Những lỗi không có tên người phạm lỗi cụ thể thì hiện tên khoa/phòng lỗi
    const displayName = rawDoctor || `[Khoa] ${dept}`;
    const key = `${displayName}___${dept}`.toLowerCase();

    if (!violatorMap.has(key)) {
      violatorMap.set(key, {
        name: displayName,
        isGenericDept: !rawDoctor,
        department: dept,
        totalErrors: 0,
        unresolvedCount: 0,
        dk1Count: 0,
        dk2Count: 0,
        errors: []
      });
    }

    const v = violatorMap.get(key);
    v.totalErrors++;
    if (r.trangThaiLoi !== 'ĐÃ XONG') {
      v.unresolvedCount++;
    }

    const matchDK1 = dk1Errors.some(e => e.id === r.id);
    const matchDK2 = dk2Errors.some(e => e.id === r.id);
    if (matchDK1) v.dk1Count++;
    if (matchDK2) v.dk2Count++;

    v.errors.push({
      ...r,
      isDK1: matchDK1,
      isDK2: matchDK2
    });
  });

  const violatorsList = Array.from(violatorMap.values()).sort((a, b) => 
    (b.dk2Count + b.dk1Count) - (a.dk2Count + a.dk1Count) || 
    b.unresolvedCount - a.unresolvedCount || 
    b.totalErrors - a.totalErrors
  );

  return {
    timeFilter,
    totalDischarge: dischargeReports.length,
    passedDischarge: dischargeReports.filter(d => d.chotThongCong === 'CO').length,
    pendingDischarge: dischargeReports.filter(d => d.chotThongCong !== 'CO').length,
    totalRecords: records.length,
    unresolvedRecords: records.filter(r => r.trangThaiLoi !== 'ĐÃ XONG').length,
    dk1Errors,
    dk2Errors,
    deptStats,
    violatorsList,
    filteredDischarges: dischargeReports,
    filteredRecords: records
  };
}

// ==========================================================================
// XUẤT BÁO CÁO DASHBOARD DẠNG EXCEL (.XLSX) - KÈM SỐ LIỆU ĐỐI CHIẾU BIỂU ĐỒ
// ==========================================================================
export function exportDashboardToExcel(statsData, filename = 'Bao_cao_Tong_quan_HSBA_BVHNDK_NgheAn.xlsx', chartInfo = null) {
  if (typeof XLSX !== 'undefined') {
    const wb = XLSX.utils.book_new();
    const periodStr = chartInfo?.timePeriodLabel || ('Ngày xuất: ' + formatDateVN(getTodayDateString()));

    // Sheet 1: Thống kê HSBA Ra Viện & Lỗi Theo Khoa
    const ws1Data = [
      ['BÁO CÁO THỐNG KÊ HỒ SƠ BỆNH ÁN RA VIỆN & TỔNG HỢP LỖI THEO KHOA/PHÒNG'],
      ['Bệnh viện Hữu Nghị Đa Khoa Nghệ An - ' + periodStr],
      [],
      ['STT', 'Khoa / Phòng', 'Tổng số HSBA ra viện', 'Đã thông cổng', 'Chưa thông cổng', 'Tỷ lệ thông cổng (%)', 'Lỗi Điều kiện 1 (16h01 ngày N)', 'Lỗi Điều kiện 2 (16h01 ngày N+1)', 'Tổng lỗi tồn đọng']
    ];

    statsData.deptStats.forEach((d, idx) => {
      ws1Data.push([
        idx + 1,
        d.name,
        d.totalDischarge,
        d.passedDischarge,
        d.pendingDischarge,
        `${d.passRatio}%`,
        d.dk1Count,
        d.dk2Count,
        d.unresolvedErrors
      ]);
    });

    // Sheet 2: Danh Sách Người Phạm Lỗi (Người Ra Y Lệnh)
    const ws2Data = [
      ['DANH SÁCH BÁC SĨ / NGƯỜI RA Y LỆNH PHÁT SINH LỖI VÀ THEO KHOA PHÒNG'],
      ['Bệnh viện Hữu Nghị Đa Khoa Nghệ An - ' + periodStr],
      [],
      ['STT', 'Người ra Y Lệnh / Chỉ định (hoặc Khoa)', 'Khoa / Phòng công tác', 'Tổng số lỗi', 'Lỗi chưa sửa', 'Lỗi Điều kiện 1', 'Lỗi Điều kiện 2']
    ];

    statsData.violatorsList.forEach((v, idx) => {
      ws2Data.push([
        idx + 1,
        v.name,
        v.department,
        v.totalErrors,
        v.unresolvedCount,
        v.dk1Count,
        v.dk2Count
      ]);
    });

    // Sheet 3: Chi Tiết Lỗi Điều Kiện 1 & Điều Kiện 2
    const ws3Data = [
      ['DANH SÁCH CHI TIẾT CÁC LỖI THUỘC ĐIỀU KIỆN 1 VÀ ĐIỀU KIỆN 2'],
      ['Bệnh viện Hữu Nghị Đa Khoa Nghệ An - ' + periodStr],
      [],
      ['STT', 'Nhóm Điều Kiện', 'Mã KCB', 'Tên Bệnh Nhân', 'Khoa/Phòng', 'Người ra YL/Chỉ định', 'Ngày ra viện', 'Mốc xét chốt lỗi', 'Mức độ cảnh báo', 'Diễn giải lỗi', 'Tiến độ sửa']
    ];

    let rowIdx = 1;
    statsData.dk1Errors.forEach(e => {
      ws3Data.push([
        rowIdx++,
        'Điều kiện 1 (16h01 cùng ngày N)',
        e.maKCB,
        e.tenBenhNhan,
        e.khoaPhong,
        e.nguoiChiDinh || '(Chưa ghi rõ BS)',
        formatDateVN(e.dischargeDate),
        e.checkDeadline,
        e.mucDoCanhBao || e.mucDoLoi,
        (e.dienGiaiLoi || '').replace(/\n/g, ' '),
        e.trangThaiLoi
      ]);
    });

    statsData.dk2Errors.forEach(e => {
      ws3Data.push([
        rowIdx++,
        'Điều kiện 2 (16h01 ngày N+1)',
        e.maKCB,
        e.tenBenhNhan,
        e.khoaPhong,
        e.nguoiChiDinh || '(Chưa ghi rõ BS)',
        formatDateVN(e.dischargeDate),
        e.checkDeadline,
        e.mucDoCanhBao || e.mucDoLoi,
        (e.dienGiaiLoi || '').replace(/\n/g, ' '),
        e.trangThaiLoi
      ]);
    });

    const ws1 = XLSX.utils.aoa_to_sheet(ws1Data);
    const ws2 = XLSX.utils.aoa_to_sheet(ws2Data);
    const ws3 = XLSX.utils.aoa_to_sheet(ws3Data);

    XLSX.utils.book_append_sheet(wb, ws1, 'Tong_Quan_Khoa_Phong');
    XLSX.utils.book_append_sheet(wb, ws2, 'Nguoi_Pham_Loi');
    XLSX.utils.book_append_sheet(wb, ws3, 'Chi_Tiet_Loi_DK1_DK2');

    // Sheet 4: Bảng Đối Chiếu Số Liệu Biểu Đồ (Nếu có)
    if (chartInfo && chartInfo.selectedMetrics && chartInfo.selectedMetrics.length > 0) {
      const modeLabel = chartInfo.chartMode === 'DEPT' ? 'Khoa / Phòng' : 'Bác Sĩ / Người ra Y Lệnh';
      const ws4Data = [
        ['BẢNG ĐỐI CHIẾU SỐ LIỆU TỪ BIỂU ĐỒ SO SÁNH TRỰC QUAN'],
        ['Bệnh viện Hữu Nghị Đa Khoa Nghệ An - ' + periodStr],
        ['Chế độ so sánh: ' + modeLabel + ' | Dạng biểu đồ: ' + (chartInfo.chartTypeLabel || 'Cột')],
        [],
        ['STT', modeLabel, 'Khoa/Mã', ...chartInfo.selectedMetrics.map(m => m.label)]
      ];

      const entityList = chartInfo.selectedEntities || [];
      entityList.forEach((item, idx) => {
        const itemData = chartInfo.chartMode === 'DEPT' ? item : {
          totalDischarge: 0,
          passedDischarge: 0,
          pendingDischarge: 0,
          dk1Count: item.dk1Count || 0,
          dk2Count: item.dk2Count || 0,
          totalErrors: item.totalErrors || 0,
          unresolvedErrors: item.unresolvedCount || 0,
          passRatio: 0
        };

        const row = [
          idx + 1,
          item.name,
          chartInfo.chartMode === 'DEPT' ? (item.code || '') : (item.department || ''),
          ...chartInfo.selectedMetrics.map(m => {
            if (m.key === 'passRatio') return `${itemData[m.key] || 0}%`;
            return itemData[m.key] || 0;
          })
        ];
        ws4Data.push(row);
      });

      // Total summary row
      const totalRow = [
        '',
        `TỔNG CỘNG (${entityList.length} đối tượng)`,
        '',
        ...chartInfo.selectedMetrics.map(m => {
          if (m.key === 'passRatio') return '---';
          return entityList.reduce((sum, item) => {
            const val = chartInfo.chartMode === 'DEPT' ? (item[m.key] || 0) : ((m.key === 'unresolvedErrors' ? item.unresolvedCount : item[m.key]) || 0);
            return sum + val;
          }, 0);
        })
      ];
      ws4Data.push(totalRow);

      const ws4 = XLSX.utils.aoa_to_sheet(ws4Data);
      XLSX.utils.book_append_sheet(wb, ws4, 'So_Sanh_Truc_Quan_Chart');
    }

    XLSX.writeFile(wb, filename);
    showToast('Đã xuất thành công file Excel báo cáo tổng quan Dashboard kèm số liệu biểu đồ!', 'success');
  } else {
    // Fallback CSV export
    exportRecordsToCSV(statsData.dk2Errors.concat(statsData.dk1Errors), filename.replace('.xlsx', '.csv'));
  }
}

// ==========================================================================
// XUẤT BÁO CÁO DASHBOARD DẠNG PDF (IN BÁO CÁO Y TẾ KÈM BIỂU ĐỒ TRỰC QUAN)
// ==========================================================================
export function printDashboardReportPDF(statsData, chartInfo = null) {
  const printWindow = window.open('', '_blank', 'width=1150,height=950');
  if (!printWindow) {
    alert('Vui lòng cho phép mở popup trên trình duyệt để xuất báo cáo PDF!');
    return;
  }

  const todayStr = formatDateVN(getTodayDateString());
  const periodText = chartInfo?.timePeriodLabel || `Hôm nay (${todayStr})`;

  const deptRowsHtml = statsData.deptStats.map((d, idx) => `
    <tr>
      <td style="text-align: center;">${idx + 1}</td>
      <td><strong>${escapeHtml(d.name)}</strong></td>
      <td style="text-align: center; font-weight: bold;">${d.totalDischarge}</td>
      <td style="text-align: center; color: #15803d; font-weight: bold;">${d.passedDischarge} (${d.passRatio}%)</td>
      <td style="text-align: center; color: #b91c1c; font-weight: bold;">${d.pendingDischarge}</td>
      <td style="text-align: center; color: #d97706; font-weight: bold;">${d.dk1Count}</td>
      <td style="text-align: center; color: #b91c1c; font-weight: bold;">${d.dk2Count}</td>
      <td style="text-align: center; font-weight: bold;">${d.unresolvedErrors}</td>
    </tr>
  `).join('');

  const violatorRowsHtml = statsData.violatorsList.slice(0, 20).map((v, idx) => `
    <tr>
      <td style="text-align: center;">${idx + 1}</td>
      <td><strong>${escapeHtml(v.name)}</strong></td>
      <td>${escapeHtml(v.department)}</td>
      <td style="text-align: center; font-weight: bold;">${v.totalErrors}</td>
      <td style="text-align: center; color: #b91c1c; font-weight: bold;">${v.unresolvedCount}</td>
      <td style="text-align: center; color: #d97706; font-weight: bold;">${v.dk1Count}</td>
      <td style="text-align: center; color: #b91c1c; font-weight: bold;">${v.dk2Count}</td>
    </tr>
  `).join('');

  const dk1RowsHtml = statsData.dk1Errors.slice(0, 15).map((e, idx) => `
    <tr>
      <td style="text-align: center;">${idx + 1}</td>
      <td style="font-family: monospace; font-weight: bold;">${escapeHtml(e.maKCB)}</td>
      <td>${escapeHtml(e.tenBenhNhan)}</td>
      <td>${escapeHtml(e.khoaPhong)}</td>
      <td>${escapeHtml(e.nguoiChiDinh || '---')}</td>
      <td style="text-align: center;">${formatDateVN(e.dischargeDate)}</td>
      <td style="font-size: 9pt;">${escapeHtml(e.dienGiaiLoi)}</td>
      <td style="text-align: center; color: #b91c1c; font-weight: bold;">${escapeHtml(e.trangThaiLoi)}</td>
    </tr>
  `).join('');

  const dk2RowsHtml = statsData.dk2Errors.slice(0, 15).map((e, idx) => `
    <tr>
      <td style="text-align: center;">${idx + 1}</td>
      <td style="font-family: monospace; font-weight: bold;">${escapeHtml(e.maKCB)}</td>
      <td>${escapeHtml(e.tenBenhNhan)}</td>
      <td>${escapeHtml(e.khoaPhong)}</td>
      <td>${escapeHtml(e.nguoiChiDinh || '---')}</td>
      <td style="text-align: center;">${formatDateVN(e.dischargeDate)}</td>
      <td style="font-size: 9pt;">${escapeHtml(e.dienGiaiLoi)}</td>
      <td style="text-align: center; color: #b91c1c; font-weight: bold;">${escapeHtml(e.trangThaiLoi)}</td>
    </tr>
  `).join('');

  const html = `
    <!DOCTYPE html>
    <html lang="vi">
    <head>
      <meta charset="UTF-8">
      <title>Báo Cáo Tổng Quan Giám Sát HSBA & Ra Viện</title>
      <style>
        body { font-family: 'Times New Roman', Times, serif; font-size: 11pt; line-height: 1.4; padding: 25px; color: #111; }
        .header-grid { display: flex; justify-content: space-between; border-bottom: 2px solid #222; padding-bottom: 12px; margin-bottom: 16px; }
        .hospital-brand { text-transform: uppercase; font-size: 11pt; font-weight: bold; }
        .title { text-align: center; font-size: 16pt; font-weight: bold; margin: 15px 0 5px 0; text-transform: uppercase; color: #0f766e; }
        .subtitle { text-align: center; font-style: italic; margin-bottom: 20px; font-size: 10.5pt; }
        .period-tag { display: inline-block; background: #e0f2fe; color: #0369a1; padding: 3px 10px; border-radius: 4px; font-weight: bold; font-style: normal; margin-top: 4px; }
        
        .kpi-summary-box { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 20px; text-align: center; }
        .kpi-metric-box { border: 1px solid #ccc; border-radius: 6px; padding: 10px; background: #f8fafc; }
        .kpi-metric-box h4 { margin: 0 0 5px 0; font-size: 9.5pt; text-transform: uppercase; color: #475569; }
        .kpi-metric-box div { font-size: 16pt; font-weight: bold; }

        table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 10pt; }
        th, td { border: 1px solid #777; padding: 6px 8px; text-align: left; vertical-align: middle; }
        th { background-color: #f1f5f9; font-weight: bold; text-align: center; }
        .section-header { font-size: 12pt; font-weight: bold; margin: 20px 0 8px 0; color: #1e293b; border-bottom: 1px solid #94a3b8; padding-bottom: 4px; }
        
        .chart-box { text-align: center; margin: 15px 0; padding: 12px; background: #ffffff; border: 1px solid #ccc; border-radius: 6px; page-break-inside: avoid; }
        .chart-img { max-width: 100%; height: auto; max-height: 440px; display: block; margin: 0 auto; object-fit: contain; }
        .chart-caption { font-size: 9.5pt; color: #475569; font-style: italic; margin-top: 8px; font-weight: 500; }

        .signature-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; text-align: center; margin-top: 40px; page-break-inside: avoid; }
        .sig-title { font-weight: bold; margin-bottom: 60px; font-size: 10.5pt; }

        @media print {
          body { padding: 0; }
          .no-print { display: none; }
          @page { size: A4 portrait; margin: 15mm 10mm; }
        }
      </style>
    </head>
    <body>
      <div class="header-grid">
        <div>
          <div class="hospital-brand">BỆNH VIỆN HỮU NGHỊ ĐA KHOA NGHỆ AN</div>
          <div>HỘI ĐỒNG THUỐC & ĐIỀU TRỊ - TỔ RÀ SOÁT HSBA</div>
        </div>
        <div style="text-align: right;">
          <div><strong>CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</strong></div>
          <div style="font-style: italic;">Độc lập - Tự do - Hạnh phúc</div>
          <div style="margin-top: 4px; font-size: 9.5pt;">Nghệ An, ngày ${todayStr}</div>
        </div>
      </div>

      <div class="title">BÁO CÁO TỔNG HỢP GIÁM SÁT HSBA & CHỐT RA VIỆN</div>
      <div class="subtitle">
        <div>(Theo dõi tiến độ sửa lỗi, vi phạm Điều kiện 1 tại 16h01 ngày N và Điều kiện 2 tại 16h01 ngày N+1)</div>
        <div class="period-tag">Kỳ thống kê: ${escapeHtml(periodText)}</div>
      </div>

      <!-- Khung KPI tổng thể -->
      <div class="kpi-summary-box">
        <div class="kpi-metric-box">
          <h4>Tổng HSBA Ra Viện</h4>
          <div style="color: #0f766e;">${statsData.totalDischarge}</div>
        </div>
        <div class="kpi-metric-box">
          <h4>Lỗi Điều Kiện 1 (16h01 N)</h4>
          <div style="color: #d97706;">${statsData.dk1Errors.length}</div>
        </div>
        <div class="kpi-metric-box">
          <h4>Lỗi Điều Kiện 2 (16h01 N+1)</h4>
          <div style="color: #b91c1c;">${statsData.dk2Errors.length}</div>
        </div>
        <div class="kpi-metric-box">
          <h4>Đã Thông Cổng BHYT</h4>
          <div style="color: #15803d;">${statsData.passedDischarge}</div>
        </div>
      </div>

      <!-- Bảng 1: Thống kê HSBA ra viện theo từng khoa -->
      <div class="section-header">I. THỐNG KÊ HỒ SƠ RA VIỆN & TIẾN ĐỘ SỬA LỖI THEO KHOA/PHÒNG</div>
      <table>
        <thead>
          <tr>
            <th style="width: 35px;">STT</th>
            <th>Khoa / Phòng</th>
            <th style="width: 85px;">HSBA Ra viện</th>
            <th style="width: 100px;">Đã thông cổng</th>
            <th style="width: 95px;">Chưa thông cổng</th>
            <th style="width: 90px;">Lỗi ĐK1 (16h01 N)</th>
            <th style="width: 95px;">Lỗi ĐK2 (16h01 N+1)</th>
            <th style="width: 85px;">Lỗi chưa sửa</th>
          </tr>
        </thead>
        <tbody>
          ${deptRowsHtml || '<tr><td colspan="8" style="text-align:center;">Chưa có dữ liệu</td></tr>'}
        </tbody>
      </table>

      <!-- Bảng 2: Danh sách người phạm lỗi -->
      <div class="section-header">II. TỔNG HỢP NGƯỜI RA Y LỆNH / CHỈ ĐỊNH PHÁT SINH LỖI</div>
      <table>
        <thead>
          <tr>
            <th style="width: 35px;">STT</th>
            <th>Người ra Y lệnh / Chỉ định (hoặc Khoa)</th>
            <th>Khoa / Phòng</th>
            <th style="width: 80px;">Tổng lỗi</th>
            <th style="width: 90px;">Chưa sửa</th>
            <th style="width: 90px;">Lỗi ĐK1</th>
            <th style="width: 90px;">Lỗi ĐK2</th>
          </tr>
        </thead>
        <tbody>
          ${violatorRowsHtml || '<tr><td colspan="7" style="text-align:center;">Không có phát sinh lỗi</td></tr>'}
        </tbody>
      </table>

      <!-- Bảng 3: Chi tiết các ca lỗi ĐK1 & ĐK2 -->
      <div class="section-header">III. DANH SÁCH CHI TIẾT CÁC LỖI THUỘC ĐIỀU KIỆN 1 & ĐIỀU KIỆN 2</div>
      <table>
        <thead>
          <tr>
            <th style="width: 35px;">STT</th>
            <th style="width: 110px;">Mã KCB</th>
            <th style="width: 130px;">Tên Bệnh nhân</th>
            <th style="width: 130px;">Khoa/Phòng</th>
            <th style="width: 110px;">Bác sĩ YL</th>
            <th style="width: 90px;">Ngày ra viện</th>
            <th>Diễn giải lỗi phát hiện</th>
            <th style="width: 90px;">Tiến độ</th>
          </tr>
        </thead>
        <tbody>
          ${(dk2RowsHtml || dk1RowsHtml) ? (dk2RowsHtml + dk1RowsHtml) : '<tr><td colspan="8" style="text-align:center;">Không có lỗi Điều kiện 1 & Điều kiện 2</td></tr>'}
        </tbody>
      </table>

      <!-- Phần IV: Biểu đồ so sánh trực quan (Đưa xuống dưới cùng nội dung báo cáo) -->
      ${chartInfo && chartInfo.chartImage ? `
        <div class="section-header">IV. BIỂU ĐỒ SO SÁNH TRỰC QUAN CHỈ SỐ THEO ${chartInfo.chartMode === 'DEPT' ? 'KHOA / PHÒNG' : 'BÁC SĨ / NGƯỜI RA Y LỆNH'}</div>
        <div class="chart-box">
          <img src="${chartInfo.chartImage}" class="chart-img" alt="Biểu đồ so sánh trực quan" />
          <div class="chart-caption">
            Hình: ${escapeHtml(chartInfo.chartTitle || 'Biểu đồ so sánh trực quan')} - Kỳ báo cáo: ${escapeHtml(periodText)}
          </div>
        </div>
        ${chartInfo.tableRowsHtml ? `
          <div style="margin-top: 10px; margin-bottom: 20px;">
            <div style="font-size: 10pt; font-weight: bold; margin-bottom: 6px; color: #334155;">Số liệu đối chiếu chi tiết biểu đồ:</div>
            ${chartInfo.tableRowsHtml}
          </div>
        ` : ''}
      ` : ''}

      <!-- Chữ ký -->
      <div class="signature-grid">
        <div>
          <div class="sig-title">NGƯỜI LẬP BÁO CÁO</div>
          <div>(Ký, ghi rõ họ tên)</div>
        </div>
        <div>
          <div class="sig-title">TRƯỞNG PHÒNG KHTH</div>
          <div>(Ký, ghi rõ họ tên)</div>
        </div>
        <div>
          <div class="sig-title">GIÁM ĐỐC BỆNH VIỆN</div>
          <div>(Ký, đóng dấu)</div>
        </div>
      </div>

      <div class="no-print" style="margin-top: 30px; text-align: center;">
        <button onclick="window.print()" style="padding: 10px 26px; font-size: 13pt; cursor: pointer; background: #0f766e; color: #fff; border: none; border-radius: 6px; font-weight: bold;">
          🖨️ In Báo Cáo / Lưu PDF
        </button>
      </div>
    </body>
    </html>
  `;

  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
}
