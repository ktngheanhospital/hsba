/**
 * Quản lý tất cả các Hộp thoại (Modal Dialogs) với cơ chế Phân Quyền CHUYÊN BIỆT 4 Khâu Kiểm Lỗi:
 * - Khâu Dược: Chỉ Khoa Dược & Admin
 * - Khâu Kế toán BH: Chỉ Kế toán BHYT & Admin
 * - Khâu KHTH: Chỉ Kế hoạch Tổng hợp & Admin (+ Độc quyền Chốt thông cổng)
 * - Khâu IT: Chỉ Phòng CNTT & Admin
 */

import { storage } from './storage.js';
import { zaloService } from './zaloService.js';
import { MUC_DO_CANH_BAO, TRANG_THAI_KIEM_DUYET, TRANG_THAI_LOI } from './data.js';
import { showToast, getTodayDateString, getNowDateTimeString, escapeHtml, printRecordSheet, formatDateTimeVN, formatDateVN, getMucDoLoiBadge } from './utils.js';

export class ModalController {
  constructor(app) {
    this.app = app;
    this.activeModal = null;
  }

  // Đóng modal hiện tại
  closeModal() {
    const modalContainer = document.getElementById('modal-root');
    if (modalContainer) {
      modalContainer.innerHTML = '';
      modalContainer.classList.remove('modal-active');
    }
    this.activeModal = null;
    document.body.classList.remove('body-lock-scroll');
  }

