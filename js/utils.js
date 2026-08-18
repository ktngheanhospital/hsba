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
  const [datePart, timePart] = dateTimeStr.split(' ');
  if (!timePart) return formatDateVN(datePart);
  return `${timePart} ${formatDateVN(datePart)}`;
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

// Lấy badge Mức độ lỗi (Gồm: Nhắc nhở, Yêu cầu kiểm tra, Báo động)
export function getMucDoLoiBadge(levelStr) {
  let normalized = (levelStr || '').trim();
  if (normalized === 'Khẩn cấp' || normalized === 'BAO_DONG' || normalized === 'CHƯA SỬA') normalized = 'Báo động';
  if (normalized === 'YÊU CẦU KIỂM TRA LẠI' || normalized === 'YEU_CAU_KIEM_TRA' || normalized === 'Cao (Nghiêm trọng)' || normalized === 'Cao') normalized = 'Yêu cầu kiểm tra';
  if (normalized === 'NHẮC NHỞ' || normalized === 'NHAC_NHO' || normalized === 'ĐÃ SỬA' || normalized === 'Trung bình' || normalized === 'Nhẹ') normalized = 'Nhắc nhở';

  if (!normalized) normalized = 'Nhắc nhở';

  let badgeClass = 'badge-warn-nhe';
  let dotClass = 'dot-warning';
  let icon = '🟡';

  if (normalized === 'Báo động') {
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
