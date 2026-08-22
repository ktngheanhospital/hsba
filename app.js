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
import { notificationService } from './notificationService.js';
import { supabaseService } from './supabase.js';
import { ModalController } from './modal.js';
import {
  formatDateVN,
  formatDateTimeVN,
  formatDischargeDateTimeVN,
  getDefaultDischargeDateTime,
  removeVietnameseTones,
  getMucDoLoiBadge,
  getWarningBadge,
  getReviewStatusBadge,
  getErrorStatusBadge,
  showToast,
  exportRecordsToCSV,
  escapeHtml,
  getTodayDateString,
  computeDashboardStats,
  exportDashboardToExcel,
  printDashboardReportPDF
} from './utils.js';

class App {
  constructor() {
    window.hsbaApp = this;
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
    const today = getTodayDateString();
    this.dischargeFilters = {
      keyword: '',
      dept: '',
      gate: '',
      date: today
    };

    // Quản lý các dòng nhập nhanh nhiều ca trực tiếp (Batch Inline Rows) - Mặc định 1 dòng ban đầu với Ngày ra viện mặc định 8h30 ngày N+1
    this.batchRows = [
      { id: 1, maKCB: '', tenBenhNhan: '', tenBacSi: '', ngayRaVien: getDefaultDischargeDateTime(today) }
    ];
    this.nextBatchRowId = 2;

    // Phân trang & sắp xếp danh sách lỗi
    this.currentPage = 1;
    this.pageSize = 15;
    this.sortBy = 'ngayCapNhat';
    this.sortOrder = 'desc';

    // Dashboard State & Time / Scope Filtering
    this.dashboardConditionFilter = 'ALL'; // 'ALL' | 'DK1' | 'DK2'
    this.violatorViewMode = 'DOCTOR'; // 'DOCTOR' | 'DEPT'
    this.expandedViolators = new Set();
    this.dashboardStats = null;
    
    // Lọc theo người dùng đăng nhập trên điện thoại: mặc định 'MINE' trên mobile, 'ALL' trên desktop
    this.dashboardUserScope = (window.innerWidth <= 768) ? 'MINE' : 'ALL'; // 'MINE' | 'ALL'

    // Time Filtering (Theo Ngày, Tháng, Năm, Tất cả)
    this.dashboardTimeMode = 'DAY'; // 'DAY' | 'MONTH' | 'YEAR' | 'ALL'
    this.dashboardTimeValue = today; // YYYY-MM-DD, YYYY-MM, or YYYY

    // Section 5 Comparison Chart State
    this.chartEntityMode = 'DEPT'; // 'DEPT' | 'DOCTOR'
    this.chartVisualType = 'bar'; // 'bar' | 'hbar' | 'line'
    this.selectedChartMetrics = new Set(['totalDischarge', 'passedDischarge', 'dk1Count', 'dk2Count', 'unresolvedErrors']);
    this.selectedChartEntities = new Set();
    this.chartInstance = null;
    this.isChartTableExpanded = false;

    // PWA Install State
    this.deferredInstallPrompt = null;
    this.isPWAInstalled = false;

    this.init();
  }

