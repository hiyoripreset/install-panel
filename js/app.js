// ── APP HELPERS ──

// Render navbar user info
function renderNavUser() {
  const session = getSession();
  if (!session) return;
  const nameEl = document.getElementById('nav-username');
  const badgeEl = document.getElementById('nav-role-badge');
  if (nameEl) nameEl.textContent = session.username;
  if (badgeEl) {
    badgeEl.textContent = session.role;
    badgeEl.className = 'nav-badge ' + (session.role === 'admin' ? 'badge-admin' : 'badge-member');
  }
}

// Render install stats for member dashboard
function renderMemberStats() {
  const session = getSession();
  if (!session) return;
  const count = getInstallCount(session.id);
  const isLimited = session.accessLevel === 'limited';
  const remaining = isLimited ? Math.max(0, 1 - count) : '∞';

  const countEl = document.getElementById('stat-install-count');
  const remainEl = document.getElementById('stat-remaining');
  const accessEl = document.getElementById('stat-access-level');

  if (countEl) countEl.textContent = count;
  if (remainEl) remainEl.textContent = remaining;
  if (accessEl) {
    accessEl.textContent = session.accessLevel === 'unlimited' ? 'Full Access' : 'Limited (1x)';
    accessEl.className = session.accessLevel === 'unlimited' ? 'stat-value text-success' : 'stat-value text-warning';
  }

  // Show limit warning if needed
  if (isLimited && count >= 1) {
    const limitBox = document.getElementById('limit-warning');
    if (limitBox) limitBox.style.display = 'flex';
  }
}

// Render recent logs (member only sees own)
function renderMemberLogs() {
  const session = getSession();
  const logs = getLogs().filter(l => l.userId === session.id);
  const tbody = document.getElementById('my-logs-body');
  if (!tbody) return;

  if (logs.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:24px;">No install history yet</td></tr>`;
    return;
  }

  tbody.innerHTML = logs.slice(0, 20).map(l => `
    <tr>
      <td class="mono">${l.ipvps || '-'}</td>
      <td class="mono">${l.domainPanel || '-'}</td>
      <td>
        <span class="status ${l.status === 'success' ? 'status-success' : l.status === 'failed' ? 'status-error' : 'status-pending'}">
          ${l.status}
        </span>
      </td>
      <td style="color:var(--text-muted);font-size:12px;">${formatRelative(l.timestamp)}</td>
      <td style="color:var(--text-muted);font-size:12px;">${formatDate(l.timestamp)}</td>
    </tr>
  `).join('');
}

// Admin: render all users
function renderAdminUsers() {
  const users = getUsers();
  const tbody = document.getElementById('users-body');
  if (!tbody) return;

  tbody.innerHTML = users.map(u => `
    <tr>
      <td class="mono" style="color:var(--text-muted);font-size:11px;">${u.id.slice(-8)}</td>
      <td><span class="mono">${u.username}</span></td>
      <td style="font-size:12px;color:var(--text-muted);">${u.email}</td>
      <td>
        <span class="nav-badge ${u.role === 'admin' ? 'badge-admin' : 'badge-member'}">${u.role}</span>
      </td>
      <td>
        <span class="status ${u.accessLevel === 'unlimited' ? 'status-success' : 'status-pending'}">
          ${u.accessLevel === 'unlimited' ? 'unlimited' : 'limited'}
        </span>
      </td>
      <td>
        <span class="status ${u.status === 'active' ? 'status-success' : 'status-error'}">${u.status || 'active'}</span>
      </td>
      <td style="font-size:11px;color:var(--text-muted);">${getInstallCount(u.id)}</td>
      <td>
        <div class="flex gap-8">
          ${u.role !== 'admin' ? `
            <button class="btn btn-primary btn-sm" onclick="toggleAccess('${u.id}')">
              ${u.accessLevel === 'unlimited' ? 'Revoke' : 'Grant'} Access
            </button>
            <button class="btn btn-danger btn-sm" onclick="toggleSuspend('${u.id}')">
              ${u.status === 'suspended' ? 'Unsuspend' : 'Suspend'}
            </button>
          ` : '<span style="color:var(--text-muted);font-size:12px;">─</span>'}
        </div>
      </td>
    </tr>
  `).join('');
}