  // Render modal vào root
  renderModal(contentHtml, modalClass = '') {
    const modalRoot = document.getElementById('modal-root');
    if (!modalRoot) return;

    modalRoot.innerHTML = `
      <div class="modal-backdrop" id="modal-backdrop"></div>
      <div class="modal-dialog-wrapper">
        <div class="modal-dialog ${modalClass}" role="dialog" aria-modal="true">
          ${contentHtml}
        </div>
      </div>
    `;

    modalRoot.classList.add('modal-active');
    document.body.classList.add('body-lock-scroll');

    const backdrop = document.getElementById('modal-backdrop');
    if (backdrop) {
      backdrop.onclick = () => this.closeModal();
    }

    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        this.closeModal();
        window.removeEventListener('keydown', onKeyDown);
      }
    };
    window.addEventListener('keydown', onKeyDown);
  }

  // ==========================================
  // 1. MODAL THÊM LỖI RÀ SOÁT HSBA MỚI
  // ==========================================
  openAddErrorModal() {
    if (!storage.canAddRecord()) {
      showToast('⚠️ Bạn đang ở vai trò Khoa/Bác sĩ. Chỉ Tổ Rà Soát, KHTH hoặc Admin mới có quyền báo cáo lỗi mới!', 'warning', 4000);
      return;
    }

    const departments = storage.getDepartments();
    const staffList = storage.getStaff();
    const today = getTodayDateString();
    const nowDateTime = getNowDateTimeString().replace(' ', 'T');

    const deptOptions = departments.map(d => `<option value="${escapeHtml(d.name)}">${escapeHtml(d.name)}</option>`).join('');
    const staffOptions = staffList.map(s => `<option value="${escapeHtml(s.name)}" data-dept="${escapeHtml(s.department)}">${escapeHtml(s.name)} (${escapeHtml(s.position)} - ${escapeHtml(s.department)})</option>`).join('');

    const html = `
      <div class="modal-header">
        <div class="modal-header-title">
          <span class="modal-icon-badge">➕</span>
          <div>
            <h3>Báo cáo lỗi rà soát HSBA mới</h3>
            <p class="modal-subtitle">Quyền hạn: <strong class="text-primary">${storage.getRoleDetails().name}</strong> | Bắt buộc 8 trường dưới đây</p>
          </div>
        </div>
        <button class="btn-close-modal" id="btn-modal-close" title="Đóng">&times;</button>
      </div>

      <form id="form-add-error" class="modal-form">
        <div class="form-grid">
          <!-- 1. Mã KCB -->
          <div class="form-group">
            <label class="form-label required">1. Mã KCB (Mã bệnh án):</label>
            <input type="text" id="add-maKCB" class="form-input" placeholder="Ví dụ: BN-2026-08412" required autofocus />
            <div class="field-error" id="err-maKCB"></div>
          </div>

          <!-- 2. Tên Bệnh nhân -->
          <div class="form-group">
            <label class="form-label required">2. Tên Bệnh nhân:</label>
            <input type="text" id="add-tenBenhNhan" class="form-input" placeholder="Ví dụ: Nguyễn Văn An" required />
            <div class="field-error" id="err-tenBenhNhan"></div>
          </div>

          <!-- 3. Khoa/Phòng -->
          <div class="form-group">
            <label class="form-label required">3. Khoa/Phòng điều trị:</label>
            <select id="add-khoaPhong" class="form-select" required>
              <option value="">-- Chọn Khoa/Phòng --</option>
              ${deptOptions}
            </select>
            <div class="field-error" id="err-khoaPhong"></div>
          </div>

          <!-- 4. Người chỉ định/thực hiện -->
          <div class="form-group">
            <label class="form-label">4. Người chỉ định / thực hiện YL:</label>
            <input type="text" id="add-nguoiChiDinh" list="dl-add-staff" class="form-input" placeholder="Gõ tên hoặc chọn bác sĩ từ danh sách..." autocomplete="off" />
            <datalist id="dl-add-staff">
              ${staffOptions}
            </datalist>
            <small class="form-help text-xs text-muted" style="margin-top: 3px;">Gõ trực tiếp tên bác sĩ hoặc chọn nhanh từ danh mục để hệ thống gửi Zalo tự động</small>
          </div>

          <!-- 5. Ngày vào khoa -->
          <div class="form-group">
            <label class="form-label required">5. Ngày vào khoa:</label>
            <input type="date" id="add-ngayVaoKhoa" class="form-input" value="${today}" required />
            <div class="field-error" id="err-ngayVaoKhoa"></div>
          </div>

          <!-- 6. Ngày kiểm hồ sơ -->
          <div class="form-group">
            <label class="form-label required">6. Ngày kiểm hồ sơ:</label>
            <input type="date" id="add-ngayKiemHoSo" class="form-input" value="${today}" required />
            <div class="field-error" id="err-ngayKiemHoSo"></div>
          </div>

          <!-- 7. Thời gian chỉ định/thực hiện YL -->
          <div class="form-group">
            <label class="form-label required">7. Thời gian chỉ định/thực hiện YL:</label>
            <input type="datetime-local" id="add-thoiGianChiDinhYL" class="form-input" value="${nowDateTime}" required />
            <div class="field-error" id="err-thoiGianChiDinhYL"></div>
          </div>

          <!-- 8. Mức độ lỗi -->
          <div class="form-group">
            <label class="form-label required">8. Mức độ lỗi:</label>
            <select id="add-mucDoLoi" class="form-select" required>
              <option value="Nhắc nhở">🟡 Nhắc nhở</option>
              <option value="Yêu cầu kiểm tra">🟣 Yêu cầu kiểm tra</option>
              <option value="Báo động" selected>🚨 Báo động</option>
            </select>
            <div class="field-error" id="err-mucDoLoi"></div>
          </div>
        </div>

        <!-- 9. Diễn giải lỗi -->
        <div class="form-group full-width" style="margin-top: 10px;">
          <label class="form-label required">9. Diễn giải chi tiết lỗi phát hiện:</label>
          <textarea id="add-dienGiaiLoi" class="form-textarea" rows="3" placeholder="Mô tả cụ thể nội dung lỗi: sai liều thuốc, thiếu ký tên, sai thời gian y lệnh, thiếu kết quả xét nghiệm kèm theo..." required></textarea>
          <div class="field-error" id="err-dienGiaiLoi"></div>
        </div>

        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" id="btn-cancel-add">Hủy bỏ</button>
          <button type="submit" class="btn btn-primary" id="btn-submit-add">
            <span>💾 Lưu & Gửi Zalo nhắc nhở</span>
          </button>
        </div>
      </form>
    `;

    this.renderModal(html, 'modal-lg');

    document.getElementById('btn-modal-close').onclick = () => this.closeModal();
    document.getElementById('btn-cancel-add').onclick = () => this.closeModal();

    // Tự động nhận diện và chọn Khoa/Phòng khi gõ hoặc chọn tên bác sĩ
    const inputDoctor = document.getElementById('add-nguoiChiDinh');
    const selectDept = document.getElementById('add-khoaPhong');
    if (inputDoctor && selectDept) {
      inputDoctor.addEventListener('input', (e) => {
        const val = e.target.value.trim().toLowerCase();
        if (!val) return;
        const matched = staffList.find(s => s.name.toLowerCase() === val || (s.name + ' (' + s.position + ')').toLowerCase().includes(val));
        if (matched && matched.department) {
          const opt = Array.from(selectDept.options).find(o => o.value === matched.department);
          if (opt) {
            selectDept.value = matched.department;
          }
        }
      });
    }

    const form = document.getElementById('form-add-error');
    form.onsubmit = (e) => {
      e.preventDefault();
      
      const maKCB = document.getElementById('add-maKCB').value.trim();
      const tenBenhNhan = document.getElementById('add-tenBenhNhan').value.trim();
      const khoaPhong = document.getElementById('add-khoaPhong').value.trim();
      const nguoiChiDinh = document.getElementById('add-nguoiChiDinh').value.trim();
      const ngayVaoKhoa = document.getElementById('add-ngayVaoKhoa').value;
      const ngayKiemHoSo = document.getElementById('add-ngayKiemHoSo').value;
      let thoiGianChiDinhYL = document.getElementById('add-thoiGianChiDinhYL').value;
      const mucDoLoi = document.getElementById('add-mucDoLoi').value;
      const dienGiaiLoi = document.getElementById('add-dienGiaiLoi').value.trim();

      if (thoiGianChiDinhYL && thoiGianChiDinhYL.includes('T')) {
        thoiGianChiDinhYL = thoiGianChiDinhYL.replace('T', ' ');
      }

      let hasError = false;
      const checkRequired = (val, errId, msg) => {
        const errEl = document.getElementById(errId);
        if (!val) {
          errEl.textContent = msg;
          hasError = true;
        } else {
          errEl.textContent = '';
        }
      };

      checkRequired(maKCB, 'err-maKCB', 'Vui lòng nhập Mã KCB!');
      checkRequired(tenBenhNhan, 'err-tenBenhNhan', 'Vui lòng nhập Tên Bệnh nhân!');
      checkRequired(khoaPhong, 'err-khoaPhong', 'Vui lòng chọn Khoa/Phòng!');
      checkRequired(ngayVaoKhoa, 'err-ngayVaoKhoa', 'Vui lòng chọn Ngày vào khoa!');
      checkRequired(ngayKiemHoSo, 'err-ngayKiemHoSo', 'Vui lòng chọn Ngày kiểm hồ sơ!');
      checkRequired(thoiGianChiDinhYL, 'err-thoiGianChiDinhYL', 'Vui lòng nhập Thời gian YL!');
      checkRequired(mucDoLoi, 'err-mucDoLoi', 'Vui lòng chọn Mức độ lỗi!');
      checkRequired(dienGiaiLoi, 'err-dienGiaiLoi', 'Vui lòng nhập Diễn giải lỗi!');

      if (hasError) {
        showToast('Vui lòng điền đủ 8 trường thông tin bắt buộc!', 'error');
        return;
      }

      const newRecord = storage.addRecord({
        maKCB,
        tenBenhNhan,
        khoaPhong,
        nguoiChiDinh,
        ngayVaoKhoa,
        ngayKiemHoSo,
        thoiGianChiDinhYL,
        mucDoLoi,
        mucDoCanhBao: mucDoLoi,
        dienGiaiLoi,
        trangThaiKiemDuyet: mucDoLoi,
        trangThaiLoi: 'CHƯA SỬA',
        yKienNguoiSua: '',
        zaloSentCount: 0,
        lastZaloSentAt: null,
        zaloHistory: []
      });

      if (nguoiChiDinh) {
        const zaloResult = zaloService.sendZaloNotification(newRecord.id, true);
        if (zaloResult.success && zaloResult.target) {
          showToast(`Đã thêm lỗi và gửi tin Zalo cảnh báo tới ${nguoiChiDinh}! Nhắc lại sau mỗi 2 giờ.`, 'success', 5000);
        } else {
          showToast(`Đã thêm lỗi cho bệnh nhân ${tenBenhNhan}.`, 'success');
        }
      } else {
        showToast(`Đã thêm thành công lỗi cho bệnh nhân ${tenBenhNhan} (${maKCB})`, 'success');
      }

      this.closeModal();
      this.app.refreshAllViews();
    };
  }

  // ==========================================
  // 2. MODAL CHI TIẾT & CHỈNH SỬA LỖI HSBA
  // ==========================================
  openEditErrorModal(recordId) {
    const record = storage.getRecords().find(r => r.id === recordId);
    if (!record) {
      showToast('Không tìm thấy thông tin bản ghi!', 'error');
      return;
    }

    const currentRole = storage.getCurrentRole();
    const roleDetails = storage.getRoleDetails();
    const departments = storage.getDepartments();
    const staffList = storage.getStaff();

    const canEditGroup1 = storage.canEditField('maKCB');
    const canEditGroup2 = storage.canEditField('trangThaiLoi');
    const canDelete = storage.canDeleteRecord();

    const deptOptions = departments.map(d => `<option value="${escapeHtml(d.name)}" ${d.name === record.khoaPhong ? 'selected' : ''}>${escapeHtml(d.name)}</option>`).join('');
    const staffOptions = staffList.map(s => `<option value="${escapeHtml(s.name)}" ${s.name === record.nguoiChiDinh ? 'selected' : ''}>${escapeHtml(s.name)} (${escapeHtml(s.position)} - ${escapeHtml(s.department)})</option>`).join('');

    const formattedDateTime = (record.thoiGianChiDinhYL || '').replace(' ', 'T');

    let permissionNotice = '';
    if (currentRole === 'ADMIN') {
      permissionNotice = `<div class="role-alert-banner alert-admin">👑 <strong>Quản trị viên:</strong> Bạn có toàn quyền chỉnh sửa cả Thông tin rà soát và Tiến độ khắc phục lỗi.</div>`;
    } else if (currentRole === 'KETOAN_BH') {
      permissionNotice = `<div class="role-alert-banner alert-ketoan">💵 <strong>Kế toán Bảo hiểm (Kế toán BHYT):</strong> Phụ trách phân công rà soát thông tin lỗi, ấn định <strong>Mức độ lỗi</strong> (Nhắc nhở, Yêu cầu kiểm tra, Báo động).</div>`;
    } else if (currentRole === 'KHTH') {
      permissionNotice = `<div class="role-alert-banner alert-khth">📋 <strong>Kế hoạch Tổng hợp (KHTH):</strong> Được phép kiểm duyệt hồ sơ rà soát lỗi và có <strong>Quyền Chốt Thông Cổng</strong> ra viện.</div>`;
    } else if (currentRole === 'DUOC') {
      permissionNotice = `<div class="role-alert-banner alert-duoc">💊 <strong>Khoa Dược:</strong> Được phép rà soát lỗi liên quan đến thuốc & kháng sinh.</div>`;
    } else if (currentRole === 'IT') {
      permissionNotice = `<div class="role-alert-banner alert-it">💻 <strong>Phòng CNTT (IT):</strong> Kiểm tra dữ liệu HIS, chuẩn hóa XML đồng bộ cổng BHXH.</div>`;
    } else if (currentRole === 'NHOM_1') {
      permissionNotice = `<div class="role-alert-banner alert-nhom1">🔍 <strong>Nhóm 1 (Tổ Rà Soát HSBA):</strong> Được phép chỉnh sửa thông tin rà soát và Mức độ lỗi.</div>`;
    } else {
      permissionNotice = `<div class="role-alert-banner alert-nhom2">👨‍⚕️ <strong>Khoa / Người sửa hồ sơ:</strong> Cập nhật Tiến độ sửa lỗi và Ý kiến giải trình khắc phục. (Mức độ lỗi do Kế toán BHYT / Bộ phận rà soát ấn định).</div>`;
    }

    const html = `
      <div class="modal-header">
        <div class="modal-header-title">
          <span class="modal-icon-badge">📝</span>
          <div>
            <h3>Chi tiết & Cập nhật lỗi HSBA</h3>
            <p class="modal-subtitle">Vai trò hiện tại: <strong class="text-primary">${roleDetails.name}</strong> | Mã: <strong>${escapeHtml(record.id)}</strong></p>
          </div>
        </div>
        <button class="btn-close-modal" id="btn-modal-close" title="Đóng">&times;</button>
      </div>

      <form id="form-edit-error" class="modal-form">
        ${permissionNotice}

        <!-- PHẦN 1: THÔNG TIN RÀ SOÁT LỖI (QUYỀN KẾ TOÁN BHYT / TỔ RÀ SOÁT / KHTH / ADMIN) -->
        <div class="permission-section-box ${canEditGroup1 ? 'sec-editable' : 'sec-readonly'}">
          <div class="sec-title-bar">
            <span class="sec-title">📌 THÔNG TIN RÀ SOÁT LỖI (Phân công Kế toán BHYT / Bộ phận rà soát)</span>
            ${canEditGroup1 ? '<span class="badge-perm-allow">✓ Bạn được phép sửa</span>' : '<span class="badge-perm-lock">🔒 Khóa (Chỉ Kế toán BHYT / Tổ Rà Soát / KHTH sửa)</span>'}
          </div>

          <div class="form-grid">
            <div class="form-group">
              <label class="form-label required">Mã KCB (Mã Bệnh án):</label>
              <input type="text" id="edit-maKCB" class="form-input" value="${escapeHtml(record.maKCB)}" ${!canEditGroup1 ? 'readonly' : 'required'} />
            </div>

            <div class="form-group">
              <label class="form-label required">Tên Bệnh nhân:</label>
              <input type="text" id="edit-tenBenhNhan" class="form-input" value="${escapeHtml(record.tenBenhNhan)}" ${!canEditGroup1 ? 'readonly' : 'required'} />
            </div>

            <div class="form-group">
              <label class="form-label required">Khoa/Phòng:</label>
              ${canEditGroup1 ? `
                <select id="edit-khoaPhong" class="form-select" required>
                  ${deptOptions}
                </select>
              ` : `
                <input type="text" id="edit-khoaPhong" class="form-input" value="${escapeHtml(record.khoaPhong)}" readonly />
              `}
            </div>

            <div class="form-group">
              <label class="form-label">Người chỉ định / thực hiện:</label>
              ${canEditGroup1 ? `
                <input type="text" id="edit-nguoiChiDinh" list="dl-edit-staff" class="form-input" value="${escapeHtml(record.nguoiChiDinh || '')}" placeholder="Gõ tên hoặc chọn bác sĩ từ danh sách..." autocomplete="off" />
                <datalist id="dl-edit-staff">
                  ${staffOptions}
                </datalist>
                <small class="form-help text-xs text-muted" style="margin-top: 3px;">Có thể gõ trực tiếp tên bác sĩ hoặc chọn nhanh từ danh mục</small>
              ` : `
                <input type="text" id="edit-nguoiChiDinh" class="form-input" value="${escapeHtml(record.nguoiChiDinh || '---')}" readonly />
              `}
            </div>

            <div class="form-group">
              <label class="form-label required">Ngày vào khoa:</label>
              <input type="date" id="edit-ngayVaoKhoa" class="form-input" value="${escapeHtml(record.ngayVaoKhoa)}" ${!canEditGroup1 ? 'readonly' : 'required'} />
            </div>

            <div class="form-group">
              <label class="form-label required">Ngày kiểm hồ sơ:</label>
              <input type="date" id="edit-ngayKiemHoSo" class="form-input" value="${escapeHtml(record.ngayKiemHoSo)}" ${!canEditGroup1 ? 'readonly' : 'required'} />
            </div>

            <div class="form-group">
              <label class="form-label required">Thời gian ra / thực hiện YL:</label>
              <input type="datetime-local" id="edit-thoiGianChiDinhYL" class="form-input" value="${escapeHtml(formattedDateTime)}" ${!canEditGroup1 ? 'readonly' : 'required'} />
            </div>

            <!-- MỨC ĐỘ LỖI THUỘC THÔNG TIN RÀ SOÁT LỖI -->
            <div class="form-group">
              <label class="form-label required font-bold text-primary">Mức độ lỗi:</label>
              ${canEditGroup1 ? `
                <select id="edit-mucDoLoi" class="form-select highlight-select" required>
                  <option value="Nhắc nhở" ${(record.mucDoLoi || record.mucDoCanhBao) === 'Nhắc nhở' ? 'selected' : ''}>🟡 Nhắc nhở</option>
                  <option value="Yêu cầu kiểm tra" ${(record.mucDoLoi || record.mucDoCanhBao) === 'Yêu cầu kiểm tra' || record.mucDoCanhBao === 'Cao (Nghiêm trọng)' ? 'selected' : ''}>🟣 Yêu cầu kiểm tra</option>
                  <option value="Báo động" ${(record.mucDoLoi || record.mucDoCanhBao) === 'Báo động' || record.mucDoCanhBao === 'Khẩn cấp' ? 'selected' : ''}>🚨 Báo động</option>
                </select>
              ` : `
                <input type="text" id="edit-mucDoLoi" class="form-input" value="${escapeHtml(record.mucDoLoi || record.mucDoCanhBao || 'Nhắc nhở')}" readonly />
              `}
              <small class="form-help text-xs text-muted" style="margin-top: 3px;">Do Kế toán BHYT / Bộ phận rà soát ấn định</small>
            </div>
          </div>

          <div class="form-group full-width" style="margin-top: 10px;">
            <label class="form-label required">Diễn giải lỗi phát hiện:</label>
            <textarea id="edit-dienGiaiLoi" class="form-textarea" rows="3" ${!canEditGroup1 ? 'readonly' : 'required'}>${escapeHtml(record.dienGiaiLoi)}</textarea>
          </div>
        </div>

        <!-- PHẦN 2: TIẾN ĐỘ KHẮC PHỤC & Ý KIẾN KHOA PHÒNG (DÀNH CHO NGƯỜI SỬA HỒ SƠ) -->
        <div class="permission-section-box ${canEditGroup2 ? 'sec-editable' : 'sec-readonly'}" style="margin-top: 12px;">
          <div class="sec-title-bar">
            <span class="sec-title">🛠️ TIẾN ĐỘ KHẮC PHỤC & Ý KIẾN KHOA PHÒNG</span>
            ${canEditGroup2 ? '<span class="badge-perm-allow">✓ Dành cho Người sửa / Khoa phòng</span>' : '<span class="badge-perm-lock">🔒 Khóa</span>'}
          </div>

          <div class="form-group">
            <label class="form-label font-bold text-primary required">Tiến độ sửa lỗi:</label>
            ${canEditGroup2 ? `
              <select id="edit-trangThaiLoi" class="form-select highlight-select" required>
                <option value="CHƯA SỬA" ${record.trangThaiLoi === 'CHƯA SỬA' ? 'selected' : ''}>🔴 CHƯA SỬA</option>
                <option value="ĐÃ XEM - ĐANG SỬA" ${record.trangThaiLoi === 'ĐÃ XEM - ĐANG SỬA' ? 'selected' : ''}>🟠 ĐÃ XEM - ĐANG SỬA</option>
                <option value="ĐÃ XONG" ${record.trangThaiLoi === 'ĐÃ XONG' ? 'selected' : ''}>🟢 ĐÃ XONG (Dừng gửi tin Zalo)</option>
                <option value="HỦY CHUYỂN VIỆN" ${record.trangThaiLoi === 'HỦY CHUYỂN VIỆN' ? 'selected' : ''}>⚪ HỦY CHUYỂN VIỆN</option>
                <option value="KHÁC" ${record.trangThaiLoi === 'KHÁC' ? 'selected' : ''}>⚙️ KHÁC</option>
              </select>
            ` : `
              <input type="text" id="edit-trangThaiLoi" class="form-input" value="${escapeHtml(record.trangThaiLoi)}" readonly />
            `}
          </div>

          <div class="form-group full-width" style="margin-top: 10px;">
            <label class="form-label font-bold">Ý kiến / Giải trình của người sửa lỗi:</label>
            <textarea id="edit-yKienNguoiSua" class="form-textarea" rows="2" placeholder="Ghi chú nội dung đã khắc phục, giải trình lý do..." ${!canEditGroup2 ? 'readonly' : ''}>${escapeHtml(record.yKienNguoiSua || '')}</textarea>
          </div>
        </div>

        <div class="modal-footer modal-footer-space-between">
          <div class="footer-actions-left">
            ${canDelete ? `
              <button type="button" class="btn btn-danger-outline" id="btn-delete-record">
                <span>🗑️ Xóa bản ghi</span>
              </button>
            ` : ''}
            <button type="button" class="btn btn-outline" id="btn-print-record">
              <span>🖨️ In phiếu</span>
            </button>
          </div>
          <div class="footer-actions-right">
            <button type="button" class="btn btn-secondary" id="btn-cancel-edit">Đóng</button>
            <button type="submit" class="btn btn-primary">
              <span>💾 Lưu thay đổi</span>
            </button>
          </div>
        </div>
      </form>
    `;

    this.renderModal(html, 'modal-lg');

    document.getElementById('btn-modal-close').onclick = () => this.closeModal();
    document.getElementById('btn-cancel-edit').onclick = () => this.closeModal();
    
    document.getElementById('btn-print-record').onclick = () => {
      printRecordSheet(record);
    };

    const btnDelete = document.getElementById('btn-delete-record');
    if (btnDelete) {
      btnDelete.onclick = () => {
        this.openConfirmModal({
          title: 'Xác nhận xóa bản ghi rà soát',
          message: `Bạn có chắc chắn muốn xóa bản ghi lỗi của bệnh nhân <strong>${escapeHtml(record.tenBenhNhan)} (${escapeHtml(record.maKCB)})</strong>?`,
          isDanger: true,
          confirmText: 'Xóa vĩnh viễn',
          onConfirm: () => {
            storage.deleteRecord(record.id);
            showToast('Đã xóa bản ghi thành công!', 'success');
            this.closeModal();
            this.app.refreshAllViews();
          }
        });
      };
    }

    const form = document.getElementById('form-edit-error');
    form.onsubmit = (e) => {
      e.preventDefault();

      const updates = {};

      if (canEditGroup1) {
        let thoiGianYL = document.getElementById('edit-thoiGianChiDinhYL').value;
        if (thoiGianYL && thoiGianYL.includes('T')) {
          thoiGianYL = thoiGianYL.replace('T', ' ');
        }
        updates.maKCB = document.getElementById('edit-maKCB').value.trim();
        updates.tenBenhNhan = document.getElementById('edit-tenBenhNhan').value.trim();
        updates.khoaPhong = document.getElementById('edit-khoaPhong').value.trim();
        updates.nguoiChiDinh = document.getElementById('edit-nguoiChiDinh').value.trim();
        updates.ngayVaoKhoa = document.getElementById('edit-ngayVaoKhoa').value;
        updates.ngayKiemHoSo = document.getElementById('edit-ngayKiemHoSo').value;
        updates.thoiGianChiDinhYL = thoiGianYL;
        const mucDoVal = document.getElementById('edit-mucDoLoi') ? document.getElementById('edit-mucDoLoi').value : (record.mucDoLoi || 'Nhắc nhở');
        updates.mucDoLoi = mucDoVal;
        updates.mucDoCanhBao = mucDoVal;
        updates.trangThaiKiemDuyet = mucDoVal;
        updates.dienGiaiLoi = document.getElementById('edit-dienGiaiLoi').value.trim();
      }

      if (canEditGroup2) {
        const newTrangThaiLoi = document.getElementById('edit-trangThaiLoi').value;
        updates.trangThaiLoi = newTrangThaiLoi;
        updates.yKienNguoiSua = document.getElementById('edit-yKienNguoiSua').value.trim();
      }

      storage.updateRecord(record.id, updates);
      showToast('Đã cập nhật thông tin lỗi HSBA!', 'success');
      this.closeModal();
      this.app.refreshAllViews();
    };
  }

  // =========================================================================
  // 3. MODAL THÊM BÁO CÁO RA VIỆN HÀNG NGÀY (CÁC KHOA/PHÒNG BÁO CÁO RA VIỆN)
  // ==========================================
  openAddDischargeReportModal() {
    const departments = storage.getDepartments();
    const staffList = storage.getStaff();
    const today = getTodayDateString();
    const activeDept = storage.getActiveDepartment();

    const deptOptions = departments.map(d => `<option value="${escapeHtml(d.name)}" ${d.name === activeDept ? 'selected' : ''}>${escapeHtml(d.name)}</option>`).join('');
    const doctorOptions = staffList.map(s => `<option value="${escapeHtml(s.name)}">${escapeHtml(s.name)} (${escapeHtml(s.position)} - ${escapeHtml(s.department)})</option>`).join('');

    const html = `
      <div class="modal-header">
        <div class="modal-header-title">
          <span class="modal-icon-badge">📋</span>
          <div>
            <h3>Báo cáo danh sách ra viện hàng ngày</h3>
            <p class="modal-subtitle">Khoa/Phòng lập danh sách bệnh nhân chuẩn bị ra viện để các bộ phận kiểm lỗi</p>
          </div>
        </div>
        <button class="btn-close-modal" id="btn-modal-close" title="Đóng">&times;</button>
      </div>

      <form id="form-add-discharge-report" class="modal-form">
        <div class="form-grid">
          <!-- 1. Ngày báo cáo -->
          <div class="form-group">
            <label class="form-label required">1. Ngày báo cáo:</label>
            <input type="date" id="rep-ngayBaoCao" class="form-input" value="${today}" required />
          </div>

          <!-- 2. Mã KCB -->
          <div class="form-group">
            <label class="form-label required">2. Mã KCB (Mã Bệnh án):</label>
            <input type="text" id="rep-maKCB" class="form-input" placeholder="Ví dụ: BN-2026-08412" required autofocus />
          </div>

          <!-- 3. Tên BN -->
          <div class="form-group">
            <label class="form-label required">3. Tên Bệnh nhân:</label>
            <input type="text" id="rep-tenBenhNhan" class="form-input" placeholder="Ví dụ: Hoàng Thị Lan" required />
          </div>

          <!-- 4. Khoa/Phòng -->
          <div class="form-group">
            <label class="form-label required">4. Khoa/Phòng:</label>
            <select id="rep-phong" class="form-select" required>
              <option value="">-- Chọn Khoa/Phòng --</option>
              ${deptOptions}
            </select>
          </div>

          <!-- 5. Bác sĩ điều trị -->
          <div class="form-group">
            <label class="form-label required">5. Bác sĩ điều trị:</label>
            <input type="text" id="rep-tenBacSi" list="dl-rep-staff" class="form-input" placeholder="Gõ tên hoặc chọn bác sĩ..." autocomplete="off" required />
            <datalist id="dl-rep-staff">
              ${doctorOptions}
            </datalist>
          </div>

          <!-- 6. Người báo cáo -->
          <div class="form-group">
            <label class="form-label">6. Người báo cáo:</label>
            <input type="text" id="rep-nguoiBaoCao" class="form-input" value="${escapeHtml(storage.getCurrentUser() ? storage.getCurrentUser().name : '')}" />
          </div>
        </div>

        <div class="modal-footer" style="margin-top: 16px;">
          <button type="button" class="btn btn-secondary" id="btn-cancel-rep">Hủy bỏ</button>
          <button type="submit" class="btn btn-primary">
            <span>💾 Lưu báo cáo ra viện</span>
          </button>
        </div>
      </form>
    `;

    this.renderModal(html, 'modal-md');

    document.getElementById('btn-modal-close').onclick = () => this.closeModal();
    document.getElementById('btn-cancel-rep').onclick = () => this.closeModal();

    const form = document.getElementById('form-add-discharge-report');
    form.onsubmit = (e) => {
      e.preventDefault();
      const ngayBaoCao = document.getElementById('rep-ngayBaoCao').value;
      const maKCB = document.getElementById('rep-maKCB').value.trim();
      const tenBenhNhan = document.getElementById('rep-tenBenhNhan').value.trim();
      const phong = document.getElementById('rep-phong').value.trim();
      const tenBacSi = document.getElementById('rep-tenBacSi').value.trim();
      const nguoiBaoCao = document.getElementById('rep-nguoiBaoCao').value.trim();

      if (!maKCB || !tenBenhNhan || !phong || !tenBacSi) {
        showToast('Vui lòng điền đầy đủ các thông tin bắt buộc!', 'error');
        return;
      }

      storage.addDischargeReport({
        ngayBaoCao,
        maKCB,
        tenBenhNhan,
        phong,
        tenBacSi,
        nguoiBaoCao
      });

      showToast(`Đã thêm bệnh nhân ${tenBenhNhan} (${maKCB}) vào danh sách ra viện!`, 'success');
      this.closeModal();
      this.app.refreshAllViews();
    };
  }

  // =========================================================================
  // 4. MODAL KIỂM LỖI NHANH TRỰC TIẾP TỪNG KHÂU (PHÂN QUYỀN CHẶT CHẼ)
  // - Khâu Dược: Chỉ Khoa Dược & Admin
  // - Khâu Kế toán BH: Chỉ Kế toán BHYT & Admin
  // - Khâu KHTH: Chỉ Kế hoạch Tổng hợp & Admin
  // - Khâu IT: Chỉ Phòng CNTT & Admin
  // =========================================================================
  openQuickStepCheckModal(reportId, stepKey) {
    const report = storage.getDischargeReports().find(r => r.id === reportId);
    if (!report) {
      showToast('Không tìm thấy thông tin báo cáo ra viện!', 'error');
      return;
    }

    const currentRole = storage.getCurrentRole();
    const roleDetails = storage.getRoleDetails();
    const canCheck = storage.canCheckDischargeStep(stepKey);

    const stepMeta = {
      duoc: { key: 'kiemDuoc', label: 'Dược', title: 'Khâu Dược (Thuốc, VTYT, Kháng sinh)', deptName: 'Khoa Dược', icon: '💊' },
      ketoan: { key: 'kiemKeToanBH', label: 'Kế toán bảo hiểm', title: 'Khâu Kế toán Bảo hiểm (Mức hưởng, Viện phí, BHYT)', deptName: 'Kế toán BHYT', icon: '💵' },
      khth: { key: 'kiemKHTH', label: 'Kế hoạch tổng hợp', title: 'Khâu Kế hoạch Tổng hợp (Hồ sơ, Chữ ký, Biên bản)', deptName: 'Phòng KHTH', icon: '📋' },
      it: { key: 'kiemIT', label: 'IT', title: 'Khâu IT (Dữ liệu HIS, Đồng bộ XML)', deptName: 'Phòng CNTT', icon: '💻' }
    };

    const currentStep = stepMeta[stepKey] || stepMeta.duoc;
    const currentStepData = report[currentStep.key] || { status: 'CO_LOI', note: '' };
    const isError = currentStepData.status === 'CO_LOI';

    const permNoticeHtml = canCheck
      ? `<div class="role-alert-banner alert-admin" style="margin-bottom: 12px;">✓ Bạn có quyền kiểm duyệt & cập nhật kết quả <strong>${currentStep.title}</strong></div>`
      : `<div class="role-alert-banner alert-nhom2" style="margin-bottom: 12px;">🔒 <strong>Chế độ chỉ xem:</strong> Bạn đang ở vai trò <em>${roleDetails.name}</em>. Chỉ nhân sự thuộc <strong>${currentStep.deptName}</strong> hoặc <strong>Admin</strong> mới được phép duyệt khâu này.</div>`;

    const html = `
      <div class="modal-header">
        <div class="modal-header-title">
          <span class="modal-icon-badge">${currentStep.icon}</span>
          <div>
            <h3>Kiểm Lỗi ${currentStep.title}</h3>
            <p class="modal-subtitle">BN: <strong>${escapeHtml(report.tenBenhNhan)}</strong> (${escapeHtml(report.maKCB)}) - Khoa: <strong>${escapeHtml(report.phong)}</strong></p>
          </div>
        </div>
        <button class="btn-close-modal" id="btn-modal-close">&times;</button>
      </div>

      <form id="form-quick-step-check" class="modal-form">
        ${permNoticeHtml}

        <!-- Lựa chọn trạng thái khâu -->
        <div class="form-group">
          <label class="form-label font-bold text-primary">1. Kết quả kiểm duyệt:</label>
          <div style="display: flex; gap: 1.25rem; margin-top: 4px; padding: 8px 12px; background: ${canCheck ? '#f8fafc' : '#f1f5f9'}; border-radius: 6px; border: 1px solid var(--border-color);">
            <label class="radio-label" style="font-size: 0.95rem;">
              <input type="radio" name="quick_step_status" value="KHONG_LOI" ${!isError ? 'checked' : ''} ${!canCheck ? 'disabled' : ''} />
              <span class="text-success font-bold">🟢 Đã kiểm, không lỗi</span>
            </label>
            <label class="radio-label" style="font-size: 0.95rem;">
              <input type="radio" name="quick_step_status" value="CO_LOI" ${isError ? 'checked' : ''} ${!canCheck ? 'disabled' : ''} />
              <span class="text-danger font-bold">🔴 Có lỗi</span>
            </label>
          </div>
        </div>

        <!-- Textarea ghi chú lỗi (Có thể Enter xuống dòng viết nhiều ý) -->
        <div class="form-group full-width" style="margin-top: 12px;">
          <label class="form-label font-bold">2. Ghi chú chi tiết nội dung sai sót:</label>
          <textarea id="quick_step_note" class="form-textarea" rows="4" placeholder="${canCheck ? 'Nhập chi tiết các lỗi phát hiện tại khâu này (bấm Enter để xuống dòng viết tiếp nhiều ý)...' : 'Chưa có ghi chú sai sót'}" ${!canCheck ? 'readonly' : ''} style="line-height: 1.6; font-size: 0.88rem;">${escapeHtml(currentStepData.note || '')}</textarea>
          ${canCheck ? '<small class="form-help">💡 Bạn có thể bấm Enter để xuống dòng liệt kê từng lỗi cụ thể.</small>' : ''}
        </div>

        <div class="modal-footer" style="margin-top: 16px;">
          <button type="button" class="btn btn-secondary" id="btn-quick-step-cancel">${canCheck ? 'Hủy bỏ' : 'Đóng'}</button>
          ${canCheck ? `
            <button type="submit" class="btn btn-primary">
              <span>💾 Lưu kết quả khâu ${currentStep.label}</span>
            </button>
          ` : ''}
        </div>
      </form>
    `;

    this.renderModal(html, 'modal-md');

    document.getElementById('btn-modal-close').onclick = () => this.closeModal();
    document.getElementById('btn-quick-step-cancel').onclick = () => this.closeModal();

    if (canCheck) {
      const radCoLoi = document.querySelector('input[name="quick_step_status"][value="CO_LOI"]');
      const txtNote = document.getElementById('quick_step_note');
      if (radCoLoi && txtNote) {
        radCoLoi.onchange = () => {
          if (radCoLoi.checked) txtNote.focus();
        };
      }

      const form = document.getElementById('form-quick-step-check');
      form.onsubmit = (e) => {
        e.preventDefault();
        const statusRad = form.querySelector('input[name="quick_step_status"]:checked');
        const status = statusRad ? statusRad.value : 'CO_LOI';
        const note = txtNote ? txtNote.value.trim() : '';

        const updates = {};
        updates[currentStep.key] = { status, note };

        storage.updateDischargeReport(report.id, updates);
        showToast(`Đã cập nhật kết quả kiểm lỗi khâu ${currentStep.label}!`, 'success');
        this.closeModal();
        this.app.renderDischargeView();
      };
    }
  }

  // =========================================================================
  // 5. MODAL TOÀN DIỆN KIỂM LỖI 4 KHÂU & CHỐT THÔNG CỔNG
  // ==========================================
  openEditDischargeReportModal(reportId) {
    const report = storage.getDischargeReports().find(r => r.id === reportId);
    if (!report) {
      showToast('Không tìm thấy thông tin báo cáo ra viện!', 'error');
      return;
    }

    const currentRole = storage.getCurrentRole();
    const canChotThongCong = storage.canChotThongCong();
    const canDelete = storage.canDeleteRecord();

    const renderCheckStep = (key, label, icon, deptName, checkData) => {
      const isError = checkData.status === 'CO_LOI';
      const canCheckStep = storage.canCheckDischargeStep(key);

      return `
        <div class="check-step-card ${isError ? 'step-has-error' : 'step-passed'} ${!canCheckStep ? 'step-locked-box' : ''}">
          <div class="check-step-header">
            <div class="check-step-title">
              <span>${icon}</span>
              <strong>${label}</strong>
              ${canCheckStep ? '<span class="badge-perm-allow" style="margin-left: 6px;">✓ Quyền của bạn</span>' : `<span class="badge-perm-lock" style="margin-left: 6px;">🔒 Chỉ ${deptName} duyệt</span>`}
            </div>
            <div class="check-step-radios">
              <label class="radio-label">
                <input type="radio" name="step_${key}" value="KHONG_LOI" ${!isError ? 'checked' : ''} ${!canCheckStep ? 'disabled' : ''} onchange="window.toggleCheckNote('${key}', false)" />
                <span class="text-success font-bold">✓ Không lỗi</span>
              </label>
              <label class="radio-label">
                <input type="radio" name="step_${key}" value="CO_LOI" ${isError ? 'checked' : ''} ${!canCheckStep ? 'disabled' : ''} onchange="window.toggleCheckNote('${key}', true)" />
                <span class="text-danger font-bold">⚠️ Có lỗi</span>
              </label>
            </div>
          </div>
          <div class="check-step-note-box" id="box_note_${key}" style="display: ${isError || canCheckStep ? 'block' : 'none'}; margin-top: 6px;">
            <textarea id="note_${key}" class="form-textarea text-xs" rows="2" placeholder="${canCheckStep ? 'Ghi chú cụ thể nội dung lỗi (bấm Enter để xuống dòng)...' : 'Chưa có ghi chú'}" ${!canCheckStep ? 'readonly' : ''}>${escapeHtml(checkData.note || '')}</textarea>
          </div>
        </div>
      `;
    };

    window.toggleCheckNote = (key, show) => {
      const box = document.getElementById(`box_note_${key}`);
      if (box) box.style.display = show ? 'block' : 'none';
    };

    const html = `
      <div class="modal-header">
        <div class="modal-header-title">
          <span class="modal-icon-badge">🔒</span>
          <div>
            <h3>Kiểm Lỗi 4 Khâu & Chốt Thông Cổng</h3>
            <p class="modal-subtitle">BN: <strong>${escapeHtml(report.tenBenhNhan)}</strong> (Mã: <strong>${escapeHtml(report.maKCB)}</strong>) - Khoa: <strong>${escapeHtml(report.phong)}</strong></p>
          </div>
        </div>
        <button class="btn-close-modal" id="btn-modal-close">&times;</button>
      </div>

      <form id="form-edit-discharge-report" class="modal-form">
        <!-- Thông tin cơ bản -->
        <div class="quick-info-pill">
          <div>📅 Ngày báo cáo: <strong>${formatDateVN(report.ngayBaoCao)}</strong> | 👨‍⚕️ Bác sĩ: <strong>${escapeHtml(report.tenBacSi)}</strong> | 🏥 Phòng/Khoa: <strong>${escapeHtml(report.phong)}</strong></div>
        </div>

        <!-- 4 Khâu Kiểm Lỗi -->
        <div style="margin: 14px 0 6px 0;">
          <label class="form-label font-bold text-primary">🔍 KẾT QUẢ KIỂM LỖI 4 KHÂU CHUYÊN MÔN (PHÂN QUYỀN TỪNG BỘ PHẬN):</label>
        </div>

        <div class="check-steps-container">
          <!-- 1. Dược -->
          ${renderCheckStep('duoc', 'Dược (Thuốc, VTYT, Kháng sinh)', '💊', 'Khoa Dược', report.kiemDuoc || { status: 'CO_LOI', note: '' })}

          <!-- 2. Kế toán bảo hiểm -->
          ${renderCheckStep('ketoan', 'Kế toán bảo hiểm (Mức hưởng, Viện phí, BHYT)', '💵', 'Kế toán BH', report.kiemKeToanBH || { status: 'CO_LOI', note: '' })}

          <!-- 3. Kế hoạch tổng hợp -->
          ${renderCheckStep('khth', 'Kế hoạch tổng hợp (Hồ sơ, Ký tên, Biên bản)', '📋', 'Phòng KHTH', report.kiemKHTH || { status: 'CO_LOI', note: '' })}

          <!-- 4. IT -->
          ${renderCheckStep('it', 'IT (Dữ liệu HIS, Đồng bộ XML)', '💻', 'Phòng CNTT', report.kiemIT || { status: 'CO_LOI', note: '' })}
        </div>

        <!-- Báo cáo tình trạng sửa lỗi -->
        <div class="form-group full-width" style="margin-top: 12px;">
          <label class="form-label font-bold">📝 Báo cáo tình trạng sửa lỗi (Khoa phòng / Bác sĩ cập nhật):</label>
          <textarea id="edit-baoCaoTinhTrangSuaLoi" class="form-textarea" rows="2" placeholder="Ghi chú nội dung khoa phòng đã khắc phục, giải trình các lỗi do các khâu phát hiện...">${escapeHtml(report.baoCaoTinhTrangSuaLoi || '')}</textarea>
        </div>

        <!-- Chốt thông cổng (Phân quyền độc quyền KHTH) -->
        <div class="gate-pass-box ${canChotThongCong ? 'gate-editable' : 'gate-readonly'}" style="margin-top: 14px;">
          <div class="gate-header">
            <div style="display: flex; align-items: center; gap: 6px;">
              <span style="font-size: 1.2rem;">🚪</span>
              <strong style="font-size: 0.95rem;">CHỐT THÔNG CỔNG BHYT / RA VIỆN:</strong>
            </div>
            ${canChotThongCong 
              ? '<span class="badge-perm-allow">✓ Quyền KHTH: Được phép chốt</span>' 
              : '<span class="badge-perm-lock">🔒 Khóa: Độc quyền nhân viên KHTH / Admin</span>'}
          </div>

          <div style="margin-top: 8px;">
            ${canChotThongCong ? `
              <div style="display: flex; gap: 1rem; align-items: center;">
                <label class="radio-label" style="font-size: 0.95rem;">
                  <input type="radio" name="rep_chotThongCong" value="CO" ${report.chotThongCong === 'CO' ? 'checked' : ''} />
                  <span class="text-success font-bold">🟢 ĐỒNG Ý THÔNG CỔNG</span>
                </label>
                <label class="radio-label" style="font-size: 0.95rem;">
                  <input type="radio" name="rep_chotThongCong" value="CHUA" ${report.chotThongCong !== 'CO' ? 'checked' : ''} />
                  <span class="text-danger font-bold">🔴 CHƯA ĐỒNG Ý THÔNG CỔNG</span>
                </label>
              </div>
            ` : `
              <div style="font-size: 0.9rem;">
                Trạng thái hiện tại: <strong>${report.chotThongCong === 'CO' ? '<span class="text-success font-bold">🟢 ĐỒNG Ý THÔNG CỔNG</span>' : '<span class="text-danger font-bold">🔴 CHƯA ĐỒNG Ý THÔNG CỔNG</span>'}</strong>
                <p class="text-muted text-xs" style="margin-top: 3px;">(Chỉ nhân viên Kế hoạch Tổng hợp hoặc Admin mới có quyền chốt thông cổng).</p>
              </div>
            `}
          </div>
        </div>

        <div class="modal-footer modal-footer-space-between" style="margin-top: 16px;">
          <div class="footer-actions-left">
            ${canDelete ? `
              <button type="button" class="btn btn-danger-outline" id="btn-delete-discharge-report">
                <span>🗑️ Xóa báo cáo</span>
              </button>
            ` : ''}
          </div>
          <div class="footer-actions-right">
            <button type="button" class="btn btn-secondary" id="btn-cancel-edit-rep">Đóng</button>
            <button type="submit" class="btn btn-primary">
              <span>💾 Lưu cập nhật</span>
            </button>
          </div>
        </div>
      </form>
    `;

    this.renderModal(html, 'modal-lg');

    document.getElementById('btn-modal-close').onclick = () => this.closeModal();
    document.getElementById('btn-cancel-edit-rep').onclick = () => this.closeModal();

    const btnDelete = document.getElementById('btn-delete-discharge-report');
    if (btnDelete) {
      btnDelete.onclick = () => {
        this.openConfirmModal({
          title: 'Xác nhận xóa báo cáo ra viện',
          message: `Bạn có chắc muốn xóa báo cáo ra viện của bệnh nhân <strong>${escapeHtml(report.tenBenhNhan)}</strong>?`,
          isDanger: true,
          confirmText: 'Xóa ngay',
          onConfirm: () => {
            storage.deleteDischargeReport(report.id);
            showToast('Đã xóa báo cáo ra viện!', 'success');
            this.closeModal();
            this.app.renderDischargeView();
          }
        });
      };
    }

    const form = document.getElementById('form-edit-discharge-report');
    form.onsubmit = (e) => {
      e.preventDefault();

      const getStepData = (key, defaultData) => {
        if (!storage.canCheckDischargeStep(key)) {
          return defaultData; // Giữ nguyên dữ liệu cũ nếu không có quyền sửa khâu này
        }
        const rad = form.querySelector(`input[name="step_${key}"]:checked`);
        const status = rad ? rad.value : (defaultData.status || 'CO_LOI');
        const note = document.getElementById(`note_${key}`) ? document.getElementById(`note_${key}`).value.trim() : (defaultData.note || '');
        return { status, note };
      };

      const updates = {
        kiemDuoc: getStepData('duoc', report.kiemDuoc || { status: 'CO_LOI', note: '' }),
        kiemKeToanBH: getStepData('ketoan', report.kiemKeToanBH || { status: 'CO_LOI', note: '' }),
        kiemKHTH: getStepData('khth', report.kiemKHTH || { status: 'CO_LOI', note: '' }),
        kiemIT: getStepData('it', report.kiemIT || { status: 'CO_LOI', note: '' }),
        baoCaoTinhTrangSuaLoi: document.getElementById('edit-baoCaoTinhTrangSuaLoi').value.trim()
      };

      if (canChotThongCong) {
        const radGate = form.querySelector('input[name="rep_chotThongCong"]:checked');
        const newGateStatus = radGate ? radGate.value : 'CHUA';
        updates.chotThongCong = newGateStatus;
        if (newGateStatus === 'CO') {
          updates.ngayThongCong = new Date().toISOString().replace('T', ' ').substring(0, 16);
          updates.nguoiThongCong = storage.getRoleDetails().name;
        } else {
          updates.ngayThongCong = null;
          updates.nguoiThongCong = null;
        }
      }

      storage.updateDischargeReport(report.id, updates);
      showToast('Đã lưu kết quả kiểm lỗi và cập nhật hồ sơ!', 'success');
      this.closeModal();
      this.app.renderDischargeView();
    };
  }

  // ==========================================
  // 6. CÁC MODAL KHÁC (ZALO, DEPT, STAFF, QUICK STATUS, CONFIRM)
  // ==========================================
  openZaloMessageModal(recordId) {
    const record = storage.getRecords().find(r => r.id === recordId);
    if (!record) return;

    const staffList = storage.getStaff();
    const staff = staffList.find(s => s.name === record.nguoiChiDinh);
    const target = zaloService.getRecipientTarget(record);
    const chatUrl = zaloService.getZaloChatUrl(target);
    const message = zaloService.generateZaloMessage(record, staff);

    const html = `
      <div class="modal-header">
        <div class="modal-header-title">
          <span class="modal-icon-badge" style="color: #0068FF;">💬</span>
          <div>
            <h3>Nhắn tin Zalo cảnh báo & Nhắc nhở lỗi</h3>
            <p class="modal-subtitle">Gửi cho: <strong>${escapeHtml(record.nguoiChiDinh || '---')}</strong> (${escapeHtml(target.label)})</p>
          </div>
        </div>
        <button class="btn-close-modal" id="btn-modal-close">&times;</button>
      </div>

      <div class="modal-form">
        <div class="zalo-chat-bubble">
          <div class="zalo-bubble-header">
            <span>💬 ZALO BỆNH VIỆN - RÀ SOÁT HSBA</span>
            <span>Vừa xong</span>
          </div>
          <div class="zalo-bubble-body">${escapeHtml(message).replace(/\n/g, '<br>')}</div>
        </div>

        <div class="modal-footer" style="margin-top: 16px;">
          <button type="button" class="btn btn-secondary" id="btn-zalo-close">Đóng</button>
          <button type="button" class="btn btn-outline" id="btn-copy-zalo">📋 Sao chép tin</button>
          ${chatUrl ? `<a href="${chatUrl}" target="_blank" class="btn btn-zalo">💬 Mở Chat Zalo</a>` : ''}
          <button type="button" class="btn btn-primary" id="btn-send-zalo-now">📨 Gửi nhắc Zalo</button>
        </div>
      </div>
    `;

    this.renderModal(html, 'modal-md');
    document.getElementById('btn-modal-close').onclick = () => this.closeModal();
    document.getElementById('btn-zalo-close').onclick = () => this.closeModal();

    const btnCopy = document.getElementById('btn-copy-zalo');
    if (btnCopy) {
      btnCopy.onclick = () => {
        navigator.clipboard.writeText(message).then(() => {
          showToast('Đã sao chép nội dung tin nhắn Zalo!', 'success');
        });
      };
    }

    const btnSendNow = document.getElementById('btn-send-zalo-now');
    if (btnSendNow) {
      btnSendNow.onclick = () => {
        const result = zaloService.sendZaloNotification(record.id, false);
        if (result.success) {
          showToast(`Đã gửi tin Zalo cho ${record.nguoiChiDinh}!`, 'success');
          this.closeModal();
          this.app.refreshAllViews();
        } else {
          showToast(result.message, 'warning');
        }
      };
    }
  }

  openQuickStatusModal(recordId) {
    const record = storage.getRecords().find(r => r.id === recordId);
    if (!record) return;

    const canEditGroup2 = storage.canEditField('trangThaiLoi');
    if (!canEditGroup2) {
      showToast('⚠️ Chỉ Khoa/Bác sĩ hoặc Admin mới có quyền cập nhật tiến độ!', 'warning');
      return;
    }

    const mucDoBadge = getMucDoLoiBadge(record.mucDoLoi || record.mucDoCanhBao || 'Nhắc nhở');

    const html = `
      <div class="modal-header">
        <div class="modal-header-title">
          <span class="modal-icon-badge">⚡</span>
          <div>
            <h3>Cập nhật tiến độ sửa lỗi (Khoa / Người sửa)</h3>
            <p class="modal-subtitle">BN: <strong>${escapeHtml(record.tenBenhNhan)}</strong> (${escapeHtml(record.maKCB)}) - Khoa: <strong>${escapeHtml(record.khoaPhong)}</strong></p>
          </div>
        </div>
        <button class="btn-close-modal" id="btn-modal-close">&times;</button>
      </div>

      <form id="form-quick-status" class="modal-form">
        <!-- Thông tin Mức độ lỗi (Readonly do Kế toán BHYT / Bộ phận rà soát ấn định) -->
        <div class="form-group" style="margin-bottom: 14px; background: var(--surface-subtle); padding: 10px 14px; border-radius: var(--radius-xs); border: 1px solid var(--border-soft);">
          <label class="form-label font-bold text-muted" style="font-size: 0.76rem;">MỨC ĐỘ LỖI (Do Kế toán BHYT / Tổ rà soát ấn định):</label>
          <div style="margin-top: 5px;">${mucDoBadge}</div>
        </div>

        <div class="form-group">
          <label class="form-label font-bold text-primary required">1. Tiến độ sửa lỗi của Khoa/Phòng:</label>
          <select id="quick-trangThaiLoi" class="form-select highlight-select" required>
            <option value="CHƯA SỬA" ${record.trangThaiLoi === 'CHƯA SỬA' ? 'selected' : ''}>🔴 CHƯA SỬA</option>
            <option value="ĐÃ XEM - ĐANG SỬA" ${record.trangThaiLoi === 'ĐÃ XEM - ĐANG SỬA' ? 'selected' : ''}>🟠 ĐÃ XEM - ĐANG SỬA</option>
            <option value="ĐÃ XONG" ${record.trangThaiLoi === 'ĐÃ XONG' ? 'selected' : ''}>🟢 ĐÃ XONG (Dừng gửi tin Zalo)</option>
            <option value="HỦY CHUYỂN VIỆN" ${record.trangThaiLoi === 'HỦY CHUYỂN VIỆN' ? 'selected' : ''}>⚪ HỦY CHUYỂN VIỆN</option>
            <option value="KHÁC" ${record.trangThaiLoi === 'KHÁC' ? 'selected' : ''}>⚙️ KHÁC</option>
          </select>
        </div>

        <div class="form-group" style="margin-top: 12px;">
          <label class="form-label font-bold">2. Ý kiến / Giải trình của người sửa lỗi:</label>
          <textarea id="quick-yKienNguoiSua" class="form-textarea" rows="3" placeholder="Ghi chú nội dung đã khắc phục, giải trình lý do...">${escapeHtml(record.yKienNguoiSua || '')}</textarea>
        </div>

        <div class="modal-footer" style="margin-top: 16px;">
          <button type="button" class="btn btn-secondary" id="btn-quick-cancel">Hủy</button>
          <button type="submit" class="btn btn-primary">💾 Cập nhật tiến độ</button>
        </div>
      </form>
    `;

    this.renderModal(html, 'modal-md');
    document.getElementById('btn-modal-close').onclick = () => this.closeModal();
    document.getElementById('btn-quick-cancel').onclick = () => this.closeModal();

    const form = document.getElementById('form-quick-status');
    form.onsubmit = (e) => {
      e.preventDefault();
      storage.updateRecord(record.id, {
        trangThaiLoi: document.getElementById('quick-trangThaiLoi').value,
        yKienNguoiSua: document.getElementById('quick-yKienNguoiSua').value.trim()
      });
      showToast('Đã cập nhật tiến độ khắc phục lỗi!', 'success');
      this.closeModal();
      this.app.refreshAllViews();
    };
  }

  openDepartmentModal(deptId = null) {
    const departments = storage.getDepartments();
    const dept = deptId ? departments.find(d => d.id === deptId) : null;
    const isEdit = !!dept;

    const html = `
      <div class="modal-header">
        <div class="modal-header-title">
          <span class="modal-icon-badge">🏥</span>
          <div><h3>${isEdit ? 'Chỉnh sửa Khoa/Phòng' : 'Thêm mới Khoa/Phòng'}</h3></div>
        </div>
        <button class="btn-close-modal" id="btn-modal-close">&times;</button>
      </div>

      <form id="form-dept" class="modal-form">
        <div class="form-group">
          <label class="form-label required">Tên Khoa/Phòng:</label>
          <input type="text" id="dept-name" class="form-input" value="${escapeHtml(dept ? dept.name : '')}" required autofocus />
        </div>
        <div class="form-group" style="margin-top: 10px;">
          <label class="form-label">Mã viết tắt:</label>
          <input type="text" id="dept-code" class="form-input" value="${escapeHtml(dept ? (dept.code || '') : '')}" />
        </div>
        <div class="modal-footer" style="margin-top: 16px;">
          <button type="button" class="btn btn-secondary" id="btn-dept-cancel">Hủy</button>
          <button type="submit" class="btn btn-primary">💾 Lưu</button>
        </div>
      </form>
    `;

    this.renderModal(html, 'modal-md');
    document.getElementById('btn-modal-close').onclick = () => this.closeModal();
    document.getElementById('btn-dept-cancel').onclick = () => this.closeModal();

    const form = document.getElementById('form-dept');
    form.onsubmit = (e) => {
      e.preventDefault();
      const name = document.getElementById('dept-name').value.trim();
      const code = document.getElementById('dept-code').value.trim();
      if (isEdit) {
        storage.updateDepartment(dept.id, { name, code });
      } else {
        storage.addDepartment({ name, code });
      }
      showToast(`Đã lưu khoa/phòng: ${name}`, 'success');
      this.closeModal();
      this.app.refreshAllViews();
    };
  }

  openStaffModal(staffId = null) {
    const staffList = storage.getStaff();
    const staffMember = staffId ? staffList.find(s => s.id === staffId) : null;
    const isEdit = !!staffMember;
    const departments = storage.getDepartments();

    const deptOptions = departments.map(d => `<option value="${escapeHtml(d.name)}" ${staffMember && staffMember.department === d.name ? 'selected' : ''}>${escapeHtml(d.name)}</option>`).join('');

    const html = `
      <div class="modal-header">
        <div class="modal-header-title">
          <span class="modal-icon-badge">👨‍⚕️</span>
          <div><h3>${isEdit ? 'Chỉnh sửa Profile Nhân viên' : 'Thêm mới Profile Nhân viên'}</h3></div>
        </div>
        <button class="btn-close-modal" id="btn-modal-close">&times;</button>
      </div>

      <form id="form-staff" class="modal-form">
        <div class="form-group">
          <label class="form-label required">Họ tên nhân viên:</label>
          <input type="text" id="staff-name" class="form-input" value="${escapeHtml(staffMember ? staffMember.name : '')}" required autofocus />
        </div>
        <div class="form-group" style="margin-top: 10px;">
          <label class="form-label required">Khoa/Phòng:</label>
          <select id="staff-dept" class="form-select" required>
            <option value="">-- Chọn Khoa/Phòng --</option>
            ${deptOptions}
          </select>
        </div>
        <div class="form-group" style="margin-top: 10px;">
          <label class="form-label required">Chức danh / Vị trí:</label>
          <input type="text" id="staff-position" class="form-input" value="${escapeHtml(staffMember ? staffMember.position : 'Bác sĩ điều trị')}" required />
        </div>
        <div class="form-grid" style="margin-top: 10px;">
          <div class="form-group">
            <label class="form-label">Số điện thoại:</label>
            <input type="tel" id="staff-phone" class="form-input" value="${escapeHtml(staffMember ? (staffMember.phone || '') : '')}" />
          </div>
          <div class="form-group">
            <label class="form-label">Zalo Username / ID:</label>
            <input type="text" id="staff-zalo-id" class="form-input" value="${escapeHtml(staffMember ? (staffMember.zaloId || '') : '')}" />
          </div>
        </div>
        <div class="form-group" style="margin-top: 10px;">
          <label class="form-label font-bold text-primary">Nhóm vai trò chuyên môn:</label>
          <select id="staff-role" class="form-select highlight-select">
            <option value="DUOC" ${staffMember && staffMember.defaultRole === 'DUOC' ? 'selected' : ''}>💊 Khoa Dược (Duyệt khâu Dược)</option>
            <option value="KETOAN_BH" ${staffMember && staffMember.defaultRole === 'KETOAN_BH' ? 'selected' : ''}>💵 Kế toán Bảo hiểm (Duyệt khâu KT-BH)</option>
            <option value="KHTH" ${staffMember && staffMember.defaultRole === 'KHTH' ? 'selected' : ''}>📋 Kế hoạch Tổng hợp (Duyệt KHTH & Chốt cổng)</option>
            <option value="IT" ${staffMember && staffMember.defaultRole === 'IT' ? 'selected' : ''}>💻 Phòng CNTT (Duyệt khâu IT)</option>
            <option value="NHOM_2" ${staffMember && staffMember.defaultRole === 'NHOM_2' ? 'selected' : ''}>👨‍⚕️ Khoa / Bác sĩ Điều Trị (Báo cáo ra viện)</option>
            <option value="NHOM_1" ${staffMember && staffMember.defaultRole === 'NHOM_1' ? 'selected' : ''}>🔍 Nhóm 1: Tổ Rà Soát HSBA</option>
            <option value="ADMIN" ${staffMember && staffMember.defaultRole === 'ADMIN' ? 'selected' : ''}>👑 Quản trị viên (Toàn quyền)</option>
          </select>
        </div>
        <div class="modal-footer" style="margin-top: 16px;">
          <button type="button" class="btn btn-secondary" id="btn-staff-cancel">Hủy</button>
          <button type="submit" class="btn btn-primary">💾 Lưu Profile</button>
        </div>
      </form>
    `;

    this.renderModal(html, 'modal-md');
    document.getElementById('btn-modal-close').onclick = () => this.closeModal();
    document.getElementById('btn-staff-cancel').onclick = () => this.closeModal();

    const form = document.getElementById('form-staff');
    form.onsubmit = (e) => {
      e.preventDefault();
      const name = document.getElementById('staff-name').value.trim();
      const department = document.getElementById('staff-dept').value.trim();
      const position = document.getElementById('staff-position').value.trim();
      const phone = document.getElementById('staff-phone').value.trim();
      const zaloId = document.getElementById('staff-zalo-id').value.trim();
      const defaultRole = document.getElementById('staff-role').value;

      if (isEdit) {
        storage.updateStaff(staffMember.id, { name, department, position, phone, zaloId, defaultRole });
      } else {
        storage.addStaff({ name, department, position, phone, zaloId, defaultRole });
      }
      showToast(`Đã lưu nhân viên: ${name}`, 'success');
      this.closeModal();
      this.app.refreshAllViews();
    };
  }

  openConfirmModal({ title, message, onConfirm, confirmText = 'Đồng ý', isDanger = false }) {
    const html = `
      <div class="modal-header">
        <div class="modal-header-title">
          <span class="modal-icon-badge ${isDanger ? 'badge-danger' : ''}">${isDanger ? '⚠️' : '❓'}</span>
          <div><h3>${escapeHtml(title)}</h3></div>
        </div>
        <button class="btn-close-modal" id="btn-modal-close">&times;</button>
      </div>
      <div class="modal-body" style="padding: 16px 0;">
        <p style="font-size: 1rem; line-height: 1.5;">${message}</p>
      </div>
      <div class="modal-footer">
        <button type="button" class="btn btn-secondary" id="btn-confirm-cancel">Hủy</button>
        <button type="button" class="btn ${isDanger ? 'btn-danger' : 'btn-primary'}" id="btn-confirm-ok">${escapeHtml(confirmText)}</button>
      </div>
    `;

    this.renderModal(html, 'modal-sm');
    document.getElementById('btn-modal-close').onclick = () => this.closeModal();
    document.getElementById('btn-confirm-cancel').onclick = () => this.closeModal();
    document.getElementById('btn-confirm-ok').onclick = () => {
      this.closeModal();
      if (typeof onConfirm === 'function') onConfirm();
    };
  }
}