  init() {
    this.initPWA();
    this.bindEvents();
    this.populateFilterSuggestions();
    this.renderNotificationCenter();

    // Lắng nghe cập nhật thông báo đẩy tức thời
    notificationService.addListener(() => {
      this.renderNotificationCenter();
      if (this.currentTab === 'settings' && this.settingsSubTab === 'zalo') {
        this.renderZaloSettings();
      }
      if (this.currentTab === 'dashboard') {
        this.renderDashboardView();
      }
    });

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

  // Render Màn hình Đăng nhập (Login Screen)
  renderLoginScreen() {
    const loginView = document.getElementById('login-screen-view');
    const workspaceView = document.getElementById('app-main-workspace');
    if (loginView) loginView.style.display = 'flex';
    if (workspaceView) workspaceView.style.display = 'none';

    const errEl = document.getElementById('login-error-msg');
    if (errEl) errEl.style.display = 'none';

    const usernameInput = document.getElementById('login-username');
    const passwordInput = document.getElementById('login-password');
    if (usernameInput) usernameInput.value = '';
    if (passwordInput) passwordInput.value = '';

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
    this.renderNotificationCenter();
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

  // Render Trung tâm Thông Báo Đẩy (Notification Center Flyout & Badges)
  renderNotificationCenter() {
    const countEl = document.getElementById('header-notif-count');
    const countPill = document.getElementById('notif-panel-unread-pill');
    const listEl = document.getElementById('notification-flyout-list');
    const permBanner = document.getElementById('notif-permission-banner');

    const unreadCount = notificationService.getUnreadCount();
    const notifications = notificationService.getNotifications();

    if (countEl) {
      if (unreadCount > 0) {
        countEl.textContent = unreadCount > 99 ? '99+' : unreadCount;
        countEl.style.display = 'flex';
      } else {
        countEl.style.display = 'none';
      }
    }

    if (countPill) {
      countPill.textContent = `${unreadCount} mới`;
    }

    if (permBanner) {
      permBanner.style.display = notificationService.hasBrowserPermission() ? 'none' : 'flex';
    }

    if (!listEl) return;

    if (!notifications.length) {
      listEl.innerHTML = `
        <div class="notif-empty-state" style="padding: 24px 16px; text-align: center; color: var(--text-muted);">
          <span style="font-size: 2rem; display: block; margin-bottom: 8px;">🎉</span>
          <div style="font-weight: 600; font-size: 0.92rem; color: var(--text-main); margin-bottom: 4px;">Không có thông báo mới</div>
          <p style="font-size: 0.78rem; margin: 0; line-height: 1.4;">Tất cả thông báo lỗi hồ sơ bệnh án đẩy đến Bác sĩ sẽ hiển thị tức thời tại đây.</p>
        </div>
      `;
      return;
    }

    listEl.innerHTML = notifications.slice(0, 40).map(n => {
      const isUnread = !n.isRead && !n.read;
      const timeDisplay = formatDateTimeVN(n.timeFormatted || n.time || n.timestamp || '');
      let levelBadge = '';
      if (n.mucDoCanhBao === 'Báo động' || n.mucDoCanhBao === 'Khẩn cấp') {
        levelBadge = '<span class="notif-level-badge" style="background:#fee2e2;color:#991b1b;padding:2px 6px;border-radius:4px;font-size:0.7rem;font-weight:700;">🚨 Báo động</span>';
      } else if (n.mucDoCanhBao === 'Yêu cầu kiểm tra') {
        levelBadge = '<span class="notif-level-badge" style="background:#f3e8ff;color:#6b21a8;padding:2px 6px;border-radius:4px;font-size:0.7rem;font-weight:700;">🟣 Yêu cầu KT</span>';
      } else {
        levelBadge = '<span class="notif-level-badge" style="background:#fef3c7;color:#92400e;padding:2px 6px;border-radius:4px;font-size:0.7rem;font-weight:700;">🟡 Nhắc nhở</span>';
      }

      return `
        <div class="notif-item-card ${isUnread ? 'notif-unread' : 'notif-read'}" data-notif-id="${n.id}" data-record-id="${n.recordId || ''}" style="padding: 10px 12px; border-bottom: 1px solid var(--border-soft); cursor: pointer; transition: background 0.15s; ${isUnread ? 'background: rgba(79, 70, 229, 0.05);' : ''}">
          <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; margin-bottom: 4px;">
            <div style="display: flex; align-items: center; gap: 6px;">
              ${isUnread ? '<span style="width: 7px; height: 7px; background: #4f46e5; border-radius: 50%; display: inline-block;"></span>' : ''}
              <strong style="font-size: 0.82rem; color: var(--text-main);">${escapeHtml(n.title)}</strong>
            </div>
            <span style="font-size: 0.7rem; color: var(--text-muted); white-space: nowrap;">${timeDisplay}</span>
          </div>
          <p style="font-size: 0.76rem; color: var(--text-muted); margin: 0 0 6px 0; line-height: 1.35; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; display: -webkit-box;">
            ${escapeHtml(n.body)}
          </p>
          <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.72rem;">
            <div style="display: flex; align-items: center; gap: 6px;">
              ${levelBadge}
              <span style="color: var(--text-muted);">👤 ${escapeHtml(n.recipientName || 'BS')}</span>
            </div>
            ${n.recordId ? '<span style="color: var(--color-primary); font-weight: 600;">Xem chi tiết ➔</span>' : ''}
          </div>
        </div>
      `;
    }).join('');

    listEl.querySelectorAll('.notif-item-card').forEach(card => {
      card.onclick = (e) => {
        const notifId = card.getAttribute('data-notif-id');
        const recordId = card.getAttribute('data-record-id');
        if (notifId) {
          notificationService.markAsRead(notifId);
          this.renderNotificationCenter();
        }
        if (recordId) {
          const panel = document.getElementById('notification-flyout-panel');
          if (panel) panel.style.display = 'none';
          this.modalController.openEditErrorModal(recordId);
        }
      };
    });
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
    // 1. Notification Center Toggle & Actions
    const btnToggleNotifs = document.getElementById('btn-toggle-notifications');
    const notifPanel = document.getElementById('notification-flyout-panel');
    const notifWrap = document.getElementById('notification-center-wrap');

    if (btnToggleNotifs && notifPanel) {
      btnToggleNotifs.onclick = (e) => {
        e.stopPropagation();
        const isHidden = notifPanel.style.display === 'none' || !notifPanel.style.display;
        notifPanel.style.display = isHidden ? 'block' : 'none';
        if (isHidden) {
          this.renderNotificationCenter();
        }
      };

      document.addEventListener('click', (e) => {
        if (notifWrap && !notifWrap.contains(e.target) && notifPanel.style.display !== 'none') {
          notifPanel.style.display = 'none';
        }
      });
    }

    const btnNotifMarkAll = document.getElementById('btn-notif-mark-all-read');
    if (btnNotifMarkAll) {
      btnNotifMarkAll.onclick = () => {
        notificationService.markAllAsRead();
        this.renderNotificationCenter();
        showToast('Đã đánh dấu đọc tất cả thông báo', 'info');
      };
    }

    const btnNotifClearAll = document.getElementById('btn-notif-clear-all');
    if (btnNotifClearAll) {
      btnNotifClearAll.onclick = () => {
        notificationService.clearNotifications();
        this.renderNotificationCenter();
        showToast('Đã dọn dẹp danh sách thông báo', 'info');
      };
    }

    const btnEnableBrowserPush = document.getElementById('btn-enable-browser-push');
    if (btnEnableBrowserPush) {
      btnEnableBrowserPush.onclick = async () => {
        const granted = await notificationService.requestBrowserPermission();
        if (granted) {
          showToast('✅ Đã bật thông báo đẩy trên trình duyệt thành công!', 'success');
        } else {
          showToast('⚠️ Bạn chưa cho phép thông báo trên trình duyệt', 'warning');
        }
        this.renderNotificationCenter();
      };
    }

    const btnOpenPushSettings = document.getElementById('btn-open-push-settings');
    if (btnOpenPushSettings) {
      btnOpenPushSettings.onclick = () => {
        if (notifPanel) notifPanel.style.display = 'none';
        this.switchTab('settings');
        const pushSubTabBtn = document.querySelector('[data-subtab="zalo"]');
        if (pushSubTabBtn) pushSubTabBtn.click();
      };
    }

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

    // Sự kiện phần Tổng quan Dashboard
    const btnDashExcel = document.getElementById('btn-dash-export-excel');
    if (btnDashExcel) {
      btnDashExcel.onclick = () => this.exportDashboardExcel();
    }

    const btnDashPdf = document.getElementById('btn-dash-export-pdf');
    if (btnDashPdf) {
      btnDashPdf.onclick = () => this.exportDashboardPDF();
    }

    const btnRefreshDash = document.getElementById('btn-refresh-dashboard');
    if (btnRefreshDash) {
      btnRefreshDash.onclick = () => {
        this.renderDashboardView();
        showToast('Đã làm mới dữ liệu thống kê Dashboard!', 'success');
      };
    }

    const chartEntitySearch = document.getElementById('chart-entity-search');
    if (chartEntitySearch) {
      let entitySearchTimer;
      chartEntitySearch.addEventListener('input', () => {
        clearTimeout(entitySearchTimer);
        entitySearchTimer = setTimeout(() => {
          this.renderChartEntityCheckboxes();
        }, 120);
      });
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

    // 2. Cập nhật thống kê các khâu mini ở cột phải
    const widgetStepsContainer = document.getElementById('widget-steps-list');
    if (widgetStepsContainer) {
      const steps = [
        { key: 'kiemDuoc', name: 'Dược', icon: '💊' },
        { key: 'kiemKeToanBH', name: 'Kế toán BH', icon: '💵' },
        { key: 'kiemKHTH', name: 'KHTH', icon: '📋' }
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

    // Sắp xếp: Theo từng Khoa/Phòng trước (A-Z), trong mỗi khoa ưu tiên lỗi chưa hoàn thành lên trên
    records.sort((a, b) => {
      const deptA = (a.khoaPhong || '').trim();
      const deptB = (b.khoaPhong || '').trim();
      const deptCompare = deptA.localeCompare(deptB, 'vi', { sensitivity: 'base' });
      if (deptCompare !== 0) return deptCompare;

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
      const allRecords = storage.getRecords();
      let emptyHtml = '';
      if (allRecords.length === 0) {
        emptyHtml = `
          <div class="empty-state">
            <div class="empty-icon">📋</div>
            <h4>Chưa có hồ sơ rà soát nào</h4>
            <p>Hệ thống sạch và sẵn sàng. Bấm nút <strong>Thêm hồ sơ rà soát</strong> ở góc trên để bắt đầu thêm hồ sơ rà soát.</p>
            ${storage.canAddRecord() ? '<button class="btn btn-primary" onclick="window.hsbaApp.modalController.openAddErrorModal()" style="margin-top: 8px;">+ Thêm hồ sơ rà soát</button>' : ''}
          </div>
        `;
      } else {
        emptyHtml = `
          <div class="empty-state">
            <div class="empty-icon">🔍</div>
            <h4>Không tìm thấy bản ghi lỗi nào phù hợp</h4>
            <p>Không có kết quả trong khoảng thời gian hoặc tiêu chí tìm kiếm hiện tại.</p>
            <button class="btn btn-outline" id="btn-empty-reset" style="margin-top: 8px;">Đặt lại bộ lọc</button>
          </div>
        `;
      }
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

    // 2. MOBILE CARDS (DẠNG THẺ NGANG TINH TẾ & NHẸ NHÀNG)
    if (cardsContainer) {
      const canDeleteRecord = storage.canAddRecord() || storage.isAdmin();

      cardsContainer.innerHTML = pagedRecords.map((r) => {
        const isUnresolved = (r.trangThaiLoi !== 'ĐÃ XONG' && r.trangThaiKiemDuyet !== 'ĐÃ SỬA' && !r.chotRaVien);

        return `
          <div class="patient-h-card ${isUnresolved ? 'h-card-unresolved' : ''}" onclick="window.hsbaApp.modalController.openEditErrorModal('${r.id}')" title="Bấm vào để xem & chỉnh sửa chi tiết hồ sơ">
            <!-- Header: Mã KCB, Tên BN, Mức độ lỗi -->
            <div class="h-card-header">
              <div class="h-card-left-group">
                <span class="card-ma-kcb">${escapeHtml(r.maKCB)}</span>
                <span class="h-card-name">${escapeHtml(r.tenBenhNhan)}</span>
              </div>
              <div class="h-card-badges">
                ${getMucDoLoiBadge(r.mucDoLoi || r.mucDoCanhBao || r.trangThaiKiemDuyet)}
              </div>
            </div>

            <!-- Meta row: Khoa, BS, Y lệnh / Kiểm HS -->
            <div class="h-card-meta">
              <span class="h-meta-item" title="Khoa / Phòng">🏥 <strong>${escapeHtml(r.khoaPhong)}</strong></span>
              <span class="h-meta-item" title="Bác sĩ / Người ra y lệnh">👤 ${escapeHtml(r.nguoiChiDinh || '---')}</span>
              <span class="h-meta-item" title="Thời gian y lệnh">⏰ ${escapeHtml(r.thoiGianChiDinhYL || formatDateVN(r.ngayKiemHoSo))}</span>
            </div>

            <!-- Diễn giải lỗi compact -->
            <div class="h-card-desc">
              <span class="h-desc-icon">⚠️</span>
              <span class="h-desc-text" title="${escapeHtml(r.dienGiaiLoi)}">${escapeHtml(r.dienGiaiLoi)}</span>
            </div>
            ${r.yKienNguoiSua ? `
              <div class="h-card-reply">
                💬 <strong>Ý kiến sửa:</strong> ${escapeHtml(r.yKienNguoiSua)}
              </div>
            ` : ''}

            <!-- Bottom Action Toolbar -->
            <div class="h-card-bottom" onclick="event.stopPropagation()">
              <div class="h-card-status-left">
                <button type="button" class="btn-status-trigger ${canEditGroup2 ? 'btn-status-active' : 'btn-status-readonly'}" onclick="window.hsbaApp.modalController.openQuickStatusModal('${r.id}')" title="${canEditGroup2 ? 'Bấm để đổi nhanh tiến độ sửa lỗi' : 'Tiến độ'}">
                  ${getErrorStatusBadge(r.trangThaiLoi)}
                  ${canEditGroup2 ? '<span class="btn-quick-edit-icon">✏️</span>' : ''}
                </button>
              </div>

              <div class="h-card-actions-right">
                <button type="button" class="btn-h-action btn-h-edit" onclick="window.hsbaApp.modalController.openEditErrorModal('${r.id}')" title="Xem chi tiết & Chỉnh sửa">
                  ✏️ Chi tiết
                </button>
                ${canDeleteRecord ? `
                  <button type="button" class="btn-h-action btn-h-del" onclick="window.hsbaApp.quickDeleteRecord('${r.id}', event)" title="Xóa hồ sơ lỗi">
                    🗑️
                  </button>
                ` : ''}
              </div>
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
          <button class="btn-page-nav" ${this.currentPage === 1 ? 'disabled' : ''} onclick="window.hsbaApp.goToPage(${this.currentPage - 1})" title="Trang trước">
            <svg class="btn-svg-icon" viewBox="0 0 20 20" fill="currentColor" style="width: 14px; height: 14px;"><path fill-rule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clip-rule="evenodd"/></svg>
            <span>Trước</span>
          </button>
          <div class="page-numbers">${pageButtons}</div>
          <button class="btn-page-nav" ${this.currentPage === totalPages ? 'disabled' : ''} onclick="window.hsbaApp.goToPage(${this.currentPage + 1})" title="Trang tiếp">
            <span>Sau</span>
            <svg class="btn-svg-icon" viewBox="0 0 20 20" fill="currentColor" style="width: 14px; height: 14px;"><path fill-rule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clip-rule="evenodd"/></svg>
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

    if (reportDateInput) {
      if (!reportDateInput.value) {
        reportDateInput.value = getTodayDateString();
      }

      reportDateInput.onchange = (e) => {
        const newReportDate = e.target.value;
        const newDischargeDateTime = getDefaultDischargeDateTime(newReportDate);
        // Tự động cập nhật thời gian ra viện mặc định cho các dòng
        this.batchRows.forEach(r => {
          r.ngayRaVien = newDischargeDateTime;
        });
        this.renderBatchRows();
      };
    }

    this.renderBatchRows();
    this.bindBatchEvents();
  }

  renderBatchRows() {
    const rowsBody = document.getElementById('batch-input-rows');
    if (!rowsBody) return;

    const activeDept = storage.getActiveDepartment();
    const reportDateInput = document.getElementById('batch-report-date');
    const currentReportDate = reportDateInput ? reportDateInput.value : getTodayDateString();
    const defaultDischargeDateTime = getDefaultDischargeDateTime(currentReportDate);

    rowsBody.innerHTML = this.batchRows.map((row, idx) => {
      const rowDischargeTime = row.ngayRaVien || defaultDischargeDateTime;
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
            <input type="datetime-local" class="batch-cell-input batch-input-datetime" value="${rowDischargeTime}" data-id="${row.id}" data-field="ngayRaVien" title="Ngày giờ ra viện (mặc định 8h30 ngày N+1)" />
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
            // Từ Tên Bác sĩ -> nhảy sang Ngày ra viện trong cùng hàng
            const nextInput = tr.querySelector('.batch-input-datetime');
            if (nextInput) {
              nextInput.focus();
            }
          } else if (target.classList.contains('batch-input-datetime')) {
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
    const reportDateInput = document.getElementById('batch-report-date');
    const currentReportDate = reportDateInput ? reportDateInput.value : getTodayDateString();
    const defaultDischargeDateTime = getDefaultDischargeDateTime(currentReportDate);

    const newId = this.nextBatchRowId++;
    this.batchRows.push({
      id: newId,
      maKCB: '',
      tenBenhNhan: '',
      tenBacSi: '',
      ngayRaVien: defaultDischargeDateTime
    });
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
    const defaultDischargeDateTime = getDefaultDischargeDateTime(ngayBaoCao);
    const activeDept = storage.getActiveDepartment();

    const validRows = this.batchRows.filter(r => r.maKCB.trim() && r.tenBenhNhan.trim()).map(r => ({
      ngayBaoCao,
      ngayRaVien: r.ngayRaVien || defaultDischargeDateTime,
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
      {
        id: this.nextBatchRowId++,
        maKCB: '',
        tenBenhNhan: '',
        tenBacSi: '',
        ngayRaVien: defaultDischargeDateTime
      }
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

    // Sắp xếp: Theo từng Khoa/Phòng trước (A-Z), trong mỗi khoa ưu tiên ca chưa thông cổng lên trước
    reports.sort((a, b) => {
      const deptA = (a.phong || '').trim();
      const deptB = (b.phong || '').trim();
      const deptCompare = deptA.localeCompare(deptB, 'vi', { sensitivity: 'base' });
      if (deptCompare !== 0) return deptCompare;

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
      const isFilterDay = !!this.dischargeFilters.date;
      const emptyHtml = `
        <div class="empty-state">
          <div class="empty-icon">🏥</div>
          <h4>Chưa có ca báo cáo ra viện nào ${isFilterDay ? `trong ngày ${formatDateVN(this.dischargeFilters.date)}` : ''}</h4>
          <p>Nhập các ca ra viện vào bảng phía trên và bấm <strong>Lưu tất cả ca vừa nhập</strong> để các khâu chuyên môn cùng kiểm duyệt.</p>
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
            
            <td class="font-mono text-xs text-center font-bold text-slate-800" style="white-space: nowrap;">
              ⏰ ${formatDischargeDateTimeVN(r.ngayRaVien || r.ngayBaoCao)}
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

    // 2. MOBILE CARDS (DẠNG THẺ NGANG TINH TẾ & NHẸ NHÀNG)
    if (cardsContainer) {
      const canDeleteDischarge = storage.canDeleteDischargeReport();

      cardsContainer.innerHTML = reports.map(r => {
        const isPassed = r.chotThongCong === 'CO';

        return `
          <div class="patient-h-card discharge-h-card ${!isPassed ? 'h-card-unresolved' : ''}" onclick="window.hsbaApp.modalController.openEditDischargeReportModal('${r.id}')" title="Bấm vào để xem & kiểm duyệt ca ra viện">
            <!-- Header: Mã KCB, Tên BN, Trạng thái Thông cổng -->
            <div class="h-card-header">
              <div class="h-card-left-group">
                <span class="card-ma-kcb">${escapeHtml(r.maKCB)}</span>
                <span class="h-card-name">${escapeHtml(r.tenBenhNhan)}</span>
              </div>
              <div class="h-card-badges">
                ${isPassed ? '<span class="badge-gate-pass">🟢 ĐỒNG Ý</span>' : '<span class="badge-gate-pending">🔴 CHƯA</span>'}
              </div>
            </div>

            <!-- Meta row: Ra viện, Bác sĩ, Khoa -->
            <div class="h-card-meta">
              <span class="h-meta-item" title="Thời gian ra viện">⏰ <strong>${formatDischargeDateTimeVN(r.ngayRaVien || r.ngayBaoCao)}</strong></span>
              <span class="h-meta-item" title="Bác sĩ điều trị">👨‍⚕️ ${escapeHtml(r.tenBacSi)}</span>
              <span class="h-meta-item" title="Khoa / Phòng">🏥 ${escapeHtml(r.phong)}</span>
            </div>

            <!-- 3 Khâu kiểm chuyên môn -->
            <div class="h-card-steps" onclick="event.stopPropagation()">
              <span class="h-steps-label">Kiểm lỗi:</span>
              <div class="h-steps-badge-row">
                ${renderStepBtn('duoc', 'Dược', r.kiemDuoc, r.id)}
                ${renderStepBtn('ketoan', 'KTBH', r.kiemKeToanBH, r.id)}
                ${renderStepBtn('khth', 'KHTH', r.kiemKHTH, r.id)}
              </div>
            </div>

            ${r.baoCaoTinhTrangSuaLoi ? `
              <div class="h-card-reply">
                📝 <strong>Sửa lỗi:</strong> ${escapeHtml(r.baoCaoTinhTrangSuaLoi)}
              </div>
            ` : ''}

            <!-- Bottom Action Toolbar -->
            <div class="h-card-bottom" onclick="event.stopPropagation()">
              <div class="h-card-status-left">
                ${canChot ? `
                  <button type="button" class="btn-h-gate-toggle ${isPassed ? 'gate-active-pass' : 'gate-active-pending'}" onclick="window.hsbaApp.quickToggleDischargeGate('${r.id}', event)" title="Bấm để chuyển nhanh trạng thái Thông Cổng">
                    ${isPassed ? '🟢 Đã Thông Cổng' : '🔴 Chốt Thông Cổng'}
                  </button>
                ` : `
                  <span class="text-xs text-muted font-medium">${isPassed ? '🟢 Đã duyệt cổng' : '🔴 Chưa duyệt cổng'}</span>
                `}
              </div>

              <div class="h-card-actions-right">
                <button type="button" class="btn-h-action btn-h-edit" onclick="window.hsbaApp.modalController.openEditDischargeReportModal('${r.id}')" title="Kiểm duyệt chuyên môn & Chốt cổng">
                  ✏️ Kiểm lỗi & Sửa
                </button>
                ${canDeleteDischarge ? `
                  <button type="button" class="btn-h-action btn-h-del" onclick="window.hsbaApp.quickDeleteDischargeReport('${r.id}', event)" title="Xóa ca ra viện">
                    🗑️
                  </button>
                ` : ''}
              </div>
            </div>
          </div>
        `;
      }).join('');
    }
  }

  // ==========================================
  // 4. VIEW TỔNG QUAN & BÁO CÁO (DASHBOARD - SOFT MEDICAL STYLE)
  // ==========================================
  setDashboardTimeMode(mode) {
    this.dashboardTimeMode = mode;
    ['day', 'month', 'year', 'all'].forEach(m => {
      const btn = document.getElementById(`btn-time-${m}`);
      if (btn) btn.classList.toggle('active', m.toUpperCase() === mode);
      const box = document.getElementById(`dash-time-${m}-picker-box`);
      if (box) box.style.display = (m.toUpperCase() === mode && mode !== 'ALL') ? 'flex' : 'none';
    });

    const today = getTodayDateString();
    if (mode === 'DAY') {
      const inputDay = document.getElementById('dash-time-input-day');
      if (inputDay && !inputDay.value) inputDay.value = today;
      this.dashboardTimeValue = inputDay ? inputDay.value : today;
    } else if (mode === 'MONTH') {
      const inputMonth = document.getElementById('dash-time-input-month');
      const currentMonth = today.substring(0, 7);
      if (inputMonth && !inputMonth.value) inputMonth.value = currentMonth;
      this.dashboardTimeValue = inputMonth ? inputMonth.value : currentMonth;
    } else if (mode === 'YEAR') {
      this.populateDashboardYearSelect();
      const inputYear = document.getElementById('dash-time-input-year');
      const currentYear = today.substring(0, 4);
      if (inputYear && !inputYear.value) inputYear.value = currentYear;
      this.dashboardTimeValue = inputYear ? inputYear.value : currentYear;
    } else {
      this.dashboardTimeValue = '';
    }

    this.updateDashboardTimeFilterIndicator();
    this.renderDashboardView();
  }

  populateDashboardYearSelect() {
    const sel = document.getElementById('dash-time-input-year');
    if (!sel || sel.options.length > 0) return;
    const currentYear = new Date().getFullYear();
    for (let y = currentYear + 1; y >= currentYear - 5; y--) {
      const opt = document.createElement('option');
      opt.value = String(y);
      opt.textContent = `Năm ${y}`;
      if (y === currentYear) opt.selected = true;
      sel.appendChild(opt);
    }
  }

  setDashboardTimeToToday() {
    const today = getTodayDateString();
    const input = document.getElementById('dash-time-input-day');
    if (input) input.value = today;
    this.dashboardTimeValue = today;
    this.updateDashboardTimeFilterIndicator();
    this.renderDashboardView();
  }

  setDashboardTimeToYesterday() {
    const dt = new Date();
    dt.setDate(dt.getDate() - 1);
    const y = dt.getFullYear();
    const m = String(dt.getMonth() + 1).padStart(2, '0');
    const d = String(dt.getDate()).padStart(2, '0');
    const yesterday = `${y}-${m}-${d}`;
    const input = document.getElementById('dash-time-input-day');
    if (input) input.value = yesterday;
    this.dashboardTimeValue = yesterday;
    this.updateDashboardTimeFilterIndicator();
    this.renderDashboardView();
  }

  setDashboardTimeToThisMonth() {
    const today = getTodayDateString();
    const currentMonth = today.substring(0, 7);
    const input = document.getElementById('dash-time-input-month');
    if (input) input.value = currentMonth;
    this.dashboardTimeValue = currentMonth;
    this.updateDashboardTimeFilterIndicator();
    this.renderDashboardView();
  }

  setDashboardTimeToThisYear() {
    const currentYear = String(new Date().getFullYear());
    this.populateDashboardYearSelect();
    const input = document.getElementById('dash-time-input-year');
    if (input) input.value = currentYear;
    this.dashboardTimeValue = currentYear;
    this.updateDashboardTimeFilterIndicator();
    this.renderDashboardView();
  }

  onDashboardTimeInputChange() {
    if (this.dashboardTimeMode === 'DAY') {
      const input = document.getElementById('dash-time-input-day');
      if (input && input.value) this.dashboardTimeValue = input.value;
    } else if (this.dashboardTimeMode === 'MONTH') {
      const input = document.getElementById('dash-time-input-month');
      if (input && input.value) this.dashboardTimeValue = input.value;
    } else if (this.dashboardTimeMode === 'YEAR') {
      const input = document.getElementById('dash-time-input-year');
      if (input && input.value) this.dashboardTimeValue = input.value;
    }
    this.updateDashboardTimeFilterIndicator();
    this.renderDashboardView();
  }

  updateDashboardTimeFilterIndicator() {
    const textEl = document.getElementById('dash-time-filter-text');
    const chartTimeLabel = document.getElementById('dash-chart-time-label');
    let label = '';
    if (this.dashboardTimeMode === 'DAY') {
      const today = getTodayDateString();
      if (this.dashboardTimeValue === today) {
        label = `Hôm nay (${formatDateVN(this.dashboardTimeValue)})`;
      } else {
        label = `Ngày ${formatDateVN(this.dashboardTimeValue)}`;
      }
    } else if (this.dashboardTimeMode === 'MONTH') {
      const parts = (this.dashboardTimeValue || '').split('-');
      label = parts.length === 2 ? `Tháng ${parts[1]}/${parts[0]}` : `Tháng ${this.dashboardTimeValue}`;
    } else if (this.dashboardTimeMode === 'YEAR') {
      label = `Năm ${this.dashboardTimeValue}`;
    } else {
      label = 'Toàn bộ thời gian (Tất cả)';
    }
    if (textEl) textEl.textContent = label;
    if (chartTimeLabel) chartTimeLabel.textContent = label;
  }

  setDashboardUserScope(scope) {
    this.dashboardUserScope = scope;
    this.updateDashboardUserScopeUI();
    this.renderDashboardView();
  }

  updateDashboardUserScopeUI() {
    const user = storage.getCurrentUser();
    const btnMine = document.getElementById('btn-scope-mine');
    const btnAll = document.getElementById('btn-scope-all');
    const labelEl = document.getElementById('dash-user-scope-label');

    if (btnMine) btnMine.classList.toggle('active', this.dashboardUserScope === 'MINE');
    if (btnAll) btnAll.classList.toggle('active', this.dashboardUserScope === 'ALL');

    if (labelEl) {
      if (this.dashboardUserScope === 'MINE') {
        const uName = user ? user.name : 'Người dùng';
        const uDept = user && user.department ? ` · ${user.department}` : '';
        labelEl.textContent = `Chính tôi (${uName}${uDept})`;
        labelEl.style.color = 'var(--primary)';
      } else {
        labelEl.textContent = 'Toàn viện (Tất cả khoa phòng & nhân viên)';
        labelEl.style.color = 'var(--slate-700)';
      }
    }
  }

  syncDashboardTimeFilterInputs() {
    const today = getTodayDateString();
    const inputDay = document.getElementById('dash-time-input-day');
    if (inputDay && !inputDay.value) inputDay.value = today;

    const inputMonth = document.getElementById('dash-time-input-month');
    if (inputMonth && !inputMonth.value) inputMonth.value = today.substring(0, 7);

    this.populateDashboardYearSelect();
    const inputYear = document.getElementById('dash-time-input-year');
    if (inputYear && !inputYear.value) inputYear.value = today.substring(0, 4);

    this.updateDashboardTimeFilterIndicator();
  }

  filterConditionErrors(type) {
    this.dashboardConditionFilter = type;
    ['all', 'dk1', 'dk2'].forEach(t => {
      const btn = document.getElementById(`btn-filter-cond-${t}`);
      if (btn) btn.classList.toggle('active', t.toUpperCase() === type);
    });
    if (this.dashboardStats) {
      this.renderConditionErrorsTable(this.dashboardStats);
    }
  }

  setViolatorViewMode(mode) {
    this.violatorViewMode = mode;
    const btnDoc = document.getElementById('btn-violator-mode-doctor');
    const btnDept = document.getElementById('btn-violator-mode-dept');
    if (btnDoc) btnDoc.classList.toggle('active', mode === 'DOCTOR');
    if (btnDept) btnDept.classList.toggle('active', mode === 'DEPT');
    this.renderViolatorsList();
  }

  toggleViolatorAccordion(violatorKey) {
    if (this.expandedViolators.has(violatorKey)) {
      this.expandedViolators.delete(violatorKey);
    } else {
      this.expandedViolators.add(violatorKey);
    }
    this.renderViolatorsList();
  }

  renderDeptDischargeTable(stats) {
    const tbody = document.getElementById('dash-dept-discharge-body');
    if (!tbody) return;

    if (!stats.deptStats || stats.deptStats.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" class="text-center p-4 text-muted">Chưa có dữ liệu khoa phòng</td></tr>';
      return;
    }

    tbody.innerHTML = stats.deptStats.map((d, idx) => {
      const hasDischarge = d.totalDischarge > 0;
      const hasDK1 = d.dk1Count > 0;
      const hasDK2 = d.dk2Count > 0;
      const hasUnresolved = d.unresolvedErrors > 0;

      return `
        <tr>
          <td class="text-center font-mono text-xs text-muted">${idx + 1}</td>
          <td>
            <div class="font-semibold text-slate-900">${escapeHtml(d.name)}</div>
            ${d.code ? `<div class="text-xs text-muted font-mono">Mã khoa: ${escapeHtml(d.code)}</div>` : ''}
          </td>
          <td class="text-center">
            <span class="font-bold font-mono text-sm ${hasDischarge ? 'text-primary' : 'text-muted'}">${d.totalDischarge}</span>
          </td>
          <td class="text-center">
            ${d.totalDischarge > 0 ? `
              <span class="badge-gate-pass">
                ✓ ${d.passedDischarge} (${d.passRatio}%)
              </span>
            ` : '<span class="text-muted text-xs">---</span>'}
          </td>
          <td class="text-center">
            ${d.pendingDischarge > 0 ? `
              <span class="badge-gate-pending">
                ⏳ ${d.pendingDischarge}
              </span>
            ` : (d.totalDischarge > 0 ? '<span class="text-xs text-success font-semibold">0</span>' : '<span class="text-muted text-xs">---</span>')}
          </td>
          <td class="text-center">
            ${hasDK1 ? `
              <span class="badge-cond-dk1 font-mono">
                ⚠️ ${d.dk1Count} lỗi
              </span>
            ` : '<span class="text-xs text-slate-400">0</span>'}
          </td>
          <td class="text-center">
            ${hasDK2 ? `
              <span class="badge-cond-dk2 font-mono">
                🚨 ${d.dk2Count} lỗi
              </span>
            ` : '<span class="text-xs text-slate-400">0</span>'}
          </td>
          <td class="text-center font-bold font-mono text-sm ${hasUnresolved ? 'text-danger' : 'text-success'}">
            ${d.unresolvedErrors}
          </td>
        </tr>
      `;
    }).join('');
  }

  renderConditionErrorsTable(stats) {
    const tbody = document.getElementById('dash-condition-errors-body');
    if (!tbody) return;

    let errorList = [];
    if (this.dashboardConditionFilter === 'DK1') {
      errorList = stats.dk1Errors || [];
    } else if (this.dashboardConditionFilter === 'DK2') {
      errorList = stats.dk2Errors || [];
    } else {
      errorList = (stats.dk1Errors || []).concat(stats.dk2Errors || []);
    }

    if (!errorList.length) {
      tbody.innerHTML = `
        <tr>
          <td colspan="10" class="text-center p-6 text-muted">
            <div style="font-size: 1.5rem; margin-bottom: 6px;">🎉</div>
            <div class="font-semibold text-slate-700">Tuyệt vời! Không phát hiện lỗi bệnh án nào thuộc ${this.dashboardConditionFilter === 'ALL' ? 'Điều kiện 1 & Điều kiện 2' : (this.dashboardConditionFilter === 'DK1' ? 'Điều kiện 1' : 'Điều kiện 2')}</div>
            <div class="text-xs text-slate-400" style="margin-top: 4px;">Tất cả hồ sơ ra viện đã hoàn thành xử lý sửa lỗi đúng thời hạn quy định.</div>
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = errorList.map((e, idx) => {
      const isDK1 = e.conditionType === 'DK1';
      const dischargeDateStr = e.dischargeDate ? formatDateVN(e.dischargeDate) : '---';

      return `
        <tr>
          <td class="text-center font-mono text-xs text-muted">${idx + 1}</td>
          <td>
            ${isDK1 ? `
              <span class="badge-cond-dk1">
                ⚠️ Điều kiện 1 (16h01 N)
              </span>
            ` : `
              <span class="badge-cond-dk2">
                🚨 Điều kiện 2 (16h01 N+1)
              </span>
            `}
          </td>
          <td>
            <span class="font-mono font-bold text-slate-900">${escapeHtml(e.maKCB)}</span>
          </td>
          <td>
            <div class="font-semibold text-slate-900">${escapeHtml(e.tenBenhNhan || '---')}</div>
          </td>
          <td>
            <span class="text-xs font-medium text-slate-700">${escapeHtml(e.khoaPhong || '---')}</span>
          </td>
          <td>
            <span class="text-xs text-slate-800 font-semibold">${escapeHtml(e.nguoiChiDinh || '(Chưa rõ BS)')}</span>
          </td>
          <td class="text-center font-mono text-xs text-slate-700">
            ${dischargeDateStr}
          </td>
          <td class="text-center">
            <span class="font-mono text-xs font-semibold text-slate-700 bg-slate-100 px-2 py-1 rounded">
              ${escapeHtml(e.checkDeadline)}
            </span>
          </td>
          <td class="text-center">
            ${getErrorStatusBadge(e.trangThaiLoi)}
          </td>
          <td>
            <div class="text-xs text-slate-800" style="max-width: 320px; line-height: 1.4;">
              ${escapeHtml(e.dienGiaiLoi || '')}
            </div>
            ${e.mucDoCanhBao || e.mucDoLoi ? `
              <div style="margin-top: 3px;">
                ${getMucDoLoiBadge(e.mucDoLoi || e.mucDoCanhBao)}
              </div>
            ` : ''}
          </td>
        </tr>
      `;
    }).join('');
  }

  renderViolatorsList() {
    const container = document.getElementById('dash-violators-list-container');
    if (!container || !this.dashboardStats) return;

    const stats = this.dashboardStats;
    const deptFilterEl = document.getElementById('dash-violator-dept-filter');
    const typeFilterEl = document.getElementById('dash-violator-type-filter');
    const searchEl = document.getElementById('dash-violator-search');

    const selectedDept = deptFilterEl ? deptFilterEl.value.trim().toLowerCase() : '';
    const selectedType = typeFilterEl ? typeFilterEl.value : 'ALL';
    const keyword = searchEl ? removeVietnameseTones(searchEl.value.trim()) : '';

    let items = [];

    if (this.violatorViewMode === 'DOCTOR') {
      items = [...stats.violatorsList];
    } else {
      // Group theo Khoa / Phòng từ dữ liệu đã lọc theo thời gian
      const deptMap = new Map();
      stats.deptStats.forEach(d => {
        const key = d.name.trim().toLowerCase();
        const deptRecords = (stats.filteredRecords || []).filter(r => (r.khoaPhong || '').trim().toLowerCase() === key);
        const dk1Count = stats.dk1Errors.filter(e => (e.khoaPhong || '').trim().toLowerCase() === key).length;
        const dk2Count = stats.dk2Errors.filter(e => (e.khoaPhong || '').trim().toLowerCase() === key).length;
        const unresolvedCount = deptRecords.filter(r => r.trangThaiLoi !== 'ĐÃ XONG').length;

        deptMap.set(key, {
          name: d.name,
          department: d.code ? `Mã: ${d.code}` : 'Khoa / Phòng điều trị',
          isGenericDept: true,
          totalErrors: deptRecords.length,
          unresolvedCount,
          dk1Count,
          dk2Count,
          errors: deptRecords.map(r => ({
            ...r,
            isDK1: stats.dk1Errors.some(e => e.id === r.id),
            isDK2: stats.dk2Errors.some(e => e.id === r.id)
          }))
        });
      });

      items = Array.from(deptMap.values()).filter(d => d.totalErrors > 0).sort((a, b) => 
        (b.dk2Count + b.dk1Count) - (a.dk2Count + a.dk1Count) || 
        b.unresolvedCount - a.unresolvedCount || 
        b.totalErrors - a.totalErrors
      );
    }

    if (selectedDept) {
      items = items.filter(v => (v.department || '').toLowerCase().includes(selectedDept) || (v.name || '').toLowerCase().includes(selectedDept));
    }

    if (selectedType === 'DK1') {
      items = items.filter(v => v.dk1Count > 0);
    } else if (selectedType === 'DK2') {
      items = items.filter(v => v.dk2Count > 0);
    } else if (selectedType === 'UNRESOLVED') {
      items = items.filter(v => v.unresolvedCount > 0);
    }

    if (keyword) {
      items = items.filter(v => {
        const nameClean = removeVietnameseTones(v.name || '');
        const deptClean = removeVietnameseTones(v.department || '');
        return nameClean.includes(keyword) || deptClean.includes(keyword);
      });
    }

    if (!items.length) {
      container.innerHTML = `
        <div class="text-center p-6 text-muted">
          <div style="font-size: 1.5rem; margin-bottom: 4px;">🔍</div>
          <div class="font-semibold text-slate-700">Không tìm thấy bác sĩ / người ra y lệnh hoặc khoa phòng nào phù hợp với bộ lọc</div>
        </div>
      `;
      return;
    }

    container.innerHTML = items.map((v, idx) => {
      const itemKey = `${v.name}___${v.department}`;
      const isExpanded = this.expandedViolators.has(itemKey);
      const initials = v.name.split(' ').map(n => n[0]).filter(Boolean).slice(-2).join('').toUpperCase();

      return `
        <div class="violator-card-item">
          <div class="violator-card-header" onclick="window.hsbaApp.toggleViolatorAccordion('${escapeHtml(itemKey)}')">
            <div class="violator-main-info">
              <div class="violator-avatar-badge">
                ${v.isGenericDept ? '🏥' : (initials || 'BS')}
              </div>
              <div>
                <div class="violator-name">${escapeHtml(v.name)}</div>
                <div class="violator-dept">📍 ${escapeHtml(v.department)}</div>
              </div>
            </div>

            <div class="violator-stat-pills">
              <span class="stat-pill stat-pill-total">Tổng: ${v.totalErrors} lỗi</span>
              ${v.unresolvedCount > 0 ? `
                <span class="stat-pill stat-pill-unresolved">⏳ ${v.unresolvedCount} chưa sửa</span>
              ` : '<span class="stat-pill" style="background:#dcfce7;color:#15803d;">✓ Đã xong</span>'}
              ${v.dk1Count > 0 ? `
                <span class="stat-pill stat-pill-dk1">⚠️ ${v.dk1Count} lỗi ĐK1</span>
              ` : ''}
              ${v.dk2Count > 0 ? `
                <span class="stat-pill stat-pill-dk2">🚨 ${v.dk2Count} lỗi ĐK2</span>
              ` : ''}
              <button class="btn btn-xs btn-outline" style="margin-left: 6px;">
                ${isExpanded ? '▲ Thu gọn' : `▼ Xem chi tiết (${v.errors.length})`}
              </button>
            </div>
          </div>

          ${isExpanded ? `
            <div class="violator-detail-table">
              <div style="font-size: 0.78rem; font-weight: 700; color: var(--slate-700); margin-bottom: 8px;">
                📋 Danh sách chi tiết ${v.errors.length} lỗi do ${escapeHtml(v.name)} ghi nhận:
              </div>
              <div class="table-container" style="border: 1px solid var(--border-soft); border-radius: 4px; background: #ffffff;">
                <table class="data-table" style="font-size: 0.78rem;">
                  <thead>
                    <tr>
                      <th class="text-center" style="width: 40px;">STT</th>
                      <th style="width: 110px;">MÃ KCB</th>
                      <th>BỆNH NHÂN</th>
                      <th>KHOA / PHÒNG</th>
                      <th style="width: 120px;">THỜI GIAN CHỈ ĐỊNH</th>
                      <th class="text-center" style="width: 100px;">ĐIỀU KIỆN</th>
                      <th class="text-center" style="width: 100px;">TIẾN ĐỘ</th>
                      <th>NỘI DUNG SAI SÓT / LỖI</th>
                      <th class="text-center" style="width: 70px;">THAO TÁC</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${v.errors.map((err, eIdx) => `
                      <tr>
                        <td class="text-center font-mono text-muted">${eIdx + 1}</td>
                        <td><span class="font-mono font-bold text-slate-900">${escapeHtml(err.maKCB)}</span></td>
                        <td><strong>${escapeHtml(err.tenBenhNhan || '---')}</strong></td>
                        <td>${escapeHtml(err.khoaPhong || '---')}</td>
                        <td class="font-mono text-xs">${escapeHtml(err.thoiGianChiDinhYL || formatDateVN(err.ngayKiemHoSo))}</td>
                        <td class="text-center">
                          ${err.isDK2 ? '<span class="badge-cond-dk2">Lỗi ĐK 2</span>' : (err.isDK1 ? '<span class="badge-cond-dk1">Lỗi ĐK 1</span>' : '<span class="text-muted text-xs">Thường</span>')}
                        </td>
                        <td class="text-center">
                          ${getErrorStatusBadge(err.trangThaiLoi)}
                        </td>
                        <td>
                          <div style="max-width: 280px; line-height: 1.4;">${escapeHtml(err.dienGiaiLoi || '')}</div>
                        </td>
                        <td class="text-center">
                          <button class="btn btn-xs btn-outline" onclick="window.hsbaApp.modalController.openEditErrorModal('${err.id}')">
                            ✏️ Sửa
                          </button>
                        </td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              </div>
            </div>
          ` : ''}
        </div>
      `;
    }).join('');
  }

  // ==========================================
  // SECTION 5: CHART VISUALIZATION & COMPARISON ENGINE
  // ==========================================
  getChartMetricDefs() {
    return [
      { key: 'totalDischarge', label: '1. Tổng HSBA ra viện', color: '#0f766e', bgColor: 'rgba(15, 118, 110, 0.75)' },
      { key: 'passedDischarge', label: 'Đã thông cổng', color: '#10b981', bgColor: 'rgba(16, 185, 129, 0.75)' },
      { key: 'pendingDischarge', label: 'Chưa thông cổng', color: '#f59e0b', bgColor: 'rgba(245, 158, 11, 0.75)' },
      { key: 'dk1Count', label: '2. Lỗi ĐK 1 (16h01 N)', color: '#ea580c', bgColor: 'rgba(234, 88, 12, 0.75)' },
      { key: 'dk2Count', label: '3. Lỗi ĐK 2 (16h01 N+1)', color: '#dc2626', bgColor: 'rgba(220, 38, 38, 0.75)' },
      { key: 'totalErrors', label: 'Tổng lỗi rà soát', color: '#0284c7', bgColor: 'rgba(2, 132, 199, 0.75)' },
      { key: 'unresolvedErrors', label: 'Lỗi chưa sửa', color: '#e11d48', bgColor: 'rgba(225, 29, 72, 0.75)' },
      { key: 'passRatio', label: 'Tỷ lệ thông cổng (%)', color: '#7c3aed', bgColor: 'rgba(124, 58, 237, 0.75)' }
    ];
  }

  setChartEntityMode(mode) {
    this.chartEntityMode = mode;
    const btnDept = document.getElementById('btn-chart-mode-dept');
    const btnDoc = document.getElementById('btn-chart-mode-doctor');
    if (btnDept) btnDept.classList.toggle('active', mode === 'DEPT');
    if (btnDoc) btnDoc.classList.toggle('active', mode === 'DOCTOR');

    const titleEl = document.getElementById('chart-entity-title');
    if (titleEl) {
      titleEl.textContent = mode === 'DEPT' ? '🏥 Chọn Khoa / Phòng so sánh:' : '👨‍⚕️ Chọn Bác Sĩ / Người ra Y Lệnh so sánh:';
    }

    // Reset default selections for the newly active mode
    this.selectedChartEntities.clear();
    this.initDefaultChartEntities();
    this.renderChartEntityCheckboxes();
    this.renderComparisonChart();
    this.renderChartDataTable();
  }

  setChartVisualType(type) {
    this.chartVisualType = type;
    ['bar', 'hbar', 'line'].forEach(t => {
      const btn = document.getElementById(`btn-chart-type-${t}`);
      if (btn) btn.classList.toggle('active', t === type);
    });
    this.renderComparisonChart();
  }

  renderChartMetricsCheckboxes() {
    const container = document.getElementById('chart-metrics-container');
    if (!container) return;

    const defs = this.getChartMetricDefs();
    container.innerHTML = defs.map(m => {
      const isChecked = this.selectedChartMetrics.has(m.key);
      return `
        <label class="metric-chip-label ${isChecked ? 'active' : ''}" style="${isChecked ? `border-color: ${m.color}; color: ${m.color};` : ''}">
          <input type="checkbox" ${isChecked ? 'checked' : ''} onchange="window.hsbaApp.toggleChartMetric('${m.key}')" />
          <span class="metric-color-dot" style="background: ${m.color};"></span>
          <span>${escapeHtml(m.label)}</span>
        </label>
      `;
    }).join('');
  }

  toggleChartMetric(metricKey) {
    if (this.selectedChartMetrics.has(metricKey)) {
      if (this.selectedChartMetrics.size <= 1) {
        showToast('Vui lòng chọn ít nhất 1 chỉ số để hiển thị trên biểu đồ!', 'warning');
        this.renderChartMetricsCheckboxes();
        return;
      }
      this.selectedChartMetrics.delete(metricKey);
    } else {
      this.selectedChartMetrics.add(metricKey);
    }
    this.renderChartMetricsCheckboxes();
    this.renderComparisonChart();
    this.renderChartDataTable();
  }

  selectAllChartMetrics() {
    this.getChartMetricDefs().forEach(m => this.selectedChartMetrics.add(m.key));
    this.renderChartMetricsCheckboxes();
    this.renderComparisonChart();
    this.renderChartDataTable();
  }

  resetDefaultChartMetrics() {
    this.selectedChartMetrics = new Set(['totalDischarge', 'passedDischarge', 'dk1Count', 'dk2Count', 'unresolvedErrors']);
    this.renderChartMetricsCheckboxes();
    this.renderComparisonChart();
    this.renderChartDataTable();
  }

  selectErrorsOnlyChartMetrics() {
    this.selectedChartMetrics = new Set(['dk1Count', 'dk2Count', 'totalErrors', 'unresolvedErrors']);
    this.renderChartMetricsCheckboxes();
    this.renderComparisonChart();
    this.renderChartDataTable();
  }

  selectDischargeOnlyChartMetrics() {
    this.selectedChartMetrics = new Set(['totalDischarge', 'passedDischarge', 'pendingDischarge', 'passRatio']);
    this.renderChartMetricsCheckboxes();
    this.renderComparisonChart();
    this.renderChartDataTable();
  }

  initDefaultChartEntities() {
    if (!this.dashboardStats) return;

    if (this.chartEntityMode === 'DEPT') {
      const activeDepts = this.dashboardStats.deptStats.filter(d => (d.totalDischarge > 0 || d.totalErrors > 0));
      if (activeDepts.length > 0) {
        activeDepts.slice(0, 7).forEach(d => this.selectedChartEntities.add(d.name));
      } else {
        this.dashboardStats.deptStats.slice(0, 6).forEach(d => this.selectedChartEntities.add(d.name));
      }
    } else {
      const doctorsWithErrors = this.dashboardStats.violatorsList.filter(v => !v.isGenericDept || v.totalErrors > 0);
      if (doctorsWithErrors.length > 0) {
        doctorsWithErrors.slice(0, 7).forEach(d => this.selectedChartEntities.add(d.name));
      } else {
        this.dashboardStats.violatorsList.slice(0, 5).forEach(d => this.selectedChartEntities.add(d.name));
      }
    }
  }

  renderChartEntityCheckboxes() {
    const container = document.getElementById('chart-entities-container');
    const badgeEl = document.getElementById('chart-entity-count-badge');
    const searchEl = document.getElementById('chart-entity-search');
    if (!container || !this.dashboardStats) return;

    const keyword = searchEl ? removeVietnameseTones(searchEl.value.trim()) : '';
    let entityItems = [];

    if (this.chartEntityMode === 'DEPT') {
      entityItems = this.dashboardStats.deptStats.map(d => ({
        id: d.name,
        name: d.name,
        badgeText: `${d.totalDischarge} RV · ${d.totalErrors} lỗi`,
        totalDischarge: d.totalDischarge,
        totalErrors: d.totalErrors,
        errorScore: d.dk2Count * 2 + d.dk1Count + d.unresolvedErrors
      }));
    } else {
      entityItems = this.dashboardStats.violatorsList.map(v => ({
        id: v.name,
        name: v.name,
        dept: v.department,
        badgeText: `${v.totalErrors} lỗi · ${v.dk2Count} ĐK2`,
        totalDischarge: 0,
        totalErrors: v.totalErrors,
        errorScore: v.dk2Count * 2 + v.dk1Count + v.unresolvedCount
      }));
    }

    if (keyword) {
      entityItems = entityItems.filter(e => {
        const nameClean = removeVietnameseTones(e.name || '');
        const deptClean = removeVietnameseTones(e.dept || '');
        return nameClean.includes(keyword) || deptClean.includes(keyword);
      });
    }

    if (badgeEl) {
      badgeEl.textContent = `${this.selectedChartEntities.size} / ${this.chartEntityMode === 'DEPT' ? this.dashboardStats.deptStats.length : this.dashboardStats.violatorsList.length} đã chọn`;
    }

    if (!entityItems.length) {
      container.innerHTML = '<span class="text-xs text-muted p-2">Không tìm thấy khoa/bác sĩ phù hợp</span>';
      return;
    }

    container.innerHTML = entityItems.map(item => {
      const isChecked = this.selectedChartEntities.has(item.id);
      return `
        <label class="entity-chip-label ${isChecked ? 'active' : ''}">
          <input type="checkbox" ${isChecked ? 'checked' : ''} onchange="window.hsbaApp.toggleChartEntity('${escapeHtml(item.id)}')" />
          <span>${escapeHtml(item.name)}</span>
          <span class="entity-count-badge">${escapeHtml(item.badgeText)}</span>
        </label>
      `;
    }).join('');
  }

  toggleChartEntity(entityId) {
    if (this.selectedChartEntities.has(entityId)) {
      this.selectedChartEntities.delete(entityId);
    } else {
      this.selectedChartEntities.add(entityId);
    }
    this.renderChartEntityCheckboxes();
    this.renderComparisonChart();
    this.renderChartDataTable();
  }

  selectAllChartEntities() {
    if (!this.dashboardStats) return;
    if (this.chartEntityMode === 'DEPT') {
      this.dashboardStats.deptStats.forEach(d => this.selectedChartEntities.add(d.name));
    } else {
      this.dashboardStats.violatorsList.forEach(v => this.selectedChartEntities.add(v.name));
    }
    this.renderChartEntityCheckboxes();
    this.renderComparisonChart();
    this.renderChartDataTable();
  }

  selectTopErrorsChartEntities(topN = 5) {
    if (!this.dashboardStats) return;
    this.selectedChartEntities.clear();
    if (this.chartEntityMode === 'DEPT') {
      const sorted = [...this.dashboardStats.deptStats].sort((a, b) => 
        (b.dk2Count * 2 + b.dk1Count + b.unresolvedErrors) - (a.dk2Count * 2 + a.dk1Count + a.unresolvedErrors) ||
        b.totalErrors - a.totalErrors
      );
      sorted.slice(0, topN).forEach(d => this.selectedChartEntities.add(d.name));
    } else {
      const sorted = [...this.dashboardStats.violatorsList].sort((a, b) => 
        (b.dk2Count * 2 + b.dk1Count + b.unresolvedCount) - (a.dk2Count * 2 + a.dk1Count + a.unresolvedCount) ||
        b.totalErrors - a.totalErrors
      );
      sorted.slice(0, topN).forEach(v => this.selectedChartEntities.add(v.name));
    }
    this.renderChartEntityCheckboxes();
    this.renderComparisonChart();
    this.renderChartDataTable();
  }

  selectTopDischargeChartEntities(topN = 5) {
    if (!this.dashboardStats) return;
    this.selectedChartEntities.clear();
    if (this.chartEntityMode === 'DEPT') {
      const sorted = [...this.dashboardStats.deptStats].sort((a, b) => b.totalDischarge - a.totalDischarge);
      sorted.slice(0, topN).forEach(d => this.selectedChartEntities.add(d.name));
    } else {
      // For doctors, fallback to top records count
      const sorted = [...this.dashboardStats.violatorsList].sort((a, b) => b.totalErrors - a.totalErrors);
      sorted.slice(0, topN).forEach(v => this.selectedChartEntities.add(v.name));
    }
    this.renderChartEntityCheckboxes();
    this.renderComparisonChart();
    this.renderChartDataTable();
  }

  clearAllChartEntities() {
    this.selectedChartEntities.clear();
    this.renderChartEntityCheckboxes();
    this.renderComparisonChart();
    this.renderChartDataTable();
  }

  renderComparisonChart() {
    const canvas = document.getElementById('dashboard-comparison-chart');
    if (!canvas) return;

    // Check if Chart.js is ready
    if (typeof Chart === 'undefined') {
      const parent = canvas.parentElement;
      if (parent) {
        parent.innerHTML = '<div class="p-6 text-center text-muted">Đang tải thư viện biểu đồ so sánh Chart.js...</div>';
      }
      return;
    }

    if (this.chartInstance) {
      this.chartInstance.destroy();
      this.chartInstance = null;
    }

    if (!this.dashboardStats || this.selectedChartEntities.size === 0 || this.selectedChartMetrics.size === 0) {
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.font = '14px Inter, sans-serif';
      ctx.fillStyle = '#94a3b8';
      ctx.textAlign = 'center';
      ctx.fillText('Vui lòng chọn ít nhất 1 khoa/bác sĩ và 1 chỉ số để hiển thị biểu đồ so sánh.', canvas.width / 2 || 200, 150);
      return;
    }

    const defs = this.getChartMetricDefs().filter(m => this.selectedChartMetrics.has(m.key));
    let labels = [];
    let entityDataMap = [];

    if (this.chartEntityMode === 'DEPT') {
      const selectedList = this.dashboardStats.deptStats.filter(d => this.selectedChartEntities.has(d.name));
      labels = selectedList.map(d => d.name);
      entityDataMap = selectedList.map(d => ({
        totalDischarge: d.totalDischarge,
        passedDischarge: d.passedDischarge,
        pendingDischarge: d.pendingDischarge,
        dk1Count: d.dk1Count,
        dk2Count: d.dk2Count,
        totalErrors: d.totalErrors,
        unresolvedErrors: d.unresolvedErrors,
        passRatio: d.passRatio
      }));
    } else {
      const selectedList = this.dashboardStats.violatorsList.filter(v => this.selectedChartEntities.has(v.name));
      labels = selectedList.map(v => v.name);
      entityDataMap = selectedList.map(v => ({
        totalDischarge: 0,
        passedDischarge: 0,
        pendingDischarge: 0,
        dk1Count: v.dk1Count,
        dk2Count: v.dk2Count,
        totalErrors: v.totalErrors,
        unresolvedErrors: v.unresolvedCount,
        passRatio: 0
      }));
    }

    const isHorizontal = this.chartVisualType === 'hbar';
    const isLine = this.chartVisualType === 'line';

    const datasets = defs.map(metric => {
      const data = entityDataMap.map(item => item[metric.key] || 0);
      return {
        label: metric.label,
        data: data,
        backgroundColor: isLine ? metric.bgColor : metric.bgColor,
        borderColor: metric.color,
        borderWidth: isLine ? 2.5 : 1,
        borderRadius: isLine ? 0 : 4,
        fill: isLine ? false : true,
        tension: isLine ? 0.25 : 0,
        pointBackgroundColor: metric.color,
        pointRadius: isLine ? 4 : 0
      };
    });

    const config = {
      type: isHorizontal ? 'bar' : (isLine ? 'line' : 'bar'),
      data: {
        labels: labels,
        datasets: datasets
      },
      options: {
        indexAxis: isHorizontal ? 'y' : 'x',
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          mode: 'index',
          intersect: false
        },
        plugins: {
          legend: {
            position: 'top',
            labels: {
              boxWidth: 14,
              boxHeight: 14,
              usePointStyle: isLine,
              font: {
                family: 'Plus Jakarta Sans, sans-serif',
                size: 11,
                weight: '600'
              },
              color: '#334155',
              padding: 14
            }
          },
          tooltip: {
            backgroundColor: 'rgba(15, 23, 42, 0.92)',
            titleFont: { size: 12, weight: 'bold' },
            bodyFont: { size: 11 },
            padding: 10,
            cornerRadius: 6
          }
        },
        scales: {
          x: {
            grid: {
              color: 'rgba(226, 232, 240, 0.6)',
              drawBorder: false
            },
            ticks: {
              color: '#64748b',
              font: { size: 11 }
            }
          },
          y: {
            beginAtZero: true,
            grid: {
              color: 'rgba(226, 232, 240, 0.6)',
              drawBorder: false
            },
            ticks: {
              precision: 0,
              color: '#64748b',
              font: { size: 11 }
            }
          }
        }
      }
    };

    this.chartInstance = new Chart(canvas, config);
  }

  toggleChartDataTable() {
    this.isChartTableExpanded = !this.isChartTableExpanded;
    const btn = document.getElementById('btn-toggle-chart-table');
    const container = document.getElementById('chart-data-table-container');
    if (btn) btn.textContent = this.isChartTableExpanded ? '▲ Ẩn bảng số liệu' : '▼ Hiện bảng số liệu';
    if (container) container.style.display = this.isChartTableExpanded ? 'block' : 'none';
    if (this.isChartTableExpanded) {
      this.renderChartDataTable();
    }
  }

  renderChartDataTable() {
    const container = document.getElementById('chart-data-table-container');
    if (!container || !this.dashboardStats) return;

    const defs = this.getChartMetricDefs().filter(m => this.selectedChartMetrics.has(m.key));
    let rows = [];

    if (this.chartEntityMode === 'DEPT') {
      const selectedList = this.dashboardStats.deptStats.filter(d => this.selectedChartEntities.has(d.name));
      rows = selectedList.map(d => ({
        name: d.name,
        code: d.code || '',
        data: d
      }));
    } else {
      const selectedList = this.dashboardStats.violatorsList.filter(v => this.selectedChartEntities.has(v.name));
      rows = selectedList.map(v => ({
        name: v.name,
        code: v.department,
        data: {
          totalDischarge: 0,
          passedDischarge: 0,
          pendingDischarge: 0,
          dk1Count: v.dk1Count,
          dk2Count: v.dk2Count,
          totalErrors: v.totalErrors,
          unresolvedErrors: v.unresolvedCount,
          passRatio: 0
        }
      }));
    }

    if (!rows.length || !defs.length) {
      container.innerHTML = '<p class="text-xs text-muted p-2">Chưa có dữ liệu để lập bảng đối chiếu.</p>';
      return;
    }

    // Compute column totals
    const totals = {};
    defs.forEach(d => {
      totals[d.key] = rows.reduce((sum, r) => sum + (r.data[d.key] || 0), 0);
    });

    container.innerHTML = `
      <div class="table-container" style="max-height: 280px; overflow-y: auto;">
        <table class="chart-matrix-table">
          <thead>
            <tr>
              <th style="width: 40px;">STT</th>
              <th>${this.chartEntityMode === 'DEPT' ? 'KHOA / PHÒNG' : 'BÁC SĨ / NGƯỜI RA Y LỆNH'}</th>
              ${defs.map(d => `<th>${escapeHtml(d.label)}</th>`).join('')}
            </tr>
          </thead>
          <tbody>
            ${rows.map((r, idx) => `
              <tr>
                <td class="font-mono text-muted text-center">${idx + 1}</td>
                <td>
                  <strong>${escapeHtml(r.name)}</strong>
                  ${r.code ? `<span class="text-xs text-muted"> (${escapeHtml(r.code)})</span>` : ''}
                </td>
                ${defs.map(d => `
                  <td>${d.key === 'passRatio' ? `${r.data[d.key]}%` : r.data[d.key]}</td>
                `).join('')}
              </tr>
            `).join('')}
          </tbody>
          <tfoot>
            <tr>
              <td colspan="2">TỔNG CỘNG (${rows.length} đối tượng):</td>
              ${defs.map(d => `
                <td>${d.key === 'passRatio' ? '---' : totals[d.key]}</td>
              `).join('')}
            </tr>
          </tfoot>
        </table>
      </div>
    `;
  }

  // Lấy thông tin và hình ảnh render của biểu đồ so sánh để nhúng vào báo cáo PDF/Excel
  getDashboardChartInfo() {
    const canvas = document.getElementById('dashboard-comparison-chart');
    let chartImage = null;
    if (canvas && this.selectedChartEntities.size > 0 && this.selectedChartMetrics.size > 0) {
      try {
        chartImage = canvas.toDataURL('image/png', 1.0);
      } catch (e) {
        console.warn('Không thể chụp hình canvas biểu đồ:', e);
      }
    }

    const defs = this.getChartMetricDefs().filter(m => this.selectedChartMetrics.has(m.key));
    let entities = [];
    if (this.chartEntityMode === 'DEPT') {
      entities = (this.dashboardStats?.deptStats || []).filter(d => this.selectedChartEntities.has(d.name));
    } else {
      entities = (this.dashboardStats?.violatorsList || []).filter(v => this.selectedChartEntities.has(v.name));
    }

    const timePeriodText = document.getElementById('dash-time-filter-text')?.textContent || formatDateVN(getTodayDateString());
    const tableRowsHtml = this.generateChartTableHtmlForReport(defs, entities);

    return {
      chartImage,
      chartMode: this.chartEntityMode,
      chartType: this.chartVisualType,
      chartTypeLabel: this.chartVisualType === 'bar' ? 'Cột dọc' : (this.chartVisualType === 'hbar' ? 'Cột ngang' : 'Đường'),
      chartTitle: `Biểu đồ so sánh chỉ số ${this.chartEntityMode === 'DEPT' ? 'Khoa / Phòng' : 'Bác Sĩ / Người ra Y lệnh'} (${this.selectedChartEntities.size} đối tượng)`,
      timePeriodLabel: timePeriodText,
      selectedMetrics: defs,
      selectedEntities: entities,
      tableRowsHtml
    };
  }

  generateChartTableHtmlForReport(defs, entities) {
    if (!entities.length || !defs.length) return '';

    const isDept = this.chartEntityMode === 'DEPT';
    return `
      <table>
        <thead>
          <tr>
            <th style="width: 35px;">STT</th>
            <th>${isDept ? 'Khoa / Phòng' : 'Bác Sĩ / Người ra Y lệnh'}</th>
            ${defs.map(d => `<th>${escapeHtml(d.label)}</th>`).join('')}
          </tr>
        </thead>
        <tbody>
          ${entities.map((item, idx) => {
            const data = isDept ? item : {
              totalDischarge: 0,
              passedDischarge: 0,
              pendingDischarge: 0,
              dk1Count: item.dk1Count || 0,
              dk2Count: item.dk2Count || 0,
              totalErrors: item.totalErrors || 0,
              unresolvedErrors: item.unresolvedCount || 0,
              passRatio: 0
            };
            return `
              <tr>
                <td style="text-align: center;">${idx + 1}</td>
                <td><strong>${escapeHtml(item.name)}</strong></td>
                ${defs.map(d => `
                  <td style="text-align: center; ${d.key.includes('Error') || d.key.includes('dk') ? 'color: #b91c1c; font-weight: bold;' : ''}">
                    ${d.key === 'passRatio' ? `${data[d.key]}%` : data[d.key]}
                  </td>
                `).join('')}
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    `;
  }

  // Tải trực tiếp file ảnh PNG của biểu đồ
  downloadChartImage() {
    const canvas = document.getElementById('dashboard-comparison-chart');
    if (!canvas) {
      showToast('Không tìm thấy khung biểu đồ!', 'error');
      return;
    }

    try {
      const imageURI = canvas.toDataURL('image/png', 1.0);
      const link = document.createElement('a');
      const timeTag = (this.dashboardTimeValue || getTodayDateString()).replace(/-/g, '');
      link.download = `Bieu_do_so_sanh_HSBA_${this.chartEntityMode}_${timeTag}.png`;
      link.href = imageURI;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      showToast('Đã tải xuống hình ảnh biểu đồ PNG độ phân giải cao thành công!', 'success');
    } catch (e) {
      console.error(e);
      showToast('Lỗi khi tải ảnh biểu đồ. Vui lòng thử lại!', 'error');
    }
  }

  // Xuất file PDF có chứa ảnh biểu đồ và bảng đối chiếu
  exportDashboardPDF() {
    const stats = this.dashboardStats || computeDashboardStats(
      storage.getRecords(),
      storage.getDischargeReports(),
      storage.getDepartments(),
      { type: this.dashboardTimeMode, value: this.dashboardTimeValue }
    );
    const chartInfo = this.getDashboardChartInfo();
    printDashboardReportPDF(stats, chartInfo);
  }

  // Xuất file Excel có chứa sheet đối chiếu biểu đồ
  exportDashboardExcel() {
    const stats = this.dashboardStats || computeDashboardStats(
      storage.getRecords(),
      storage.getDischargeReports(),
      storage.getDepartments(),
      { type: this.dashboardTimeMode, value: this.dashboardTimeValue }
    );
    const chartInfo = this.getDashboardChartInfo();
    const timeTag = (this.dashboardTimeValue || getTodayDateString()).replace(/-/g, '_');
    const filename = `Bao_cao_Tong_quan_HSBA_BVHNDK_NgheAn_${timeTag}.xlsx`;
    exportDashboardToExcel(stats, filename, chartInfo);
  }

  renderDashboardView() {
    const records = storage.getRecords();
    const dischargeReports = storage.getDischargeReports();
    const departments = storage.getDepartments();
    const currentUser = storage.getCurrentUser();

    // 0. Đồng bộ hiển thị Input ngày / tháng / năm & Scope người dùng
    this.syncDashboardTimeFilterInputs();
    this.updateDashboardUserScopeUI();

    const userFilter = (this.dashboardUserScope === 'MINE' && currentUser) ? currentUser : null;

    // 1. Tính toán toàn bộ dữ liệu thống kê theo thời gian và phạm vi người dùng
    const stats = computeDashboardStats(records, dischargeReports, departments, {
      type: this.dashboardTimeMode,
      value: this.dashboardTimeValue
    }, userFilter);
    this.dashboardStats = stats;

    const daThongCong = stats.passedDischarge;
    const totalDischarge = stats.totalDischarge;
    const gateRatio = totalDischarge > 0 ? Math.round((daThongCong / totalDischarge) * 100) : 0;
    const pushLogs = notificationService.getSystemPushLogs();

    // 2. Cập nhật 6 thẻ KPI Metrics chính
    const elTotalDischarge = document.getElementById('dash-total-discharge');
    if (elTotalDischarge) elTotalDischarge.textContent = totalDischarge;

    const elDischargeDepts = document.getElementById('dash-discharge-depts-count');
    if (elDischargeDepts) {
      if (stats.isPersonal) {
        elDischargeDepts.textContent = `Ca ra viện của BS: ${currentUser ? currentUser.name : ''}`;
      } else {
        const activeDeptsCount = stats.deptStats.filter(d => d.totalDischarge > 0).length;
        elDischargeDepts.textContent = `${activeDeptsCount}/${departments.length} khoa có ca ra viện`;
      }
    }

    const elDK1 = document.getElementById('dash-err-dk1-count');
    if (elDK1) elDK1.textContent = stats.dk1Errors.length;

    const elDK2 = document.getElementById('dash-err-dk2-count');
    if (elDK2) elDK2.textContent = stats.dk2Errors.length;

    const elGate = document.getElementById('dash-gate-passed');
    if (elGate) elGate.textContent = `${daThongCong}/${totalDischarge}`;

    const elGateRatio = document.getElementById('dash-gate-ratio');
    if (elGateRatio) elGateRatio.textContent = `${gateRatio}% ca ra viện`;

    const elTotalErrors = document.getElementById('dash-total-errors');
    if (elTotalErrors) elTotalErrors.textContent = stats.totalRecords;

    const elPendingErrors = document.getElementById('dash-pending-errors');
    if (elPendingErrors) elPendingErrors.textContent = `${stats.unresolvedRecords} lỗi chưa hoàn thành`;

    const elZalo = document.getElementById('dash-zalo-sent');
    if (elZalo) elZalo.textContent = `${pushLogs.length} thông báo`;

    // 3. Điền danh sách Khoa vào dropdown lọc người phạm lỗi
    const violatorDeptSelect = document.getElementById('dash-violator-dept-filter');
    if (violatorDeptSelect && violatorDeptSelect.options.length <= 1) {
      departments.forEach(d => {
        const opt = document.createElement('option');
        opt.value = d.name;
        opt.textContent = d.name;
        violatorDeptSelect.appendChild(opt);
      });
    }

    // 4. Render Section 1: Thống kê HSBA ra viện từng khoa
    this.renderDeptDischargeTable(stats);

    // 5. Render Section 2: Bảng rà soát Lỗi Điều kiện 1 & 2
    this.renderConditionErrorsTable(stats);

    // 6. Render Section 3: Danh sách người phạm lỗi
    this.renderViolatorsList();

    // 7. Render Section 4: Các Khâu Kiểm Lỗi Ra Viện
    const stepsSummaryContainer = document.getElementById('dash-steps-summary-container');
    if (stepsSummaryContainer) {
      const steps = [
        { key: 'kiemDuoc', name: 'Khâu Dược', icon: '💊', desc: 'Thuốc, VTYT, Kháng sinh' },
        { key: 'kiemKeToanBH', name: 'Khâu Kế toán BH', icon: '💵', desc: 'Viện phí, Mức hưởng BHYT (Tự động từ Rà soát lỗi)' },
        { key: 'kiemKHTH', name: 'Khâu KHTH', icon: '📋', desc: 'Hồ sơ, Chữ ký, Biên bản' }
      ];

      if (!totalDischarge) {
        stepsSummaryContainer.innerHTML = '<p class="text-muted text-center p-4">Chưa có dữ liệu hồ sơ ra viện trong khoảng thời gian này</p>';
      } else {
        stepsSummaryContainer.innerHTML = steps.map(s => {
          const passCount = (stats.filteredDischarges || []).filter(r => r[s.key] && r[s.key].status === 'KHONG_LOI').length;
          const errorCount = (stats.filteredDischarges || []).filter(r => r[s.key] && r[s.key].status === 'CO_LOI').length;
          const passPercent = Math.round((passCount / totalDischarge) * 100);

          return `
            <div class="dash-step-item">
              <div class="dash-step-header">
                <span class="font-medium text-main">${s.icon} ${s.name} <small class="text-muted">(${s.desc})</small></span>
                <span class="font-mono text-xs font-semibold ${errorCount > 0 ? 'text-danger' : 'text-success'}">
                  ${errorCount > 0 ? `⚠️ ${errorCount} ca có lỗi` : '✓ 100% đạt'}
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

    // 8. Render Section 5: Biểu đồ so sánh trực quan
    if (this.selectedChartEntities.size === 0) {
      this.initDefaultChartEntities();
    }
    this.renderChartMetricsCheckboxes();
    this.renderChartEntityCheckboxes();
    this.renderComparisonChart();
    if (this.isChartTableExpanded) {
      this.renderChartDataTable();
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
              <button class="btn btn-primary" onclick="window.hsbaApp.switchTab('records')">
                <span>📋 Quay lại Rà soát lỗi HSBA</span>
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
    const allSubs = ['zalo', 'pwa', 'permissions', 'departments', 'staff', 'supabase', 'backup'];
    allSubs.forEach(s => {
      const el = document.getElementById(`settings-sec-${s}`);
      if (el) el.style.display = s === currentSub ? 'block' : 'none';
    });
    document.querySelectorAll('.subnav-pill-btn, .settings-subtab-btn, [data-subtab]').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-subtab') === currentSub);
    });

    if (currentSub === 'pwa') {
      this.updatePWAInstallUI();
    }
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

        const allSubs = ['zalo', 'pwa', 'permissions', 'departments', 'staff', 'supabase', 'backup'];
        allSubs.forEach(s => {
          const sec = document.getElementById(`settings-sec-${s}`) || (s === 'departments' ? document.getElementById('settings-sec-depts') : null);
          if (sec) sec.style.display = s === subTab ? 'block' : 'none';
        });

        // Tự động re-render dữ liệu tương ứng
        if (subTab === 'pwa') this.updatePWAInstallUI();
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
          soundEnabled: document.getElementById('push-cfg-sound') ? document.getElementById('push-cfg-sound').checked : true,
          autoReminder: document.getElementById('zalo-cfg-auto').checked,
          reminderIntervalHours: parseFloat(document.getElementById('zalo-cfg-interval').value) || 2,
          oaName: document.getElementById('zalo-cfg-oaname').value.trim(),
          titleTemplate: document.getElementById('push-cfg-title-template') ? document.getElementById('push-cfg-title-template').value : '🚨 [CẢNH BÁO HSBA] {tenBenhNhan} - {mucDoCanhBao}',
          messageTemplate: document.getElementById('zalo-cfg-template').value
        };
        notificationService.saveConfig(config);
        showToast('💾 Đã lưu cấu hình Thông Báo Đẩy (Push Notification)!', 'success');
      };
    }

    const btnReqPushPermSettings = document.getElementById('btn-request-push-perm-settings');
    if (btnReqPushPermSettings) {
      btnReqPushPermSettings.onclick = async () => {
        const granted = await notificationService.requestBrowserPermission();
        if (granted) {
          showToast('✅ Đã cấp quyền thông báo trình duyệt thành công!', 'success');
        } else {
          showToast('⚠️ Bạn chưa cho phép thông báo trên trình duyệt', 'warning');
        }
        this.renderZaloSettings();
      };
    }

    const btnTestPush = document.getElementById('btn-test-push-notification');
    if (btnTestPush) {
      btnTestPush.onclick = () => {
        notificationService.sendTestNotification();
        showToast('🔔 Đã bắn thông báo đẩy thử nghiệm kèm chuông y tế!', 'success');
        this.renderZaloSettings();
      };
    }

    const btnTriggerBatchZalo = document.getElementById('btn-trigger-batch-zalo');
    if (btnTriggerBatchZalo) {
      btnTriggerBatchZalo.onclick = () => {
        const sentCount = notificationService.checkAndDispatchAutoReminders(true);
        showToast(`⚡ Đã quét và bắn Push Notification nhắc nhở (${sentCount} ca chưa sửa)!`, 'info', 4000);
        this.renderZaloSettings();
      };
    }

    const btnRefreshPushLogs = document.getElementById('btn-refresh-push-logs');
    if (btnRefreshPushLogs) {
      btnRefreshPushLogs.onclick = () => {
        this.renderZaloSettings();
        showToast('Đã làm mới nhật ký thông báo đẩy', 'info');
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
  }

  // Render cấu hình Thông Báo Đẩy (Push Notification) và Nhật ký phát thông báo
  renderZaloSettings() {
    const config = notificationService.getConfig();
    const logs = notificationService.getSystemPushLogs();
    const hasPerm = notificationService.hasBrowserPermission();

    const permBadge = document.getElementById('push-perm-badge');
    if (permBadge) {
      if (hasPerm) {
        permBadge.className = 'badge-role badge-admin';
        permBadge.style.background = '#dcfce7';
        permBadge.style.color = '#166534';
        permBadge.textContent = '🟢 Đã cấp quyền trình duyệt';
      } else {
        permBadge.className = 'badge-role';
        permBadge.style.background = '#fee2e2';
        permBadge.style.color = '#991b1b';
        permBadge.textContent = '🔴 Chưa cấp quyền';
      }
    }

    const enabledEl = document.getElementById('zalo-cfg-enabled');
    if (enabledEl) enabledEl.checked = !!config.enabled;

    const soundEl = document.getElementById('push-cfg-sound');
    if (soundEl) soundEl.checked = config.soundEnabled !== false;

    const autoEl = document.getElementById('zalo-cfg-auto');
    if (autoEl) autoEl.checked = !!config.autoReminder;

    const intervalEl = document.getElementById('zalo-cfg-interval');
    if (intervalEl) intervalEl.value = config.reminderIntervalHours || 2;

    const oaNameEl = document.getElementById('zalo-cfg-oaname');
    if (oaNameEl) oaNameEl.value = config.oaName || 'Tổ Rà Soát HSBA - Bệnh Viện';

    const titleTplEl = document.getElementById('push-cfg-title-template');
    if (titleTplEl) titleTplEl.value = config.titleTemplate || '🚨 [CẢNH BÁO HSBA] {tenBenhNhan} - {mucDoCanhBao}';

    const templateEl = document.getElementById('zalo-cfg-template');
    if (templateEl) templateEl.value = config.messageTemplate || '';

    const logsTableBody = document.getElementById('settings-zalo-logs-body');
    if (logsTableBody) {
      if (!logs.length) {
        logsTableBody.innerHTML = `<tr><td colspan="7" class="text-center text-muted p-4">Chưa có nhật ký phát thông báo đẩy nào</td></tr>`;
      } else {
        logsTableBody.innerHTML = logs.slice(0, 40).map((l, index) => {
          let levelTag = '';
          if (l.mucDoCanhBao === 'Báo động' || l.mucDoCanhBao === 'Khẩn cấp') {
            levelTag = '<span class="perm-tag" style="background:#fee2e2;color:#991b1b;">🚨 Báo động</span>';
          } else if (l.mucDoCanhBao === 'Yêu cầu kiểm tra') {
            levelTag = '<span class="perm-tag" style="background:#f3e8ff;color:#6b21a8;">🟣 Yêu cầu KT</span>';
          } else {
            levelTag = '<span class="perm-tag" style="background:#fef3c7;color:#92400e;">🟡 Nhắc nhở</span>';
          }

          return `
            <tr>
              <td class="text-center font-mono text-muted text-xs">${index + 1}</td>
              <td><span class="text-xs font-bold">${formatDateTimeVN(l.time)}</span></td>
              <td>
                <div class="font-bold text-primary">${escapeHtml(l.recipientName)}</div>
                <div class="text-xs text-muted">${escapeHtml(l.khoaPhong || '')}</div>
              </td>
              <td>
                <div><strong>${escapeHtml(l.tenBenhNhan || '')}</strong></div>
                <div class="text-xs font-mono text-muted">${escapeHtml(l.maKCB || '')}</div>
              </td>
              <td class="text-center">
                ${levelTag}
              </td>
              <td>
                <div class="font-medium text-xs text-slate-800">${escapeHtml(l.title || '')}</div>
                <div class="cell-error-text text-xs" style="-webkit-line-clamp: 1;" title="${escapeHtml(l.body || l.content || '')}">${escapeHtml(l.body || l.content || '')}</div>
              </td>
              <td class="text-center">
                ${l.isAuto ? '<span class="perm-tag perm-tag-yes">🤖 Tự động</span>' : '<span class="perm-tag" style="background:#e0f2fe;color:#0369a1;">👤 Thủ công</span>'}
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
          const roleNames = { duoc: 'Khoa Dược', ketoan: 'Nhóm KTBH', khth: 'KHTH', it: 'CNTT (IT)', nhom2: 'Khoa/Bác sĩ' };
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
    const currentUser = storage.getCurrentUser();

    if (!tableBody) return;

    tableBody.innerHTML = staffList.map((staff, index) => {
      const role = ROLES[staff.defaultRole] || ROLES.NHOM_2;
      const pushIdentifier = staff.zaloId || staff.phone || staff.id;
      const isCurrentLoggedIn = currentUser && currentUser.id === staff.id;

      return `
        <tr class="${isCurrentLoggedIn ? 'row-current-user' : ''}">
          <td class="text-center font-mono text-muted">${index + 1}</td>
          <td>
            <div class="font-bold text-primary">${escapeHtml(staff.name)}</div>
            ${isCurrentLoggedIn ? '<span class="badge-perm-allow" style="display: inline-block; margin-top: 3px; font-size: 0.72rem;">👤 Đang đăng nhập</span>' : ''}
          </td>
          <td>
            <div class="font-mono text-xs" style="color: var(--slate-800); font-weight: 600;">
              👤 ${escapeHtml(staff.username || staff.id)}
            </div>
            <div class="font-mono text-xs text-muted" style="margin-top: 2px;">
              🔑 ${escapeHtml(staff.password || '123')}
            </div>
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
              ${pushIdentifier ? `<span class="text-xs font-mono" style="color: #4f46e5;">🔔 ID: ${escapeHtml(pushIdentifier)}</span>` : ''}
            </div>
          </td>
          <td class="text-center">
            <span class="perm-tag perm-tag-yes" title="Nhân viên sẵn sàng nhận cảnh báo đẩy HSBA tức thời">🔔 Sẵn sàng Push</span>
          </td>
          <td>
            <span class="role-pill ${role.badgeClass}" title="${escapeHtml(role.description)}">${role.icon} ${escapeHtml(role.name)}</span>
          </td>
          <td class="text-center">
            <div class="action-buttons-group" style="justify-content: center;">
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

  quickDeleteRecord(recordId, e) {
    if (e) e.stopPropagation();
    const canDel = storage.canAddRecord() || storage.isAdmin();
    if (!canDel) {
      showToast('⚠️ Bạn không có quyền xóa hồ sơ lỗi này!', 'warning');
      return;
    }
    const record = storage.getRecords().find(r => r.id === recordId);
    const label = record ? `${record.tenBenhNhan || ''} (${record.maKCB || ''})` : recordId;
    if (!confirm(`Bạn có chắc chắn muốn xóa hồ sơ lỗi của bệnh nhân ${label}?`)) return;
    const ok = storage.deleteRecord(recordId);
    if (ok) {
      showToast('Đã xóa hồ sơ lỗi thành công!', 'info');
      this.refreshAllViews();
    }
  }

  quickDeleteDischargeReport(reportId, e) {
    if (e) e.stopPropagation();
    if (!storage.canDeleteDischargeReport()) {
      showToast('⚠️ Chỉ Khoa/Bác sĩ điều trị hoặc Admin mới có quyền xóa báo cáo ra viện!', 'warning');
      return;
    }
    const report = storage.getDischargeReports().find(r => r.id === reportId);
    const label = report ? `${report.tenBenhNhan || ''} (${report.maKCB || ''})` : reportId;
    if (!confirm(`Bạn có chắc chắn muốn xóa ca ra viện của bệnh nhân ${label}?`)) return;
    const ok = storage.deleteDischargeReport(reportId);
    if (ok) {
      showToast('Đã xóa ca ra viện thành công!', 'info');
      this.refreshAllViews();
    }
  }

  quickToggleDischargeGate(reportId, e) {
    if (e) e.stopPropagation();
    if (!storage.canChotThongCong()) {
      showToast('⚠️ Chỉ Phòng KHTH hoặc Admin mới có quyền chốt thông cổng!', 'warning');
      return;
    }
    const report = storage.getDischargeReports().find(r => r.id === reportId);
    if (!report) return;
    const newGate = report.chotThongCong === 'CO' ? 'CHUA' : 'CO';
    const roleName = storage.getRoleDetails().name;
    const updates = {
      chotThongCong: newGate,
      ngayThongCong: newGate === 'CO' ? new Date().toISOString().replace('T', ' ').substring(0, 16) : null,
      nguoiThongCong: newGate === 'CO' ? roleName : null
    };
    storage.updateDischargeReport(reportId, updates);
    showToast(newGate === 'CO' ? '🟢 Đã chốt ĐỒNG Ý thông cổng!' : '🔴 Đã chuyển về CHƯA thông cổng', 'success');
    this.refreshAllViews();
  }

  // ==================== PWA PROGRESSIVE WEB APP LIFECYCLE ====================
  // Khởi tạo và thiết lập PWA Service Worker + Web App Install Prompt
  initPWA() {
    // 1. Đăng ký Service Worker
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js', { scope: '/' })
          .then((registration) => {
            console.log('✅ [PWA] Service Worker đăng ký thành công với scope:', registration.scope);

            // Lắng nghe cập nhật Service Worker mới
            registration.onupdatefound = () => {
              const installingWorker = registration.installing;
              if (installingWorker) {
                installingWorker.onstatechange = () => {
                  if (installingWorker.state === 'installed' && navigator.serviceWorker.controller) {
                    console.log('🔄 [PWA] Đã tải phiên bản mới của ứng dụng');
                    showToast('Có bản cập nhật mới của ứng dụng Theo dõi HSBA!', 'info', 5000);
                  }
                };
              }
            };
          })
          .catch((error) => {
            console.error('❌ [PWA] Lỗi khi đăng ký Service Worker:', error);
          });
      });
    }

    // 2. Kiểm tra trạng thái Standalone (App Mode)
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
    if (isStandalone) {
      this.isPWAInstalled = true;
    }

    // 3. Bắt sự kiện beforeinstallprompt của trình duyệt (Android Chrome, Edge, Windows...)
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault(); // Ngăn pop-up mặc định của trình duyệt để điều khiển mượt mà
      this.deferredInstallPrompt = e;
      window.deferredInstallPrompt = e;
      console.log('📱 [PWA] Sự kiện beforeinstallprompt đã sẵn sàng');
      this.updatePWAInstallUI();
    });

    // 4. Bắt sự kiện appinstalled khi người dùng đã cài đặt xong
    window.addEventListener('appinstalled', (e) => {
      this.isPWAInstalled = true;
      this.deferredInstallPrompt = null;
      window.deferredInstallPrompt = null;
      console.log('🎉 [PWA] Ứng dụng đã được cài đặt thành công!');
      showToast('🎉 Đã cài đặt ứng dụng Theo dõi HSBA thành công trên thiết bị!', 'success', 5000);
      this.updatePWAInstallUI();
    });

    // 5. Cập nhật giao diện cài đặt PWA
    this.updatePWAInstallUI();

    // 6. Gán sự kiện click cho các nút cài đặt PWA
    this.bindPWAEvents();
  }

  // Cập nhật trạng thái hiển thị các nút và banner cài đặt PWA
  updatePWAInstallUI() {
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    const isMobile = window.innerWidth <= 768 || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    const dismissedBanner = sessionStorage.getItem('pwa_banner_dismissed') === 'true';

    // Header Button
    const headerBtn = document.getElementById('btn-header-pwa-install');
    if (headerBtn) {
      if (isStandalone) {
        headerBtn.innerHTML = '<span class="pwa-icon">✅</span><span class="pwa-text">Đang chạy App</span>';
        headerBtn.classList.add('btn-pwa-active');
        headerBtn.title = 'Ứng dụng đang mở ở chế độ App độc lập';
      } else {
        headerBtn.innerHTML = '<span class="pwa-icon">📲</span><span class="pwa-text">Cài App</span>';
        headerBtn.classList.remove('btn-pwa-active');
        headerBtn.title = 'Cài đặt App lên điện thoại / máy tính';
      }
    }

    // Mobile Banner
    const mobileBanner = document.getElementById('mobile-pwa-banner');
    if (mobileBanner) {
      if (isMobile && !isStandalone && !dismissedBanner) {
        mobileBanner.style.display = 'flex';
      } else {
        mobileBanner.style.display = 'none';
      }
    }

    // Settings Pane Status
    const statusBadge = document.getElementById('pwa-status-badge');
    const statusText = document.getElementById('pwa-status-text');
    const settingsInstallBtn = document.getElementById('btn-settings-install-pwa');

    if (statusBadge && statusText) {
      if (isStandalone) {
        statusBadge.style.background = '#f0fdf4';
        statusBadge.style.color = '#15803d';
        statusBadge.style.borderColor = '#bbf7d0';
        statusText.textContent = '🚀 Đang chạy trong App (PWA)';
        if (settingsInstallBtn) {
          settingsInstallBtn.innerHTML = '<span>✅ Ứng dụng đã được cài đặt</span>';
          settingsInstallBtn.classList.remove('btn-primary');
          settingsInstallBtn.classList.add('btn-secondary');
        }
      } else if (this.deferredInstallPrompt) {
        statusBadge.style.background = '#ecfdf5';
        statusBadge.style.color = '#047857';
        statusBadge.style.borderColor = '#a7f3d0';
        statusText.textContent = '📲 Sẵn sàng cài đặt 1-chạm';
        if (settingsInstallBtn) {
          settingsInstallBtn.innerHTML = '<span>📲 Cài đặt ngay lên thiết bị</span>';
          settingsInstallBtn.classList.add('btn-primary');
          settingsInstallBtn.classList.remove('btn-secondary');
        }
      } else if (isIOS) {
        statusBadge.style.background = '#eff6ff';
        statusBadge.style.color = '#1d4ed8';
        statusBadge.style.borderColor = '#bfdbfe';
        statusText.textContent = '🍎 Hỗ trợ Safari iOS';
      } else {
        statusBadge.style.background = '#f8fafc';
        statusBadge.style.color = '#475569';
        statusBadge.style.borderColor = '#e2e8f0';
        statusText.textContent = '🌐 Trình duyệt Web';
      }
    }
  }

  // Gán sự kiện click cho các nút liên quan đến PWA
  bindPWAEvents() {
    // Header Install button
    const headerBtn = document.getElementById('btn-header-pwa-install');
    if (headerBtn) {
      headerBtn.onclick = () => this.triggerPWAInstall();
    }

    // Mobile Banner Install button
    const bannerInstallBtn = document.getElementById('btn-install-pwa-banner');
    if (bannerInstallBtn) {
      bannerInstallBtn.onclick = () => this.triggerPWAInstall();
    }

    // Mobile Banner Dismiss button
    const bannerDismissBtn = document.getElementById('btn-dismiss-pwa-banner');
    if (bannerDismissBtn) {
      bannerDismissBtn.onclick = () => {
        const banner = document.getElementById('mobile-pwa-banner');
        if (banner) banner.style.display = 'none';
        sessionStorage.setItem('pwa_banner_dismissed', 'true');
      };
    }

    // Settings Install button
    const settingsInstallBtn = document.getElementById('btn-settings-install-pwa');
    if (settingsInstallBtn) {
      settingsInstallBtn.onclick = () => this.triggerPWAInstall();
    }

    // Open detail guide modal button in Settings
    const openGuideModalBtn = document.getElementById('btn-open-install-guide-modal');
    if (openGuideModalBtn) {
      openGuideModalBtn.onclick = () => this.modalController.openPWAInstallGuideModal();
    }

    // Clear Cache & Refresh Service Worker button
    const updateCacheBtn = document.getElementById('btn-update-pwa-cache');
    if (updateCacheBtn) {
      updateCacheBtn.onclick = async () => {
        try {
          if ('caches' in window) {
            const cacheNames = await caches.keys();
            await Promise.all(cacheNames.map(name => caches.delete(name)));
          }
          if ('serviceWorker' in navigator) {
            const registrations = await navigator.serviceWorker.getRegistrations();
            for (const reg of registrations) {
              await reg.update();
            }
          }
          showToast('✅ Đã làm mới bộ nhớ đệm và nạp dữ liệu PWA mới nhất!', 'success');
          setTimeout(() => {
            window.location.reload();
          }, 800);
        } catch (err) {
          console.error(err);
          showToast('Lỗi khi làm mới cache. Tự động tải lại...', 'info');
          window.location.reload();
        }
      };
    }
  }

  // Kích hoạt tiến trình cài đặt PWA hoặc mở Modal hướng dẫn
  async triggerPWAInstall() {
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
    if (isStandalone) {
      showToast('Ứng dụng Theo dõi HSBA đang mở ở chế độ App độc lập!', 'info');
      return;
    }

    if (this.deferredInstallPrompt) {
      try {
        this.deferredInstallPrompt.prompt();
        const choiceResult = await this.deferredInstallPrompt.userChoice;
        if (choiceResult.outcome === 'accepted') {
          showToast('Đang cài đặt ứng dụng Theo dõi HSBA...', 'info');
        } else {
          showToast('Bạn đã hủy cài đặt ứng dụng', 'warning');
        }
        this.deferredInstallPrompt = null;
        this.updatePWAInstallUI();
      } catch (err) {
        console.error('Lỗi khi kích hoạt install prompt:', err);
        this.modalController.openPWAInstallGuideModal();
      }
    } else {
      // Mở modal hướng dẫn chi tiết theo hệ điều hành (iOS hoặc Android)
      this.modalController.openPWAInstallGuideModal();
    }
  }
}

// Khởi tạo app khi DOM tải xong
document.addEventListener('DOMContentLoaded', () => {
  window.hsbaApp = new App();
});