// Admin: all logs
function renderAdminLogs() {
  const logs = getLogs();
  const tbody = document.getElementById('all-logs-body');
  if (!tbody) return;

  if (logs.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:24px;">No logs yet</td></tr>`;
    return;
  }

  tbody.innerHTML = logs.slice(0, 50).map(l => `
    <tr>
      <td style="font-size:11px;color:var(--text-muted);">${formatDate(l.timestamp)}</td>
      <td class="mono">${l.username || '-'}</td>
      <td class="mono">${l.ipvps || '-'}</td>
      <td class="mono" style="font-size:12px;">${l.domainPanel || '-'}</td>
      <td>
        <span class="status ${l.status === 'success' ? 'status-success' : l.status === 'failed' ? 'status-error' : 'status-pending'}">
          ${l.status}
        </span>
      </td>
      <td style="font-size:11px;color:var(--text-muted);max-width:200px;overflow:hidden;text-overflow:ellipsis;">
        ${l.error || '-'}
      </td>
    </tr>
  `).join('');
}

// Admin: stats
function renderAdminStats() {
  const users = getUsers();
  const logs = getLogs();
  const members = users.filter(u => u.role === 'member');
  const unlimited = members.filter(u => u.accessLevel === 'unlimited');
  const successInstalls = logs.filter(l => l.status === 'success');

  const totalUsersEl = document.getElementById('stat-total-users');
  const unlimitedEl = document.getElementById('stat-unlimited-users');
  const totalInstallsEl = document.getElementById('stat-total-installs');
  const logsCountEl = document.getElementById('stat-logs-count');

  if (totalUsersEl) totalUsersEl.textContent = members.length;
  if (unlimitedEl) unlimitedEl.textContent = unlimited.length;
  if (totalInstallsEl) totalInstallsEl.textContent = successInstalls.length;
  if (logsCountEl) logsCountEl.textContent = logs.length;
}

// Toggle user access level
function toggleAccess(userId) {
  const users = getUsers();
  const user = users.find(u => u.id === userId);
  if (!user) return;
  user.accessLevel = user.accessLevel === 'unlimited' ? 'limited' : 'unlimited';
  saveUsers(users);
  renderAdminUsers();
  renderAdminStats();
}

// Toggle user suspend
function toggleSuspend(userId) {
  const users = getUsers();
  const user = users.find(u => u.id === userId);
  if (!user) return;
  user.status = user.status === 'suspended' ? 'active' : 'suspended';
  saveUsers(users);
  renderAdminUsers();
}

// Delete user
function deleteUser(userId) {
  if (!confirm('Delete this user?')) return;
  let users = getUsers();
  users = users.filter(u => u.id !== userId);
  saveUsers(users);
  renderAdminUsers();
  renderAdminStats();
}

// Admin: filter logs by user
function filterLogs() {
  const search = document.getElementById('log-search')?.value.toLowerCase() || '';
  const logs = getLogs().filter(l =>
    !search ||
    (l.username && l.username.toLowerCase().includes(search)) ||
    (l.ipvps && l.ipvps.includes(search)) ||
    (l.domainPanel && l.domainPanel.toLowerCase().includes(search))
  );
  const tbody = document.getElementById('all-logs-body');
  if (!tbody) return;

  if (logs.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:24px;">No matching logs</td></tr>`;
    return;
  }

  tbody.innerHTML = logs.slice(0, 50).map(l => `
    <tr>
      <td style="font-size:11px;color:var(--text-muted);">${formatDate(l.timestamp)}</td>
      <td class="mono">${l.username || '-'}</td>
      <td class="mono">${l.ipvps || '-'}</td>
      <td class="mono" style="font-size:12px;">${l.domainPanel || '-'}</td>
      <td>
        <span class="status ${l.status === 'success' ? 'status-success' : l.status === 'failed' ? 'status-error' : 'status-pending'}">
          ${l.status}
        </span>
      </td>
      <td style="font-size:11px;color:var(--text-muted);">${l.error || '-'}</td>
    </tr>
  `).join('');
}

// Admin: add member via form
function addMember(e) {
  e.preventDefault();
  const username = document.getElementById('new-username').value.trim();
  const email = document.getElementById('new-email').value.trim();
  const password = document.getElementById('new-password').value;
  const accessLevel = document.getElementById('new-access').value;

  const result = register(username, email, password);
  if (!result.ok) {
    showAdminAlert(result.msg, 'danger');
    return;
  }

  // Set access level
  const users = getUsers();
  const user = users.find(u => u.id === result.user.id);
  if (user) {
    user.accessLevel = accessLevel;
    saveUsers(users);
  }

  document.getElementById('add-user-modal').classList.remove('active');
  document.getElementById('add-user-form').reset();
  renderAdminUsers();
  renderAdminStats();
  showAdminAlert(`User "${username}" created successfully`, 'success');
}

function showAdminAlert(msg, type) {
  const el = document.getElementById('admin-alert');
  if (!el) return;
  el.className = `alert alert-${type}`;
  el.textContent = msg;
  el.style.display = 'flex';
  setTimeout(() => { el.style.display = 'none'; }, 4000);
}
