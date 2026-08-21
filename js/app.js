/**
 * Controller chính điều khiển toàn bộ ứng dụng THEO DÕI HSBA
 * - Danh sách lỗi rà soát (Mặc định 10 ngày gần đây, tìm kiếm mở rộng, ưu tiên lỗi chưa hoàn thành)
 * - Báo cáo và chốt ra viện: 
 *    + Tự động ghi nhớ Khoa/Phòng mặc định của nhân viên
 *    + Khung nhập trực tiếp nhiều ca ra viện một lúc trên danh sách (Batch Inline Entry)
 *    + 4 khâu kiểm lỗi (Dược, Kế toán BH, KHTH, IT)
 *    + Báo cáo tình trạng sửa lỗi
 *    + Chốt thông cổng (Phân quyền KHTH)
 */

import { storage } from './storage.js';
import { ROLES, PERMISSION_COLUMNS } from './data.js';
import { zaloService } from './zaloService.js';
import { supabaseService } from './supabase.js';
import { ModalController } from './modal.js';
import {
  formatDateVN,
  formatDateTimeVN,
  removeVietnameseTones,
  getMucDoLoiBadge,
  getWarningBadge,
  getReviewStatusBadge,
  getErrorStatusBadge,
  showToast,
  exportRecordsToCSV,
  escapeHtml,
  getTodayDateString
} from './utils.js';

class App {
  constructor() {
    this.currentTab = 'records'; // 'dashboard' | 'records' | 'discharge' | 'settings'
    this.settingsSubTab = 'zalo'; // 'zalo' | 'permissions' | 'departments' | 'staff' | 'backup'
    this.modalController = new ModalController(this);

    // Trạng thái tìm kiếm & 5 tiêu chí lọc lỗi HSBA
    this.filters = {
      keyword: '',
      khoaPhong: '',
      nguoiChiDinh: '',
      trangThaiKiemDuyet: '',
      fromNgayKiem: '',
      toNgayKiem: ''
    };

    // Bộ lọc Báo cáo ra viện
    this.dischargeFilters = {
      keyword: '',
      dept: '',
      gate: '',
      date: getTodayDateString()
    };

    // Quản lý các dòng nhập nhanh nhiều ca trực tiếp (Batch Inline Rows) - Mặc định 1 dòng ban đầu
    this.batchRows = [
      { id: 1, maKCB: '', tenBenhNhan: '', tenBacSi: '' }
    ];
    this.nextBatchRowId = 2;

    // Phân trang & sắp xếp danh sách lỗi
    this.currentPage = 1;
    this.pageSize = 15;
    this.sortBy = 'ngayCapNhat';
    this.sortOrder = 'desc';

    this.init();
  }

  init() {
    this.bindEvents();
    this.populateFilterSuggestions();

    if (!storage.isAuthenticated()) {
      this.renderLoginScreen();
    } else {
      this.handleLoginSuccess(storage.getCurrentUser(), false);
    }

    // Đồng hồ y tế trực tiếp
    const updateClock = () => {
      const clockEl = document.getElementById('topbar-live-clock');
      if (clockEl) {
        const d = new Date();
        const dateStr = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
        const timeStr = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
        clockEl.textContent = `${timeStr} · ${dateStr}`;
      }
    };
    updateClock();
    setInterval(updateClock, 30000);
  }

  // Render Màn hình Đăng nhập (Login Screen) & Thẻ Đăng nhập Nhanh 1-chạm
  renderLoginScreen() {
    const loginView = document.getElementById('login-screen-view');
    const workspaceView = document.getElementById('app-main-workspace');
    if (loginView) loginView.style.display = 'flex';
    if (workspaceView) workspaceView.style.display = 'none';

    const errEl = document.getElementById('login-error-msg');
    if (errEl) errEl.style.display = 'none';

    const quickContainer = document.getElementById('quick-role-cards-container');
    if (quickContainer) {
      const staffList = storage.getStaff();
      quickContainer.innerHTML = staffList.map(staff => {
        const role = ROLES[staff.defaultRole] || ROLES.NHOM_2;
        return `
          <button type="button" class="quick-role-card" data-staff-id="${staff.id}">
            <div class="quick-role-avatar">${staff.avatarEmoji || '👨‍⚕️'}</div>
            <div class="quick-role-info">
              <div class="quick-role-name">${escapeHtml(staff.name)}</div>
              <div class="quick-role-title">${escapeHtml(staff.position)} · <span class="quick-role-dept">${escapeHtml(staff.department)}</span></div>
            </div>
            <span class="quick-role-pill ${role.badgeClass}">${role.icon} ${escapeHtml(role.shortName || role.name)}</span>
          </button>
        `;
      }).join('');

      quickContainer.querySelectorAll('.quick-role-card').forEach(card => {
        card.onclick = (e) => {
          const staffId = e.currentTarget.getAttribute('data-staff-id');
          const res = storage.loginAsStaff(staffId);
          if (res.success) {
            this.handleLoginSuccess(res.user);
          }
        };
      });
    }

    const form = document.getElementById('form-login-auth');
    if (form) {
      form.onsubmit = (e) => {
        e.preventDefault();
        const u = document.getElementById('login-username').value;
        const p = document.getElementById('login-password').value;
        const res = storage.login(u, p);
        if (res.success) {
          if (errEl) errEl.style.display = 'none';
          this.handleLoginSuccess(res.user);
        } else {
          if (errEl) {
            errEl.textContent = res.message;
            errEl.style.display = 'block';
          }
        }
      };
    }
  }

  // Xử lý sau khi Đăng nhập thành công
  handleLoginSuccess(user, notify = true) {
    const loginView = document.getElementById('login-screen-view');
    const workspaceView = document.getElementById('app-main-workspace');
    if (loginView) loginView.style.display = 'none';
    if (workspaceView) workspaceView.style.display = 'block';

    if (notify) {
      showToast(`Xin chào ${user.name} (${user.position})!`, 'success');
    }

    this.renderHeaderUserProfile();
    this.updateRoleUI();
    this.populateFilterSuggestions();
    this.initBatchDischargeEntry();
    this.switchTab('records');
  }

  // Đăng xuất an toàn
  handleLogout() {
    storage.logout();
    showToast('Đã đăng xuất khỏi hệ thống', 'info');
    this.renderLoginScreen();
  }

  // Render Hồ sơ người dùng đang đăng nhập trên Header
  renderHeaderUserProfile() {
    const user = storage.getCurrentUser();
    if (!user) return;
    const role = storage.getRoleDetails();

    const avatarEl = document.getElementById('header-user-avatar');
    if (avatarEl) avatarEl.textContent = user.avatarEmoji || '👨‍⚕️';

    const nameEl = document.getElementById('header-user-name');
    if (nameEl) nameEl.textContent = user.name;

    const deptEl = document.getElementById('header-user-dept');
    if (deptEl) deptEl.textContent = `${user.position} · ${user.department}`;

    const rolePill = document.getElementById('header-user-role-pill');
    if (rolePill) {
      rolePill.textContent = `${role.icon} ${role.shortName || role.name}`;
      rolePill.className = `user-role-badge ${role.badgeClass || ''}`;
    }

    const subHospital = document.getElementById('header-hospital-subtitle');
    if (subHospital) {
      subHospital.textContent = 'BV HNĐK NGHỆ AN - GĐ2';
      subHospital.title = 'Bệnh viện Hữu nghị Đa khoa Nghệ An - Giai đoạn 2';
    }

    const dashGreeting = document.getElementById('dash-greeting-title');
    if (dashGreeting) dashGreeting.textContent = `Chào buổi làm việc, ${user.name} 👋`;

    // Dropdown chuyển nhanh tài khoản người dùng
    const switchSelect = document.getElementById('header-switch-user-select');
    if (switchSelect) {
      const staffList = storage.getStaff();
      switchSelect.innerHTML = staffList.map(s => {
        const r = ROLES[s.defaultRole] || ROLES.NHOM_2;
        return `<option value="${s.id}" ${s.id === user.id ? 'selected' : ''}>${s.avatarEmoji || '👤'} ${escapeHtml(s.name)} (${escapeHtml(r.shortName || r.name)} - ${escapeHtml(s.department)})</option>`;
      }).join('');

      switchSelect.onchange = (e) => {
        const staffId = e.target.value;
        const res = storage.loginAsStaff(staffId);
        if (res.success) {
          this.handleLoginSuccess(res.user);
        }
      };
    }

    const btnLogout = document.getElementById('btn-header-logout');
    if (btnLogout) {
      btnLogout.onclick = () => this.handleLogout();
    }
  }

  // Cập nhật giao diện theo Role hiện tại (7 nhóm vai trò chuyên biệt)
  updateRoleUI() {
    const currentRole = storage.getCurrentRole();
    const roleDetails = storage.getRoleDetails();

    const btnAddDesktop = document.getElementById('btn-open-add-modal');
    const btnAddMobile = document.getElementById('btn-add-mobile-fab');
    const canAdd = storage.canAddRecord();

    if (btnAddDesktop) {
      btnAddDesktop.style.display = canAdd ? 'inline-flex' : 'none';
    }
    if (btnAddMobile) {
      btnAddMobile.style.display = canAdd ? 'flex' : 'none';
    }

    // Cập nhật nhãn nút Cài đặt theo quyền
    const canSettings = storage.canAccessSettings();
    const navBtnSettings = document.getElementById('nav-btn-settings');
    const mobNavBtnSettings = document.getElementById('mob-nav-btn-settings');

    if (navBtnSettings) {
      const label = navBtnSettings.querySelector('.nav-item-label') || navBtnSettings;
      if (canSettings) {
        label.textContent = 'Cài đặt & Phân quyền';
        navBtnSettings.removeAttribute('title');
      } else {
        label.textContent = '🔒 Cài đặt (Khóa)';
        navBtnSettings.setAttribute('title', 'Khu vực khóa: Chỉ Admin và Phòng CNTT được truy cập');
      }
    }

    if (mobNavBtnSettings) {
      const icon = mobNavBtnSettings.querySelector('.bottom-nav-icon');
      if (icon) icon.textContent = canSettings ? '⚙️' : '🔒';
    }

    if (this.currentTab === 'settings') {
      this.renderSettingsView();
    }
  }

  // Chuyển nhanh vai trò và mở khóa
  switchRoleAndUnlock(roleId) {
    storage.setCurrentRole(roleId);
    this.updateRoleUI();
    const role = storage.getRoleDetails();
    showToast(`Đã chuyển sang vai trò: ${role.name}`, 'success');
    this.refreshAllViews();
  }

  // Gắn các sự kiện giao diện
  bindEvents() {
    document.querySelectorAll('[data-tab]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const tab = e.currentTarget.getAttribute('data-tab');
        this.switchTab(tab);
        const sidebar = document.getElementById('app-sidebar');
        if (sidebar) sidebar.classList.remove('sidebar-mobile-open');
      });
    });

    const btnToggleSidebar = document.getElementById('btn-toggle-sidebar');
    const sidebar = document.getElementById('app-sidebar');
    if (btnToggleSidebar && sidebar) {
      btnToggleSidebar.onclick = () => {
        sidebar.classList.toggle('sidebar-mobile-open');
      };
    }

    const headerRoleSelect = document.getElementById('header-role-select');
    if (headerRoleSelect) {
      headerRoleSelect.onchange = (e) => {
        const newRole = e.target.value;
        storage.setCurrentRole(newRole);
        this.updateRoleUI();
        const role = storage.getRoleDetails();
        showToast(`Đã chuyển vai trò: ${role.name}`, 'info');
        this.refreshAllViews();
      };
    }

    const btnAddError = document.getElementById('btn-open-add-modal');
    if (btnAddError) {
      btnAddError.onclick = () => this.modalController.openAddErrorModal();
    }
    const btnAddErrorMobile = document.getElementById('btn-add-mobile-fab');
    if (btnAddErrorMobile) {
      btnAddErrorMobile.onclick = () => this.modalController.openAddErrorModal();
    }
    const btnOpenAddModalMobile = document.getElementById('btn-open-add-modal-mobile');
    if (btnOpenAddModalMobile) {
      btnOpenAddModalMobile.onclick = () => this.modalController.openAddErrorModal();
    }

    const searchInput = document.getElementById('search-input');
    if (searchInput) {
      let debounceTimer;
      searchInput.addEventListener('input', (e) => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          this.filters.keyword = e.target.value.trim();
          this.currentPage = 1;
          this.renderRecordsView();
        }, 150);
      });
    }

    // 5 trường lọc chính của Danh sách lỗi (Hỗ trợ đầy đủ các ID giao diện)
    const filterInputIds = [
      { id: 'filter-dept-input', key: 'khoaPhong' },
      { id: 'filter-khoa-phong-input', key: 'khoaPhong' },
      { id: 'filter-staff-input', key: 'nguoiChiDinh' },
      { id: 'filter-nguoi-chi-dinh-input', key: 'nguoiChiDinh' },
      { id: 'filter-status-input', key: 'trangThaiKiemDuyet' },
      { id: 'filter-kiem-duyet-input', key: 'trangThaiKiemDuyet' },
      { id: 'filter-from-date', key: 'fromNgayKiem' },
      { id: 'filter-to-date', key: 'toNgayKiem' }
    ];

    filterInputIds.forEach(({ id, key }) => {
      const el = document.getElementById(id);
      if (el) {
        let timer;
        el.addEventListener('input', (e) => {
          clearTimeout(timer);
          timer = setTimeout(() => {
            this.filters[key] = e.target.value.trim();
            this.currentPage = 1;
            this.renderRecordsView();
          }, 150);
        });
        el.addEventListener('change', (e) => {
          this.filters[key] = e.target.value.trim();
          this.currentPage = 1;
          this.renderRecordsView();
        });
      }
    });

    // Quick Category Filter Pills (Phong cách hình tham chiếu)
    document.querySelectorAll('.cat-pill-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        document.querySelectorAll('.cat-pill-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const status = btn.getAttribute('data-status-filter');
        const tab = btn.getAttribute('data-tab-switch');
        if (tab) {
          this.switchTab(tab);
          return;
        }
        if (this.currentTab !== 'records') {
          this.switchTab('records');
        }
        if (status === 'ALL') {
          this.filters.trangThaiKiemDuyet = '';
          const statusInput = document.getElementById('filter-status-input');
          if (statusInput) statusInput.value = '';
        } else if (status) {
          this.filters.trangThaiKiemDuyet = status;
          const statusInput = document.getElementById('filter-status-input');
          if (statusInput) statusInput.value = status;
        }
        this.currentPage = 1;
        this.renderRecordsView();
      });
    });

    const btnClearSearch = document.getElementById('btn-clear-search');
    if (btnClearSearch) {
      btnClearSearch.onclick = () => {
        if (searchInput) searchInput.value = '';
        this.filters.keyword = '';
        this.currentPage = 1;
        this.renderRecordsView();
      };
    }

    const btnResetFilter = document.getElementById('btn-reset-filter') || document.getElementById('btn-reset-filters');
    if (btnResetFilter) {
      btnResetFilter.onclick = () => this.resetFilters();
    }

    const btnExportExcel = document.getElementById('btn-export-excel');
    if (btnExportExcel) {
      btnExportExcel.onclick = () => {
        const filteredRecords = this.getFilteredRecords();
        exportRecordsToCSV(filteredRecords, `Bao_cao_Ra_soat_HSBA_${new Date().toISOString().slice(0, 10)}.csv`);
      };
    }

    const btnToggleFilterMobile = document.getElementById('btn-toggle-filter-mobile');
    const filterContainer = document.getElementById('filter-section');
    const filterToggleLabel = document.getElementById('btn-toggle-filter-label');
    if (btnToggleFilterMobile && filterContainer) {
      btnToggleFilterMobile.onclick = () => {
        const isOpen = filterContainer.classList.toggle('filter-open-mobile');
        if (filterToggleLabel) {
          filterToggleLabel.textContent = isOpen ? 'Thu gọn' : 'Bộ lọc';
        }
      };
    }

    // Sự kiện phần Báo cáo ra viện
    const btnAddDischargeReport = document.getElementById('btn-open-add-discharge-report');
    if (btnAddDischargeReport) {
      btnAddDischargeReport.onclick = () => this.modalController.openAddDischargeReportModal();
    }
    const btnAddDischargeModalMobile = document.getElementById('btn-open-add-discharge-modal-mobile');
    if (btnAddDischargeModalMobile) {
      btnAddDischargeModalMobile.onclick = () => this.modalController.openAddDischargeReportModal();
    }

    const btnToggleBatchMobile = document.getElementById('btn-toggle-batch-mobile');
    const batchPanel = document.getElementById('batch-discharge-panel');
    const batchToggleLabel = document.getElementById('btn-toggle-batch-label');
    if (btnToggleBatchMobile && batchPanel) {
      btnToggleBatchMobile.onclick = () => {
        const isOpen = batchPanel.classList.toggle('batch-panel-visible-mobile');
        if (batchToggleLabel) {
          batchToggleLabel.textContent = isOpen ? '✕ Đóng bảng nhập' : '⚡ Nhập bảng nhiều ca';
        }
      };
    }

    const dischargeSearchInput = document.getElementById('discharge-search-input');
    if (dischargeSearchInput) {
      dischargeSearchInput.oninput = (e) => {
        this.dischargeFilters.keyword = e.target.value.trim();
        this.renderDischargeView();
      };
    }

    const btnClearDischargeSearch = document.getElementById('btn-clear-discharge-search');
    if (btnClearDischargeSearch) {
      btnClearDischargeSearch.onclick = () => {
        if (dischargeSearchInput) dischargeSearchInput.value = '';
        this.dischargeFilters.keyword = '';
        this.renderDischargeView();
      };
    }

    const dischargeDeptFilter = document.getElementById('discharge-dept-filter');
    if (dischargeDeptFilter) {
      dischargeDeptFilter.oninput = (e) => {
        this.dischargeFilters.dept = e.target.value.trim();
        this.renderDischargeView();
      };
    }

    const dischargeGateFilter = document.getElementById('discharge-gate-filter');
    if (dischargeGateFilter) {
      dischargeGateFilter.onchange = (e) => {
        this.dischargeFilters.gate = e.target.value;
        this.renderDischargeView();
      };
    }

    // Bộ lọc theo Ngày báo cáo
    const dischargeDateFilter = document.getElementById('discharge-date-filter');
    if (dischargeDateFilter) {
      dischargeDateFilter.value = this.dischargeFilters.date;
      dischargeDateFilter.onchange = (e) => {
        this.dischargeFilters.date = e.target.value;
        this.renderDischargeView();
      };
    }

    const btnPrevDate = document.getElementById('btn-discharge-prev-date');
    if (btnPrevDate) {
      btnPrevDate.onclick = () => this.changeDischargeDate(-1);
    }

    const btnNextDate = document.getElementById('btn-discharge-next-date');
    if (btnNextDate) {
      btnNextDate.onclick = () => this.changeDischargeDate(1);
    }

    const btnTodayDate = document.getElementById('btn-discharge-today');
    if (btnTodayDate) {
      btnTodayDate.onclick = () => {
        this.dischargeFilters.date = getTodayDateString();
        const dateInput = document.getElementById('discharge-date-filter');
        if (dateInput) dateInput.value = this.dischargeFilters.date;
        this.renderDischargeView();
      };
    }
  }

  // Reset bộ lọc về mặc định (trở về chế độ 10 ngày gần đây)
  resetFilters() {
    this.filters = {
      keyword: '',
      khoaPhong: '',
      nguoiChiDinh: '',
      trangThaiKiemDuyet: '',
      fromNgayKiem: '',
      toNgayKiem: ''
    };

    const searchInput = document.getElementById('search-input');
    if (searchInput) searchInput.value = '';

    const inputs = [
      'filter-dept-input',
      'filter-khoa-phong-input',
      'filter-staff-input',
      'filter-nguoi-chi-dinh-input',
      'filter-status-input',
      'filter-kiem-duyet-input',
      'filter-from-date',
      'filter-to-date'
    ];
    inputs.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });

    this.currentPage = 1;
    this.renderRecordsView();
    showToast('Đã đặt lại về danh sách 10 ngày gần đây', 'info');
  }

  populateFilterSuggestions() {
    const departments = storage.getDepartments();
    const staffList = storage.getStaff();

    const deptListEl = document.getElementById('dl-khoa-phong');
    if (deptListEl) {
      deptListEl.innerHTML = departments.map(d => `<option value="${escapeHtml(d.name)}">${escapeHtml(d.code ? `(${d.code}) ` : '')}${escapeHtml(d.name)}</option>`).join('');
    }

    const staffListEl = document.getElementById('dl-nguoi-chi-dinh');
    if (staffListEl) {
      staffListEl.innerHTML = staffList.map(s => `<option value="${escapeHtml(s.name)}">${escapeHtml(s.position)} - ${escapeHtml(s.department)}</option>`).join('');
    }
  }

  // Chuyển Tab chính
  switchTab(tabId) {
    this.currentTab = tabId;

    document.querySelectorAll('[data-tab]').forEach(btn => {
      btn.classList.toggle('nav-active', btn.getAttribute('data-tab') === tabId);
    });

    const views = ['view-dashboard', 'view-records', 'view-discharge', 'view-settings'];
    views.forEach(v => {
      const el = document.getElementById(v);
      if (el) el.style.display = v === `view-${tabId}` ? 'block' : 'none';
    });

    if (tabId === 'dashboard') {
      this.renderDashboardView();
    } else if (tabId === 'records') {
      this.renderRecordsView();
    } else if (tabId === 'discharge') {
      this.renderDischargeView();
      this.initBatchDischargeEntry();
    } else if (tabId === 'settings') {
      this.renderSettingsView();
    }

    this.updateRightPanelWidgets();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  refreshAllViews() {
    this.populateFilterSuggestions();
    this.updateRoleUI();
    if (this.currentTab === 'dashboard') {
      this.renderDashboardView();
    } else if (this.currentTab === 'records') {
      this.renderRecordsView();
    } else if (this.currentTab === 'discharge') {
      this.renderDischargeView();
      this.initBatchDischargeEntry();
    } else if (this.currentTab === 'settings') {
      this.renderSettingsView();
    }
    this.updateRightPanelWidgets();
  }

  // Cập nhật Widget bên phải theo phong cách hình tham chiếu
  updateRightPanelWidgets() {
    const records = storage.getRecords();
    const dischargeReports = storage.getDischargeReports();
    const total = records.length;
    const daXong = records.filter(r => r.trangThaiLoi === 'ĐÃ XONG').length;
    const unresolved = records.filter(r => r.trangThaiLoi === 'CHƯA SỬA' || r.trangThaiLoi === 'ĐÃ XEM - ĐANG SỬA').length;
    const resolvedRate = total > 0 ? Math.round((daXong / total) * 100) : 100;
    const daThongCong = dischargeReports.filter(r => r.chotThongCong === 'CO').length;

    // 1. Cập nhật vòng tròn tiến độ (Circular Progress Gauge giống Kcal 25% trong hình)
    const ringCircle = document.getElementById('widget-circle-progress');
    const ringPercentLabel = document.getElementById('widget-percent-label');
    const ringDetailLabel = document.getElementById('widget-progress-sub');
    if (ringCircle) {
      const circumference = 2 * Math.PI * 34; // r=34 -> ~213.6
      const offset = circumference - (resolvedRate / 100) * circumference;
      ringCircle.style.strokeDashoffset = offset;
    }
    if (ringPercentLabel) {
      ringPercentLabel.textContent = `${resolvedRate}%`;
    }
    if (ringDetailLabel) {
      ringDetailLabel.textContent = `${daXong}/${total} hồ sơ đạt`;
    }

    // 2. Cập nhật thống kê 4 khâu mini ở cột phải
    const widgetStepsContainer = document.getElementById('widget-steps-list');
    if (widgetStepsContainer) {
      const steps = [
        { key: 'kiemDuoc', name: 'Dược', icon: '💊' },
        { key: 'kiemKeToanBH', name: 'Kế toán BH', icon: '💵' },
        { key: 'kiemKHTH', name: 'KHTH', icon: '📋' },
        { key: 'kiemIT', name: 'IT', icon: '💻' }
      ];
      widgetStepsContainer.innerHTML = steps.map(s => {
        const errorCount = dischargeReports.filter(r => r[s.key] && r[s.key].status === 'CO_LOI').length;
        return `
          <div class="widget-step-item">
            <div class="w-step-info">
              <span class="w-step-icon">${s.icon}</span>
              <span class="w-step-name">${s.name}</span>
            </div>
            <span class="w-step-status ${errorCount > 0 ? 'w-has-err' : 'w-clean'}">
              ${errorCount > 0 ? `${errorCount} lỗi` : '✓ Đạt'}
            </span>
          </div>
        `;
      }).join('');
    }

    // 3. Cập nhật tổng số hồ sơ chờ chốt thông cổng
    const widgetGateCount = document.getElementById('widget-gate-count');
    if (widgetGateCount) {
      widgetGateCount.textContent = `${daThongCong}/${dischargeReports.length} ca`;
    }
  }

  // ==========================================
  // 1. VIEW DANH SÁCH LỖI HSBA
  // ==========================================
  getFilteredRecords() {
    let records = storage.getRecords();

    const hasKeyword = !!this.filters.keyword;
    const hasCustomDate = !!this.filters.fromNgayKiem || !!this.filters.toNgayKiem;

    // 1. Mặc định 10 ngày gần đây nhất
    if (!hasKeyword && !hasCustomDate) {
      const d = new Date();
      d.setDate(d.getDate() - 10);
      const tenDaysAgoStr = d.toISOString().slice(0, 10);

      records = records.filter(r => {
        const checkDate = r.ngayKiemHoSo || (r.ngayTao ? r.ngayTao.slice(0, 10) : '');
        return checkDate >= tenDaysAgoStr;
      });
    }

    // 2. Tìm kiếm từ khóa toàn bộ
    if (this.filters.keyword) {
      const kw = removeVietnameseTones(this.filters.keyword);
      records = records.filter(r => {
        const maKCB = removeVietnameseTones(r.maKCB || '');
        const tenBN = removeVietnameseTones(r.tenBenhNhan || '');
        const dienGiai = removeVietnameseTones(r.dienGiaiLoi || '');
        const yKien = removeVietnameseTones(r.yKienNguoiSua || '');
        const nguoiCD = removeVietnameseTones(r.nguoiChiDinh || '');
        const khoa = removeVietnameseTones(r.khoaPhong || '');
        return maKCB.includes(kw) || tenBN.includes(kw) || dienGiai.includes(kw) || yKien.includes(kw) || nguoiCD.includes(kw) || khoa.includes(kw);
      });
    }

    if (this.filters.khoaPhong) {
      const kwDept = removeVietnameseTones(this.filters.khoaPhong);
      records = records.filter(r => removeVietnameseTones(r.khoaPhong || '').includes(kwDept));
    }

    if (this.filters.nguoiChiDinh) {
      const kwStaff = removeVietnameseTones(this.filters.nguoiChiDinh);
      records = records.filter(r => removeVietnameseTones(r.nguoiChiDinh || '').includes(kwStaff));
    }

    if (this.filters.trangThaiKiemDuyet) {
      const kwRev = removeVietnameseTones(this.filters.trangThaiKiemDuyet);
      records = records.filter(r => {
        const val1 = removeVietnameseTones(r.mucDoLoi || '');
        const val2 = removeVietnameseTones(r.trangThaiKiemDuyet || '');
        const val3 = removeVietnameseTones(r.mucDoCanhBao || '');
        return val1.includes(kwRev) || val2.includes(kwRev) || val3.includes(kwRev);
      });
    }

    if (this.filters.fromNgayKiem) {
      records = records.filter(r => r.ngayKiemHoSo >= this.filters.fromNgayKiem);
    }
    if (this.filters.toNgayKiem) {
      records = records.filter(r => r.ngayKiemHoSo <= this.filters.toNgayKiem);
    }

    // Ưu tiên lỗi chưa hoàn thành lên trên
    records.sort((a, b) => {
      const isUnresolvedA = (a.trangThaiLoi !== 'ĐÃ XONG' && a.trangThaiKiemDuyet !== 'ĐÃ SỬA' && !a.chotRaVien) ? 0 : 1;
      const isUnresolvedB = (b.trangThaiLoi !== 'ĐÃ XONG' && b.trangThaiKiemDuyet !== 'ĐÃ SỬA' && !b.chotRaVien) ? 0 : 1;

      if (isUnresolvedA !== isUnresolvedB) {
        return isUnresolvedA - isUnresolvedB;
      }

      const dateA = a.ngayKiemHoSo || a.ngayTao || '';
      const dateB = b.ngayKiemHoSo || b.ngayTao || '';
      return dateB.localeCompare(dateA);
    });

    return records;
  }

  renderRecordsView() {
    const filteredRecords = this.getFilteredRecords();
    const totalCount = filteredRecords.length;
    const totalPages = Math.ceil(totalCount / this.pageSize) || 1;

    if (this.currentPage > totalPages) {
      this.currentPage = totalPages;
    }

    const startIndex = (this.currentPage - 1) * this.pageSize;
    const pagedRecords = filteredRecords.slice(startIndex, startIndex + this.pageSize);

    const hasKeyword = !!this.filters.keyword;
    const hasCustomDate = !!this.filters.fromNgayKiem || !!this.filters.toNgayKiem;

    const countBadge = document.getElementById('records-total-count');
    if (countBadge) {
      if (hasKeyword || hasCustomDate) {
        countBadge.textContent = `${totalCount} kết quả tìm kiếm`;
      } else {
        countBadge.textContent = `10 ngày gần đây (${totalCount} lỗi)`;
      }
    }

    const tableBody = document.getElementById('records-table-body');
    const cardsContainer = document.getElementById('records-cards-container');
    const paginationContainer = document.getElementById('records-pagination');

    if (!pagedRecords.length) {
      const emptyHtml = `
        <div class="empty-state">
          <div class="empty-icon">📋</div>
          <h4>Không tìm thấy bản ghi lỗi nào trong 10 ngày gần đây</h4>
          <p>Nhập từ khóa vào ô tìm kiếm phía trên để tra cứu toàn bộ lịch sử</p>
          <button class="btn btn-outline" id="btn-empty-reset">Đặt lại bộ lọc</button>
        </div>
      `;
      if (tableBody) {
        tableBody.innerHTML = `<tr><td colspan="8">${emptyHtml}</td></tr>`;
        const btnReset = document.getElementById('btn-empty-reset');
        if (btnReset) btnReset.onclick = () => this.resetFilters();
      }
      if (cardsContainer) {
        cardsContainer.innerHTML = emptyHtml;
        const btnReset = cardsContainer.querySelector('#btn-empty-reset');
        if (btnReset) btnReset.onclick = () => this.resetFilters();
      }
      if (paginationContainer) paginationContainer.innerHTML = '';
      return;
    }

    const canEditGroup2 = storage.canEditField('trangThaiLoi');

    // 1. TABLE DESKTOP
    if (tableBody) {
      tableBody.innerHTML = pagedRecords.map((r, index) => {
        const rowNumber = startIndex + index + 1;
        const isUnresolved = (r.trangThaiLoi !== 'ĐÃ XONG' && r.trangThaiKiemDuyet !== 'ĐÃ SỬA' && !r.chotRaVien);

        return `
          <tr class="table-row ${isUnresolved ? 'row-unresolved' : ''}">
            <td class="text-center font-mono text-muted text-xs">${rowNumber}</td>
            
            <td class="col-patient">
              <div class="patient-title font-bold text-patient">${escapeHtml(r.tenBenhNhan)}</div>
              <div class="patient-sub-line">
                <span class="badge-ma-kcb">${escapeHtml(r.maKCB)}</span>
                <span class="text-xs text-muted">Vào: ${formatDateVN(r.ngayVaoKhoa)}</span>
              </div>
            </td>

            <td class="col-dept">
              <div class="font-medium text-dept">${escapeHtml(r.khoaPhong)}</div>
              <div class="text-xs text-muted" style="margin-top: 2px;">
                👤 ${escapeHtml(r.nguoiChiDinh || '---')}
              </div>
            </td>

            <td class="col-timing text-center">
              <div class="timing-sub-text">
                <span class="font-medium text-slate-800" title="Thời gian y lệnh">⏰ ${escapeHtml(r.thoiGianChiDinhYL || '---')}</span>
                <span class="text-muted text-xs" title="Ngày kiểm hồ sơ" style="display: block; margin-top: 2px;">📅 ${formatDateVN(r.ngayKiemHoSo)}</span>
              </div>
            </td>

            <td class="col-error-desc">
              <div class="cell-error-text" title="${escapeHtml(r.dienGiaiLoi)}">${escapeHtml(r.dienGiaiLoi)}</div>
              ${r.yKienNguoiSua ? `
                <div class="cell-response-note" title="Ý kiến người sửa: ${escapeHtml(r.yKienNguoiSua)}">
                  💬 <em>${escapeHtml(r.yKienNguoiSua)}</em>
                </div>
              ` : ''}
            </td>

            <td class="col-review-status text-center">
              ${getMucDoLoiBadge(r.mucDoLoi || r.mucDoCanhBao || r.trangThaiKiemDuyet)}
            </td>

            <td class="col-error-status text-center">
              <button class="btn-status-trigger ${canEditGroup2 ? 'btn-status-active' : 'btn-status-readonly'}" onclick="window.hsbaApp.modalController.openQuickStatusModal('${r.id}')" title="${canEditGroup2 ? 'Bấm để cập nhật nhanh tiến độ sửa lỗi' : 'Xem tiến độ'}">
                ${getErrorStatusBadge(r.trangThaiLoi)}
                ${canEditGroup2 ? '<span class="btn-quick-edit-icon">✏️</span>' : ''}
              </button>
            </td>

            <td class="col-actions text-center">
              <button class="btn-action-icon btn-edit" onclick="window.hsbaApp.modalController.openEditErrorModal('${r.id}')" title="Xem & Chỉnh sửa chi tiết">
                ✏️
              </button>
            </td>
          </tr>
        `;
      }).join('');
    }

    // 2. MOBILE CARDS
    if (cardsContainer) {
      cardsContainer.innerHTML = pagedRecords.map((r) => {
        const isUnresolved = (r.trangThaiLoi !== 'ĐÃ XONG' && r.trangThaiKiemDuyet !== 'ĐÃ SỬA' && !r.chotRaVien);

        return `
          <div class="mobile-error-card ${isUnresolved ? 'card-unresolved' : ''}">
            <div class="card-top-bar">
              <div class="card-patient-info">
                <span class="card-ma-kcb">${escapeHtml(r.maKCB)}</span>
                <h4 class="card-patient-name">${escapeHtml(r.tenBenhNhan)}</h4>
              </div>
              <div class="card-badges">
                ${getMucDoLoiBadge(r.mucDoLoi || r.mucDoCanhBao || r.trangThaiKiemDuyet)}
              </div>
            </div>

            <div class="card-meta-grid">
              <div>🏥 <strong>${escapeHtml(r.khoaPhong)}</strong></div>
              <div>👤 <strong>${escapeHtml(r.nguoiChiDinh || '---')}</strong></div>
              <div>📅 Vào khoa: <strong>${formatDateVN(r.ngayVaoKhoa)}</strong></div>
              <div>🔍 Kiểm HS: <strong>${formatDateVN(r.ngayKiemHoSo)}</strong></div>
              <div style="grid-column: 1 / -1;">⏰ Y lệnh: <strong>${escapeHtml(r.thoiGianChiDinhYL || '---')}</strong></div>
            </div>

            <div class="card-error-body">
              <div class="card-error-title">⚠️ Diễn giải sai sót:</div>
              <p class="card-error-desc">${escapeHtml(r.dienGiaiLoi)}</p>
              ${r.yKienNguoiSua ? `
                <div class="card-response-box">
                  <strong>Ý kiến người sửa:</strong> ${escapeHtml(r.yKienNguoiSua)}
                </div>
              ` : ''}
            </div>

            <div class="card-status-bar">
              <div>
                <span class="text-xs text-muted block">Trạng thái:</span>
                ${getReviewStatusBadge(r.trangThaiKiemDuyet)}
              </div>
              <div>
                <span class="text-xs text-muted block">Trạng thái lỗi:</span>
                ${getErrorStatusBadge(r.trangThaiLoi)}
              </div>
            </div>

            <div class="card-footer-actions">
              <button class="btn btn-sm btn-outline flex-1" onclick="window.hsbaApp.modalController.openEditErrorModal('${r.id}')">
                ✏️ Chi tiết / Chỉnh sửa
              </button>
            </div>
          </div>
        `;
      }).join('');
    }

    // 3. PAGINATION
    if (paginationContainer) {
      let pageButtons = '';
      for (let i = 1; i <= totalPages; i++) {
        if (i === 1 || i === totalPages || (i >= this.currentPage - 1 && i <= this.currentPage + 1)) {
          pageButtons += `
            <button class="btn-page ${i === this.currentPage ? 'page-active' : ''}" onclick="window.hsbaApp.goToPage(${i})">
              ${i}
            </button>
          `;
        } else if (i === this.currentPage - 2 || i === this.currentPage + 2) {
          pageButtons += `<span class="page-ellipsis">...</span>`;
        }
      }

      paginationContainer.innerHTML = `
        <div class="pagination-info">
          Hiển thị <strong>${startIndex + 1} - ${Math.min(startIndex + this.pageSize, totalCount)}</strong> trong tổng số <strong>${totalCount}</strong> lỗi
        </div>
        <div class="pagination-controls">
          <button class="btn-page-nav" ${this.currentPage === 1 ? 'disabled' : ''} onclick="window.hsbaApp.goToPage(${this.currentPage - 1})">
            ◀ Trước
          </button>
          <div class="page-numbers">${pageButtons}</div>
          <button class="btn-page-nav" ${this.currentPage === totalPages ? 'disabled' : ''} onclick="window.hsbaApp.goToPage(${this.currentPage + 1})">
            Sau ▶
          </button>
        </div>
      `;
    }
  }

  goToPage(page) {
    this.currentPage = page;
    this.renderRecordsView();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // =========================================================================
  // 2. KHUNG NHẬP NHANH NHIỀU CA RA VIỆN TRỰC TIẾP TRÊN DANH SÁCH (BATCH INLINE)
  // =========================================================================
  initBatchDischargeEntry() {
    const departments = storage.getDepartments();
    const activeDeptSelect = document.getElementById('batch-active-dept');
    const reportDateInput = document.getElementById('batch-report-date');

    const currentActiveDept = storage.getActiveDepartment();

    if (activeDeptSelect) {
      activeDeptSelect.innerHTML = departments.map(d => `
        <option value="${escapeHtml(d.name)}" ${d.name === currentActiveDept ? 'selected' : ''}>
          ${escapeHtml(d.name)}
        </option>
      `).join('');

      activeDeptSelect.onchange = (e) => {
        const selectedDept = e.target.value;
        storage.setActiveDepartment(selectedDept);
        this.renderBatchRows();
        showToast(`Đã đặt khoa mặc định: ${selectedDept}`, 'info');
      };
    }

    if (reportDateInput && !reportDateInput.value) {
      reportDateInput.value = getTodayDateString();
    }

    this.renderBatchRows();
    this.bindBatchEvents();
  }

  renderBatchRows() {
    const rowsBody = document.getElementById('batch-input-rows');
    if (!rowsBody) return;

    const activeDept = storage.getActiveDepartment();

    rowsBody.innerHTML = this.batchRows.map((row, idx) => {
      return `
        <tr data-batch-id="${row.id}">
          <td class="text-center font-mono text-muted text-xs">${idx + 1}</td>
          
          <td>
            <input type="text" class="batch-cell-input font-makcb batch-input-makcb" placeholder="BN-2026-..." value="${escapeHtml(row.maKCB)}" data-id="${row.id}" data-field="maKCB" />
          </td>

          <td>
            <input type="text" class="batch-cell-input font-patient batch-input-patient" placeholder="Nguyễn Văn A..." value="${escapeHtml(row.tenBenhNhan)}" data-id="${row.id}" data-field="tenBenhNhan" />
          </td>

          <td>
            <input type="text" list="dl-nguoi-chi-dinh" class="batch-cell-input batch-input-doctor" placeholder="BS. điều trị..." value="${escapeHtml(row.tenBacSi)}" data-id="${row.id}" data-field="tenBacSi" />
          </td>

          <td>
            <div class="batch-cell-readonly font-medium text-xs">
              🏥 ${escapeHtml(activeDept)}
            </div>
          </td>

          <td class="text-center">
            ${this.batchRows.length > 1 ? `
              <button type="button" class="btn-row-del" onclick="window.hsbaApp.removeBatchRow(${row.id})" title="Xóa dòng này">✖</button>
            ` : '<span class="text-muted text-xs">---</span>'}
          </td>
        </tr>
      `;
    }).join('');

    const countLabel = document.getElementById('batch-rows-count-label');
    const filledRows = this.batchRows.filter(r => r.maKCB.trim() || r.tenBenhNhan.trim()).length;
    if (countLabel) {
      countLabel.textContent = `Đã điền ${filledRows}/${this.batchRows.length} ca`;
    }
  }

  bindBatchEvents() {
    const rowsBody = document.getElementById('batch-input-rows');
    if (rowsBody) {
      rowsBody.oninput = (e) => {
        const target = e.target;
        const id = parseInt(target.getAttribute('data-id'));
        const field = target.getAttribute('data-field');
        const row = this.batchRows.find(r => r.id === id);
        if (row && field) {
          row[field] = target.value;
          const countLabel = document.getElementById('batch-rows-count-label');
          const filledRows = this.batchRows.filter(r => r.maKCB.trim() || r.tenBenhNhan.trim()).length;
          if (countLabel) {
            countLabel.textContent = `Đã điền ${filledRows}/${this.batchRows.length} ca`;
          }
        }
      };

      // Xử lý phím Enter: Chuyển sang trường kế tiếp trong hàng, xong hàng mới tạo hàng mới
      rowsBody.onkeydown = (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          const target = e.target;
          const tr = target.closest('tr');
          if (!tr) return;

          if (target.classList.contains('batch-input-makcb')) {
            // Từ Mã KCB -> nhảy sang Tên Bệnh nhân trong cùng hàng
            const nextInput = tr.querySelector('.batch-input-patient');
            if (nextInput) {
              nextInput.focus();
              nextInput.select();
            }
          } else if (target.classList.contains('batch-input-patient')) {
            // Từ Tên Bệnh nhân -> nhảy sang Tên Bác sĩ trong cùng hàng
            const nextInput = tr.querySelector('.batch-input-doctor');
            if (nextInput) {
              nextInput.focus();
              nextInput.select();
            }
          } else if (target.classList.contains('batch-input-doctor')) {
            // Đã xong hàng: Nhảy sang hàng tiếp theo hoặc tạo thêm hàng mới nếu là hàng cuối
            const nextTr = tr.nextElementSibling;
            if (nextTr) {
              const nextRowMakcb = nextTr.querySelector('.batch-input-makcb');
              if (nextRowMakcb) {
                nextRowMakcb.focus();
                nextRowMakcb.select();
              }
            } else {
              // Hàng cuối cùng -> Tự động thêm hàng mới và focus vào Mã KCB
              this.addBatchRow(true);
            }
          }
        }
      };
    }

    const btnAddRow = document.getElementById('btn-add-batch-row');
    if (btnAddRow) {
      btnAddRow.onclick = () => this.addBatchRow(true);
    }

    const btnSaveBatch = document.getElementById('btn-save-batch-reports');
    if (btnSaveBatch) {
      btnSaveBatch.onclick = () => this.saveBatchReports();
    }
  }

  addBatchRow(shouldFocus = false) {
    const newId = this.nextBatchRowId++;
    this.batchRows.push({ id: newId, maKCB: '', tenBenhNhan: '', tenBacSi: '' });
    this.renderBatchRows();

    if (shouldFocus) {
      setTimeout(() => {
        const newInputs = document.querySelectorAll('.batch-input-makcb');
        if (newInputs.length > 0) {
          newInputs[newInputs.length - 1].focus();
        }
      }, 50);
    }
  }

  removeBatchRow(rowId) {
    if (this.batchRows.length <= 1) return;
    this.batchRows = this.batchRows.filter(r => r.id !== rowId);
    this.renderBatchRows();
  }

  saveBatchReports() {
    const reportDateInput = document.getElementById('batch-report-date');
    const ngayBaoCao = reportDateInput ? reportDateInput.value : getTodayDateString();
    const activeDept = storage.getActiveDepartment();

    const validRows = this.batchRows.filter(r => r.maKCB.trim() && r.tenBenhNhan.trim()).map(r => ({
      ngayBaoCao,
      maKCB: r.maKCB.trim(),
      tenBenhNhan: r.tenBenhNhan.trim(),
      tenBacSi: r.tenBacSi.trim(),
      phong: activeDept
    }));

    if (!validRows.length) {
      showToast('Vui lòng nhập ít nhất 1 ca ra viện (gồm Mã KCB và Tên BN)!', 'warning');
      return;
    }

    const created = storage.addBatchDischargeReports(validRows);
    showToast(`🎉 Đã lưu thành công ${created.length} ca ra viện cho ${activeDept}!`, 'success', 5000);

    // Reset lại 1 dòng trống ban đầu
    this.batchRows = [
      { id: this.nextBatchRowId++, maKCB: '', tenBenhNhan: '', tenBacSi: '' }
    ];
    this.renderBatchRows();

    // Chuyển bộ lọc ngày về ngày vừa lưu để người dùng thấy ngay
    this.dischargeFilters.date = ngayBaoCao;
    const dateInput = document.getElementById('discharge-date-filter');
    if (dateInput) dateInput.value = ngayBaoCao;

    this.renderDischargeView();
  }

  // =========================================================================
  // 3. VIEW BÁO CÁO VÀ CHỐT RA VIỆN (4 KHÂU KIỂM LỖI & CHỐT THÔNG CỔNG)
  // =========================================================================
  changeDischargeDate(delta) {
    const current = this.dischargeFilters.date || getTodayDateString();
    const d = new Date(current);
    d.setDate(d.getDate() + delta);
    const newDate = d.toISOString().split('T')[0];
    this.dischargeFilters.date = newDate;
    const dateInput = document.getElementById('discharge-date-filter');
    if (dateInput) dateInput.value = newDate;
    this.renderDischargeView();
  }
  getFilteredDischargeReports() {
    let reports = storage.getDischargeReports();

    // Lọc theo ngày báo cáo (chỉ hiển thị theo từng ngày)
    if (this.dischargeFilters.date) {
      reports = reports.filter(r => r.ngayBaoCao === this.dischargeFilters.date);
    }

    if (this.dischargeFilters.keyword) {
      const kw = removeVietnameseTones(this.dischargeFilters.keyword);
      reports = reports.filter(r => {
        const ma = removeVietnameseTones(r.maKCB || '');
        const bn = removeVietnameseTones(r.tenBenhNhan || '');
        const bs = removeVietnameseTones(r.tenBacSi || '');
        const p = removeVietnameseTones(r.phong || '');
        const note = removeVietnameseTones(r.baoCaoTinhTrangSuaLoi || '');
        return ma.includes(kw) || bn.includes(kw) || bs.includes(kw) || p.includes(kw) || note.includes(kw);
      });
    }

    if (this.dischargeFilters.dept) {
      const kwDept = removeVietnameseTones(this.dischargeFilters.dept);
      reports = reports.filter(r => removeVietnameseTones(r.phong || '').includes(kwDept));
    }

    if (this.dischargeFilters.gate) {
      reports = reports.filter(r => r.chotThongCong === this.dischargeFilters.gate);
    }

    // Sắp xếp: Chưa đồng ý thông cổng lên trước
    reports.sort((a, b) => {
      const gateA = a.chotThongCong === 'CO' ? 1 : 0;
      const gateB = b.chotThongCong === 'CO' ? 1 : 0;
      if (gateA !== gateB) return gateA - gateB;
      return (b.ngayBaoCao || '').localeCompare(a.ngayBaoCao || '');
    });

    return reports;
  }

  renderDischargeView() {
    const reports = this.getFilteredDischargeReports();
    const canChot = storage.canChotThongCong();

    const dateFilterInput = document.getElementById('discharge-date-filter');
    if (dateFilterInput && this.dischargeFilters.date && dateFilterInput.value !== this.dischargeFilters.date) {
      dateFilterInput.value = this.dischargeFilters.date;
    }

    const countBadge = document.getElementById('discharge-total-count');
    if (countBadge) {
      countBadge.textContent = `${reports.length} ca ra viện`;
    }

    const renderStepBtn = (stepKey, label, stepData, reportId) => {
      const hasError = stepData && stepData.status === 'CO_LOI';
      const note = stepData && stepData.note ? ` - ${stepData.note}` : '';
      const titleText = hasError ? `${label}: Có lỗi${note} (Bấm để sửa nhanh)` : `${label}: Đã kiểm, không lỗi (Bấm để cập nhật)`;
      return `
        <button type="button" class="btn-step-badge ${hasError ? 'step-mini-fail' : 'step-mini-pass'}" 
          onclick="window.hsbaApp.modalController.openQuickStepCheckModal('${reportId}', '${stepKey}')"
          title="${escapeHtml(titleText)}">
          ${hasError ? '⚠️' : '✓'} ${label}
        </button>
      `;
    };

    const tableBody = document.getElementById('discharge-table-body');
    const cardsContainer = document.getElementById('discharge-cards-container');

    if (!reports.length) {
      const emptyHtml = `
        <div class="empty-state">
          <div class="empty-icon">🏥</div>
          <h4>Chưa có hồ sơ báo cáo ra viện nào</h4>
          <p>Nhập các ca ra viện vào bảng phía trên và bấm <strong>💾 Lưu tất cả</strong> để các bộ phận kiểm duyệt</p>
        </div>
      `;
      if (tableBody) tableBody.innerHTML = `<tr><td colspan="8">${emptyHtml}</td></tr>`;
      if (cardsContainer) cardsContainer.innerHTML = emptyHtml;
      return;
    }

    // 1. TABLE DESKTOP
    if (tableBody) {
      tableBody.innerHTML = reports.map((r, index) => {
        const isPassed = r.chotThongCong === 'CO';

        return `
          <tr class="table-row ${!isPassed ? 'row-unresolved' : ''}">
            <td class="text-center font-mono text-muted text-xs">${index + 1}</td>
            
            <td class="font-mono text-xs text-center font-bold">
              📅 ${formatDateVN(r.ngayBaoCao)}
            </td>

            <td>
              <div class="font-bold text-patient">${escapeHtml(r.tenBenhNhan)}</div>
              <div class="text-xs"><span class="badge-ma-kcb">${escapeHtml(r.maKCB)}</span></div>
            </td>

            <td>
              <div class="font-medium text-primary">👨‍⚕️ ${escapeHtml(r.tenBacSi)}</div>
              <div class="text-xs text-muted" style="margin-top: 2px;">🏥 ${escapeHtml(r.phong)}</div>
            </td>

            <td>
              <div class="steps-badge-grid">
                ${renderStepBtn('duoc', 'Dược', r.kiemDuoc, r.id)}
                ${renderStepBtn('ketoan', 'KT-BH', r.kiemKeToanBH, r.id)}
                ${renderStepBtn('khth', 'KHTH', r.kiemKHTH, r.id)}
                ${renderStepBtn('it', 'IT', r.kiemIT, r.id)}
              </div>
            </td>

            <td>
              <div class="cell-error-text text-xs" title="${escapeHtml(r.baoCaoTinhTrangSuaLoi || 'Chưa có báo cáo sửa lỗi')}">
                ${r.baoCaoTinhTrangSuaLoi ? `📝 ${escapeHtml(r.baoCaoTinhTrangSuaLoi)}` : '<span class="text-muted italic">--- Chưa cập nhật ---</span>'}
              </div>
            </td>

            <td class="text-center">
              ${isPassed ? `
                <div class="badge-gate-pass" title="${r.nguoiThongCong ? `Chốt bởi: ${r.nguoiThongCong} (${formatDateTimeVN(r.ngayThongCong)})` : 'Đồng ý thông cổng'}">
                  <span>🟢 ĐỒNG Ý</span>
                </div>
              ` : `
                <div class="badge-gate-pending" title="${canChot ? 'Bấm nút Sửa để chốt thông cổng' : 'Chưa đồng ý thông cổng (Chờ KHTH duyệt)'}">
                  <span>🔴 CHƯA</span>
                </div>
              `}
            </td>

            <td class="text-center">
              <button class="btn-action-icon btn-edit" onclick="window.hsbaApp.modalController.openEditDischargeReportModal('${r.id}')" title="Kiểm lỗi các khâu & Chốt thông cổng">
                ✏️
              </button>
            </td>
          </tr>
        `;
      }).join('');
    }

    // 2. CARDS MOBILE
    if (cardsContainer) {
      cardsContainer.innerHTML = reports.map(r => {
        const isPassed = r.chotThongCong === 'CO';

        return `
          <div class="mobile-error-card ${!isPassed ? 'card-unresolved' : ''}">
            <div class="card-top-bar">
              <div class="card-patient-info">
                <span class="card-ma-kcb">${escapeHtml(r.maKCB)}</span>
                <h4 class="card-patient-name">${escapeHtml(r.tenBenhNhan)}</h4>
              </div>
              <div>
                ${isPassed ? '<span class="badge-gate-pass">🟢 ĐỒNG Ý THÔNG CỔNG</span>' : '<span class="badge-gate-pending">🔴 CHƯA ĐỒNG Ý</span>'}
              </div>
            </div>

            <div class="card-meta-grid">
              <div>📅 Báo cáo: <strong>${formatDateVN(r.ngayBaoCao)}</strong></div>
              <div>👨‍⚕️ BS: <strong>${escapeHtml(r.tenBacSi)}</strong></div>
              <div style="grid-column: 1 / -1;">🏥 Phòng/Khoa: <strong>${escapeHtml(r.phong)}</strong></div>
            </div>

            <div style="margin: 8px 0; background: #f8fafc; padding: 8px; border-radius: 6px;">
              <strong class="text-xs block" style="margin-bottom: 4px;">4 Khâu kiểm lỗi (Bấm để đổi nhanh):</strong>
              <div class="steps-badge-grid">
                ${renderStepBtn('duoc', 'Dược', r.kiemDuoc, r.id)}
                ${renderStepBtn('ketoan', 'Kế toán BH', r.kiemKeToanBH, r.id)}
                ${renderStepBtn('khth', 'KHTH', r.kiemKHTH, r.id)}
                ${renderStepBtn('it', 'IT', r.kiemIT, r.id)}
              </div>
            </div>

            ${r.baoCaoTinhTrangSuaLoi ? `
              <div class="card-response-box" style="margin-bottom: 8px;">
                <strong>Tình trạng sửa lỗi:</strong> ${escapeHtml(r.baoCaoTinhTrangSuaLoi)}
              </div>
            ` : ''}

            <div class="card-footer-actions">
              <button class="btn btn-sm btn-outline flex-1" onclick="window.hsbaApp.modalController.openEditDischargeReportModal('${r.id}')">
                ✏️ Kiểm lỗi 4 khâu & Chốt cổng
              </button>
            </div>
          </div>
        `;
      }).join('');
    }
  }

  // ==========================================
  // 4. VIEW TỔNG QUAN & BÁO CÁO (DASHBOARD - SOFT MEDICAL STYLE)
  // ==========================================
  renderDashboardView() {
    const records = storage.getRecords();
    const dischargeReports = storage.getDischargeReports();
    const departments = storage.getDepartments();
    const currentRole = storage.getRoleDetails();

    const total = records.length;
    const chuaSua = records.filter(r => r.trangThaiLoi === 'CHƯA SỬA').length;
    const dangSua = records.filter(r => r.trangThaiLoi === 'ĐÃ XEM - ĐANG SỬA').length;
    const daXong = records.filter(r => r.trangThaiLoi === 'ĐÃ XONG').length;
    const unresolved = chuaSua + dangSua;

    const daThongCong = dischargeReports.filter(r => r.chotThongCong === 'CO').length;
    const totalDischarge = dischargeReports.length;
    const gateRatio = totalDischarge > 0 ? Math.round((daThongCong / totalDischarge) * 100) : 0;

    const khanCap = records.filter(r => r.mucDoCanhBao === 'Khẩn cấp').length;
    const zaloLogs = storage.getZaloLogs();

    // 1. Cập nhật các KPI Metrics chính
    const elTotal = document.getElementById('dash-total-errors');
    if (elTotal) elTotal.textContent = total;

    const elPending = document.getElementById('dash-pending-errors');
    if (elPending) elPending.textContent = unresolved;

    const elUrgent = document.getElementById('dash-urgent-count');
    if (elUrgent) elUrgent.textContent = `${khanCap} lỗi khẩn cấp`;

    const elGate = document.getElementById('dash-gate-passed');
    if (elGate) elGate.textContent = `${daThongCong}/${totalDischarge}`;

    const elGateRatio = document.getElementById('dash-gate-ratio');
    if (elGateRatio) elGateRatio.textContent = `${gateRatio}% ca ra viện`;

    const elZalo = document.getElementById('dash-zalo-sent');
    if (elZalo) elZalo.textContent = `${zaloLogs.length} tin`;

    // 2. Tình hình 4 Khâu Kiểm Lỗi Ra Viện
    const stepsSummaryContainer = document.getElementById('dash-steps-summary-container');
    if (stepsSummaryContainer) {
      const steps = [
        { key: 'kiemDuoc', name: 'Khâu Dược', icon: '💊', desc: 'Thuốc, VTYT, Kháng sinh' },
        { key: 'kiemKeToanBH', name: 'Khâu Kế toán BH', icon: '💵', desc: 'Viện phí, Mức hưởng BHYT' },
        { key: 'kiemKHTH', name: 'Khâu KHTH', icon: '📋', desc: 'Hồ sơ, Chữ ký, Biên bản' },
        { key: 'kiemIT', name: 'Khâu IT', icon: '💻', desc: 'Dữ liệu HIS, Chuẩn hóa XML' }
      ];

      if (!totalDischarge) {
        stepsSummaryContainer.innerHTML = '<p class="text-muted text-center p-4">Chưa có dữ liệu hồ sơ ra viện</p>';
      } else {
        stepsSummaryContainer.innerHTML = steps.map(s => {
          const passCount = dischargeReports.filter(r => r[s.key] && r[s.key].status === 'KHONG_LOI').length;
          const errorCount = dischargeReports.filter(r => r[s.key] && r[s.key].status === 'CO_LOI').length;
          const passPercent = Math.round((passCount / totalDischarge) * 100);

          return `
            <div class="dash-step-item">
              <div class="dash-step-header">
                <span class="font-medium text-main">${s.icon} ${s.name} <small class="text-muted">(${s.desc})</small></span>
                <span class="font-mono text-xs font-semibold ${errorCount > 0 ? 'text-danger' : 'text-success'}">
                  ${errorCount > 0 ? `⚠️ ${errorCount} lỗi` : '✓ 100% đạt'}
                </span>
              </div>
              <div class="dash-progress-bar" title="Đạt: ${passCount} | Có lỗi: ${errorCount}">
                <div class="progress-fill-pass" style="width: ${passPercent}%"></div>
                <div class="progress-fill-fail" style="width: ${100 - passPercent}%"></div>
              </div>
            </div>
          `;
        }).join('');
      }
    }

    // 3. Thống kê theo Khoa/Phòng
    const deptStatsContainer = document.getElementById('dash-dept-stats-container') || document.getElementById('dash-dept-stats');
    if (deptStatsContainer) {
      const deptCounts = departments.map(d => {
        const deptClean = (d.name || '').trim().toLowerCase();
        const deptRecords = records.filter(r => (r.khoaPhong || '').trim().toLowerCase() === deptClean);
        const deptChuaSua = deptRecords.filter(r => r.trangThaiLoi === 'CHƯA SỬA' || r.trangThaiLoi === 'ĐÃ XEM - ĐANG SỬA').length;
        return {
          name: d.name,
          total: deptRecords.length,
          pending: deptChuaSua,
          done: deptRecords.length - deptChuaSua
        };
      }).filter(d => d.total > 0).sort((a, b) => b.pending - a.pending || b.total - a.total);

      if (!deptCounts.length) {
        deptStatsContainer.innerHTML = '<p class="text-muted text-center p-4">Chưa có dữ liệu theo khoa phòng</p>';
      } else {
        deptStatsContainer.innerHTML = deptCounts.map(d => `
          <div class="dept-stat-row">
            <div class="dept-stat-header">
              <span class="dept-stat-name font-medium">${escapeHtml(d.name)}</span>
              <div class="dept-stat-badge">
                ${d.pending > 0 ? `<span class="badge-tag badge-status-danger">${d.pending} chưa xử lý</span>` : '<span class="badge-tag badge-status-success">Đã hoàn thành</span>'}
                <span class="badge-tag badge-status-neutral">Tổng: ${d.total}</span>
              </div>
            </div>
            <div class="dash-progress-bar">
              <div class="progress-fill-fail" style="width: ${(d.pending / d.total) * 100}%" title="Chưa xử lý: ${d.pending}"></div>
              <div class="progress-fill-pass" style="width: ${(d.done / d.total) * 100}%" title="Đã xong: ${d.done}"></div>
            </div>
          </div>
        `).join('');
      }
    }
  }

  // ==========================================
  // 5. VIEW CÀI ĐẶT (SETTINGS - PHÂN QUYỀN TRUY CẬP)
  // ==========================================
  renderSettingsView() {
    const canAccess = storage.canAccessSettings();
    const authContainer = document.getElementById('settings-authorized-container');
    const unauthContainer = document.getElementById('settings-unauthorized-container');

    if (!canAccess) {
      if (authContainer) authContainer.style.display = 'none';
      if (unauthContainer) {
        unauthContainer.style.display = 'block';
        const roleDetails = storage.getRoleDetails();
        unauthContainer.innerHTML = `
          <div class="settings-locked-card">
            <div class="settings-lock-icon">🔒</div>
            <h3 class="settings-lock-title">Phân Hệ Cài Đặt Hệ Thống Bị Khóa</h3>
            <p class="settings-lock-desc">
              Bạn hiện đang làm việc ở vai trò <strong>${escapeHtml(roleDetails.name)}</strong>.<br>
              Khu vực Cài đặt hệ thống (Cấu hình Zalo, Ma trận phân quyền, Danh mục Khoa/Phòng, Profile Nhân sự & Sao lưu dữ liệu) chỉ được cấp phép truy cập cho <strong>Quản trị viên (Admin)</strong> và <strong>Phòng Công nghệ Thông tin (IT)</strong>.
            </p>
            <div class="settings-lock-actions">
              <button class="btn btn-primary" onclick="window.hsbaApp.switchRoleAndUnlock('ADMIN')">
                <span>👑 Chuyển sang tài khoản Quản trị viên (Admin)</span>
              </button>
              <button class="btn btn-outline" onclick="window.hsbaApp.switchTab('records')">
                <span>📋 Quay lại Danh sách lỗi HSBA</span>
              </button>
            </div>
          </div>
        `;
      }
      return;
    }

    if (authContainer) authContainer.style.display = 'block';
    if (unauthContainer) unauthContainer.style.display = 'none';

    this.renderZaloSettings();
    this.renderPermissionsSettings();
    this.renderDepartmentSettings();
    this.renderStaffSettings();
    this.bindSettingsEvents();

    // Hiển thị đúng phân khu subtab đang chọn
    const currentSub = this.settingsSubTab || 'zalo';
    const allSubs = ['zalo', 'permissions', 'departments', 'staff', 'supabase', 'backup'];
    allSubs.forEach(s => {
      const el = document.getElementById(`settings-sec-${s}`);
      if (el) el.style.display = s === currentSub ? 'block' : 'none';
    });
    document.querySelectorAll('.subnav-pill-btn, .settings-subtab-btn, [data-subtab]').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-subtab') === currentSub);
    });
  }

  bindSettingsEvents() {
    const subTabButtons = document.querySelectorAll('.subnav-pill-btn, .settings-subtab-btn, [data-subtab]');
    subTabButtons.forEach(btn => {
      btn.onclick = (e) => {
        const subTab = e.currentTarget.getAttribute('data-subtab');
        if (!subTab) return;
        this.settingsSubTab = subTab;
        subTabButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        const allSubs = ['zalo', 'permissions', 'departments', 'staff', 'supabase', 'backup'];
        allSubs.forEach(s => {
          const sec = document.getElementById(`settings-sec-${s}`) || (s === 'departments' ? document.getElementById('settings-sec-depts') : null);
          if (sec) sec.style.display = s === subTab ? 'block' : 'none';
        });

        // Tự động re-render dữ liệu tương ứng
        if (subTab === 'departments') this.renderDepartmentSettings();
        if (subTab === 'staff') this.renderStaffSettings();
        if (subTab === 'permissions') this.renderPermissionsSettings();
        if (subTab === 'zalo') this.renderZaloSettings();
        if (subTab === 'supabase') this.renderSupabaseSettings();
      };
    });

    const formZaloConfig = document.getElementById('form-zalo-config');
    if (formZaloConfig) {
      formZaloConfig.onsubmit = (e) => {
        e.preventDefault();
        const config = {
          enabled: document.getElementById('zalo-cfg-enabled').checked,
          autoReminder: document.getElementById('zalo-cfg-auto').checked,
          reminderIntervalHours: parseInt(document.getElementById('zalo-cfg-interval').value) || 2,
          oaName: document.getElementById('zalo-cfg-oaname').value.trim(),
          oaId: document.getElementById('zalo-cfg-oaid').value.trim(),
          messageTemplate: document.getElementById('zalo-cfg-template').value
        };
        zaloService.saveConfig(config);
        showToast('Đã lưu cấu hình tin nhắn Zalo tự động (2 giờ/lần)!', 'success');
      };
    }

    const btnTriggerBatchZalo = document.getElementById('btn-trigger-batch-zalo');
    if (btnTriggerBatchZalo) {
      btnTriggerBatchZalo.onclick = () => {
        zaloService.checkAndDispatchAutoReminders();
        showToast('Đã quét và gửi tin nhắn Zalo nhắc nhở cho tất cả các lỗi chưa hoàn thành!', 'info', 4000);
        this.renderZaloSettings();
      };
    }

    const btnSavePerms = document.getElementById('btn-save-permissions');
    if (btnSavePerms) {
      btnSavePerms.onclick = () => {
        const currentMatrix = storage.getPermissionsMatrix();
        storage.savePermissionsMatrix(currentMatrix);
        showToast('💾 Đã lưu thành công Ma trận Phân quyền Thao tác!', 'success');
        this.updateRoleUI();
      };
    }

    const btnResetPerms = document.getElementById('btn-reset-permissions');
    if (btnResetPerms) {
      btnResetPerms.onclick = () => {
        this.modalController.openConfirmModal({
          title: 'Khôi phục ma trận phân quyền mặc định',
          message: 'Bạn có chắc chắn muốn đặt lại toàn bộ ma trận phân quyền về cấu hình chuẩn ban đầu của bệnh viện?',
          isDanger: true,
          confirmText: 'Khôi phục ngay',
          onConfirm: () => {
            storage.savePermissionsMatrix(PERMISSION_COLUMNS);
            showToast('Đã khôi phục ma trận phân quyền gốc thành công!', 'success');
            this.renderPermissionsSettings();
            this.updateRoleUI();
          }
        });
      };
    }

    const btnAddDept = document.getElementById('btn-add-dept');
    if (btnAddDept) {
      btnAddDept.onclick = () => this.modalController.openDepartmentModal();
    }

    const btnAddStaff = document.getElementById('btn-add-staff');
    if (btnAddStaff) {
      btnAddStaff.onclick = () => this.modalController.openStaffModal();
    }

    const btnResetDefaults = document.getElementById('btn-reset-defaults');
    if (btnResetDefaults) {
      btnResetDefaults.onclick = () => {
        this.modalController.openConfirmModal({
          title: 'Khôi phục dữ liệu mẫu ban đầu',
          message: 'Thao tác này sẽ đặt lại danh sách Khoa/Phòng, Nhân viên, Báo cáo ra viện và Bản ghi lỗi mẫu chuẩn.',
          isDanger: true,
          confirmText: 'Khôi phục ngay',
          onConfirm: () => {
            storage.resetToDefaults();
            showToast('Đã khôi phục dữ liệu mẫu thành công!', 'success');
            this.refreshAllViews();
          }
        });
      };
    }

    const btnExportBackup = document.getElementById('btn-export-backup');
    if (btnExportBackup) {
      btnExportBackup.onclick = () => {
        const json = storage.exportBackup();
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Backup_TheoDoiHSBA_${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showToast('Đã tải xuống file sao lưu JSON!', 'success');
      };
    }

    const inputImportBackup = document.getElementById('input-import-backup');
    if (inputImportBackup) {
      inputImportBackup.onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
          const success = storage.importBackup(event.target.result);
          if (success) {
            showToast('Đã nhập dữ liệu sao lưu thành công!', 'success');
            this.refreshAllViews();
          } else {
            showToast('File sao lưu không hợp lệ!', 'error');
          }
        };
        reader.readAsText(file);
      };
    }

    // --- SUPABASE CLOUD EVENTS ---
    const formSupabaseConfig = document.getElementById('form-supabase-config');
    if (formSupabaseConfig) {
      formSupabaseConfig.onsubmit = async (e) => {
        e.preventDefault();
        const url = document.getElementById('supabase-cfg-url').value.trim();
        const key = document.getElementById('supabase-cfg-key').value.trim();
        supabaseService.saveConfig(url, key);
        showToast('Đang kết nối lại tới Supabase...', 'info');
        const connected = await supabaseService.testConnection();
        if (connected) {
          showToast('🎉 Đã kết nối thành công tới Supabase Cloud Database!', 'success');
        } else {
          showToast('⚠️ Không thể kết nối tới Supabase. Vui lòng kiểm tra lại URL và Key.', 'warning');
        }
        this.renderSupabaseSettings();
      };
    }

    const btnTestSupabase = document.getElementById('btn-test-supabase');
    if (btnTestSupabase) {
      btnTestSupabase.onclick = async () => {
        showToast('Đang kiểm tra kết nối Supabase...', 'info', 2000);
        const connected = await supabaseService.testConnection();
        if (connected) {
          showToast('🟢 Kết nối Supabase Cloud Database đang hoạt động rất tốt!', 'success');
        } else {
          showToast('🔴 Không thể kết nối tới Supabase.', 'error');
        }
        this.renderSupabaseSettings();
      };
    }

    const btnPushSupabase = document.getElementById('btn-push-supabase');
    if (btnPushSupabase) {
      btnPushSupabase.onclick = async () => {
        showToast('⏳ Đang đẩy toàn bộ dữ liệu lên Supabase Cloud...', 'info', 3000);
        const res = await supabaseService.pushAllLocalDataToCloud(storage);
        if (res.success) {
          showToast('🎉 ' + res.message, 'success', 5000);
        } else {
          showToast('⚠️ ' + res.message, 'error', 5000);
        }
        this.renderSupabaseSettings();
      };
    }

    const btnPullSupabase = document.getElementById('btn-pull-supabase');
    if (btnPullSupabase) {
      btnPullSupabase.onclick = async () => {
        showToast('⏳ Đang tải dữ liệu từ Supabase Cloud...', 'info', 3000);
        const res = await supabaseService.pullAllCloudDataToLocal(storage);
        if (res.success) {
          showToast('🎉 ' + res.message, 'success', 5000);
          this.refreshAllViews();
        } else {
          showToast('⚠️ ' + res.message, 'error', 5000);
        }
        this.renderSupabaseSettings();
      };
    }

    // Đăng ký nhận thông báo thay đổi trạng thái Supabase
    supabaseService.onStatusChange(({ connected, message }) => {
      this.updateSupabaseStatusUI(connected, message);
    });

    const headerCloudStatus = document.getElementById('header-cloud-status');
    if (headerCloudStatus) {
      headerCloudStatus.onclick = () => {
        this.switchView('settings');
        this.settingsSubTab = 'supabase';
        this.renderSettingsView();
        this.renderSupabaseSettings();
      };
    }
  }

  // Render thông tin cấu hình Supabase
  renderSupabaseSettings() {
    const urlEl = document.getElementById('supabase-cfg-url');
    if (urlEl) urlEl.value = supabaseService.getUrl();

    const keyEl = document.getElementById('supabase-cfg-key');
    if (keyEl) keyEl.value = supabaseService.getKey();

    this.updateSupabaseStatusUI(supabaseService.isConnected, supabaseService.isConnected ? 'Đã kết nối Cloud Database (Realtime)' : 'Chưa kết nối Cloud Database');
  }

  updateSupabaseStatusUI(connected, message) {
    const badge = document.getElementById('supabase-status-badge');
    const text = document.getElementById('supabase-status-text');
    if (badge && text) {
      if (connected) {
        badge.style.background = '#dcfce7';
        badge.style.color = '#15803d';
        badge.style.borderColor = '#bbf7d0';
        text.textContent = '🟢 Đã kết nối Cloud';
      } else {
        badge.style.background = '#fee2e2';
        badge.style.color = '#b91c1c';
        badge.style.borderColor = '#fecaca';
        text.textContent = '🔴 ' + (message || 'Mất kết nối');
      }
    }

    // Update Header Pill
    const headerDot = document.getElementById('header-cloud-dot');
    const headerText = document.getElementById('header-cloud-text');
    if (headerDot && headerText) {
      if (connected) {
        headerDot.className = 'cloud-status-dot';
        headerText.textContent = '☁️ Cloud Sync';
      } else {
        headerDot.className = 'cloud-status-dot dot-offline';
        headerText.textContent = '☁️ Offline';
      }
    }
  }

  // Render cấu hình Zalo và Nhật ký gửi tin
  renderZaloSettings() {
    const config = zaloService.getConfig();
    const logs = zaloService.getSystemZaloLogs();

    const enabledEl = document.getElementById('zalo-cfg-enabled');
    if (enabledEl) enabledEl.checked = !!config.enabled;

    const autoEl = document.getElementById('zalo-cfg-auto');
    if (autoEl) autoEl.checked = !!config.autoReminder;

    const intervalEl = document.getElementById('zalo-cfg-interval');
    if (intervalEl) intervalEl.value = config.reminderIntervalHours || 2;

    const oaNameEl = document.getElementById('zalo-cfg-oaname');
    if (oaNameEl) oaNameEl.value = config.oaName || '';

    const oaIdEl = document.getElementById('zalo-cfg-oaid');
    if (oaIdEl) oaIdEl.value = config.oaId || '';

    const templateEl = document.getElementById('zalo-cfg-template');
    if (templateEl) templateEl.value = config.messageTemplate || '';

    const logsTableBody = document.getElementById('settings-zalo-logs-body');
    if (logsTableBody) {
      if (!logs.length) {
        logsTableBody.innerHTML = `<tr><td colspan="6" class="text-center text-muted p-4">Chưa có nhật ký gửi tin Zalo nào</td></tr>`;
      } else {
        logsTableBody.innerHTML = logs.slice(0, 30).map((l, index) => {
          return `
            <tr>
              <td class="text-center font-mono text-muted text-xs">${index + 1}</td>
              <td><span class="text-xs font-bold">${formatDateTimeVN(l.time)}</span></td>
              <td>
                <div class="font-bold text-primary">${escapeHtml(l.recipientName)}</div>
                <div class="text-xs font-mono text-muted">${escapeHtml(l.targetLabel || l.phone || l.zaloId || '---')}</div>
              </td>
              <td>
                <div><strong>${escapeHtml(l.tenBenhNhan || '')}</strong> (${escapeHtml(l.maKCB || '')})</div>
                <div class="text-xs text-muted">${escapeHtml(l.khoaPhong || '')}</div>
              </td>
              <td class="text-center">
                ${l.isAuto ? '<span class="perm-tag perm-tag-yes">🤖 Tự động 2h</span>' : '<span class="perm-tag" style="background:#e0f2fe;color:#0369a1;">👤 Thủ công</span>'}
              </td>
              <td>
                <div class="cell-error-text text-xs" style="-webkit-line-clamp: 1;" title="${escapeHtml(l.content)}">${escapeHtml(l.content)}</div>
              </td>
            </tr>
          `;
        }).join('');
      }
    }
  }

  // Render Ma trận Phân quyền Cột Dữ liệu (Cho phép Quản trị viên Chỉnh sửa)
  renderPermissionsSettings() {
    const matrix = storage.getPermissionsMatrix();
    const tableBody = document.getElementById('settings-permissions-table-body');
    if (!tableBody) return;

    const isAdmin = storage.getCurrentRole() === 'ADMIN' || storage.getCurrentRole() === 'IT';

    tableBody.innerHTML = matrix.map((item, index) => {
      const renderToggle = (roleKey, allowed) => {
        return `
          <div class="perm-switch-wrap" style="display: flex; justify-content: center;">
            <label class="perm-toggle-label" title="${isAdmin ? `Bật/Tắt quyền cho ${roleKey.toUpperCase()}` : 'Chỉ Quản trị viên mới được sửa'}">
              <input type="checkbox" class="perm-matrix-checkbox" data-index="${index}" data-key="${item.key}" data-role="${roleKey}" ${allowed ? 'checked' : ''} ${!isAdmin ? 'disabled' : ''} />
              <span class="perm-toggle-slider"></span>
            </label>
          </div>
        `;
      };

      return `
        <tr>
          <td class="text-center font-mono text-muted">${index + 1}</td>
          <td>
            <div class="font-bold text-main">${escapeHtml(item.label)}</div>
            <div class="text-xs font-mono text-muted">${escapeHtml(item.key)}</div>
          </td>
          <td>
            <span class="text-xs text-muted">${escapeHtml(item.desc || '---')}</span>
          </td>
          <td class="text-center">
            ${renderToggle('duoc', item.duoc)}
          </td>
          <td class="text-center">
            ${renderToggle('ketoan', item.ketoan)}
          </td>
          <td class="text-center">
            ${renderToggle('khth', item.khth)}
          </td>
          <td class="text-center">
            ${renderToggle('it', item.it)}
          </td>
          <td class="text-center">
            ${renderToggle('nhom1', item.nhom1)}
          </td>
          <td class="text-center">
            ${renderToggle('nhom2', item.nhom2)}
          </td>
        </tr>
      `;
    }).join('');

    // Gắn sự kiện thay đổi trực tiếp trên từng checkbox
    tableBody.querySelectorAll('.perm-matrix-checkbox').forEach(cb => {
      cb.onchange = (e) => {
        const idx = parseInt(e.target.getAttribute('data-index'));
        const role = e.target.getAttribute('data-role');
        const checked = e.target.checked;
        const currentMatrix = storage.getPermissionsMatrix();
        if (currentMatrix[idx]) {
          currentMatrix[idx][role] = checked;
          storage.savePermissionsMatrix(currentMatrix);
          const roleNames = { duoc: 'Khoa Dược', ketoan: 'Kế toán BH', khth: 'KHTH', it: 'CNTT (IT)', nhom1: 'Tổ Rà Soát', nhom2: 'Khoa/Bác sĩ' };
          const roleDisplayName = roleNames[role] || role;
          showToast(`Đã đổi quyền [${currentMatrix[idx].label}] cho ${roleDisplayName}: ${checked ? '✓ BẬT' : '🔒 KHÓA'}`, 'success', 2500);
          this.updateRoleUI();
        }
      };
    });
  }

  // Render bảng danh mục Khoa/Phòng
  renderDepartmentSettings() {
    const departments = storage.getDepartments();
    const staffList = storage.getStaff();
    const records = storage.getRecords();
    const tableBody = document.getElementById('settings-depts-table-body');

    if (!tableBody) return;

    tableBody.innerHTML = departments.map((dept, index) => {
      const deptClean = (dept.name || '').trim().toLowerCase();
      const staffCount = staffList.filter(s => (s.department || '').trim().toLowerCase() === deptClean).length;
      const recordCount = records.filter(r => (r.khoaPhong || '').trim().toLowerCase() === deptClean).length;

      return `
        <tr>
          <td class="text-center font-mono text-muted">${index + 1}</td>
          <td>
            <div class="font-bold text-main">${escapeHtml(dept.name)}</div>
          </td>
          <td><span class="badge-dept-code font-mono">${escapeHtml(dept.code || '---')}</span></td>
          <td class="text-center"><span class="badge-tag">${staffCount} nhân sự</span></td>
          <td class="text-center"><span class="badge-tag ${recordCount > 0 ? 'badge-status-danger font-semibold' : ''}">${recordCount} lỗi HSBA</span></td>
          <td class="text-center">
            <div class="action-buttons-group">
              <button class="btn-action-icon btn-edit" onclick="window.hsbaApp.modalController.openDepartmentModal('${dept.id}')" title="Sửa tên khoa">✏️</button>
              <button class="btn-action-icon btn-danger" onclick="window.hsbaApp.deleteDepartment('${dept.id}', '${escapeHtml(dept.name)}')" title="Xóa khoa">🗑️</button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  }

  deleteDepartment(id, name) {
    this.modalController.openConfirmModal({
      title: 'Xóa Khoa/Phòng',
      message: `Bạn có chắc muốn xóa <strong>${escapeHtml(name)}</strong> khỏi danh mục?`,
      isDanger: true,
      confirmText: 'Xóa khoa',
      onConfirm: () => {
        storage.deleteDepartment(id);
        showToast(`Đã xóa khoa ${name}`, 'success');
        this.renderDepartmentSettings();
        this.populateFilterSuggestions();
      }
    });
  }

  // Render bảng danh sách Profile Nhân viên
  renderStaffSettings() {
    const staffList = storage.getStaff();
    const tableBody = document.getElementById('settings-staff-table-body');

    if (!tableBody) return;

    tableBody.innerHTML = staffList.map((staff, index) => {
      const role = ROLES[staff.defaultRole] || ROLES.NHOM_2;
      const targetPhone = staff.phone ? staff.phone.replace(/[^0-9]/g, '') : null;
      const targetZaloId = staff.zaloId ? staff.zaloId.trim() : null;
      const chatUrl = zaloService.getZaloChatUrl({ phone: targetPhone, zaloId: targetZaloId });

      return `
        <tr>
          <td class="text-center font-mono text-muted">${index + 1}</td>
          <td>
            <div class="font-bold text-primary">${escapeHtml(staff.name)}</div>
          </td>
          <td>
            <div class="font-medium">${escapeHtml(staff.department)}</div>
          </td>
          <td>
            <span class="badge-position">${escapeHtml(staff.position)}</span>
          </td>
          <td>
            <div style="display: flex; flex-direction: column; gap: 2px;">
              ${staff.phone ? `<a href="tel:${staff.phone}" class="staff-phone-link">📞 ${escapeHtml(staff.phone)}</a>` : '<span class="text-muted text-xs">Chưa có SĐT</span>'}
              ${targetZaloId ? `<span class="text-xs" style="color: #0068FF; font-weight: 600;">📱 Zalo: @${escapeHtml(targetZaloId)}</span>` : ''}
            </div>
          </td>
          <td class="text-center">
            ${chatUrl ? `
              <a href="${chatUrl}" target="_blank" class="btn-zalo-micro" title="Mở chat Zalo">💬 Chat</a>
            ` : '<span class="text-muted text-xs">---</span>'}
          </td>
          <td>
            <span class="role-pill ${role.badgeClass}">${role.icon} ${escapeHtml(role.name.split(':')[0])}</span>
          </td>
          <td class="text-center">
            <div class="action-buttons-group">
              <button class="btn-action-icon btn-edit" onclick="window.hsbaApp.modalController.openStaffModal('${staff.id}')" title="Sửa hồ sơ nhân viên">✏️</button>
              <button class="btn-action-icon btn-danger" onclick="window.hsbaApp.deleteStaff('${staff.id}', '${escapeHtml(staff.name)}')" title="Xóa nhân viên">🗑️</button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  }

  deleteStaff(id, name) {
    this.modalController.openConfirmModal({
      title: 'Xóa Hồ sơ Nhân viên',
      message: `Bạn có chắc muốn xóa nhân viên <strong>${escapeHtml(name)}</strong> khỏi danh sách?`,
      isDanger: true,
      confirmText: 'Xóa nhân viên',
      onConfirm: () => {
        storage.deleteStaff(id);
        showToast(`Đã xóa nhân viên ${name}`, 'success');
        this.renderStaffSettings();
        this.populateFilterSuggestions();
      }
    });
  }
}

// Khởi tạo app khi DOM tải xong
document.addEventListener('DOMContentLoaded', () => {
  window.hsbaApp = new App();
});
