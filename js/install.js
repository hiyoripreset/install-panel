// ── INSTALL ENGINE ──
// Backend API URL - ubah sesuai deploy Railway/Render kamu
const API_BASE = window.location.hostname === 'localhost'
  ? 'http://localhost:3000'
  : 'https://install-panel-production.up.railway.app'; // GANTI INI

let installSocket = null;
let installActive = false;

// ── TERMINAL ──
const terminal = {
  el: null,
  init(id) { this.el = document.getElementById(id); },
  clear() { if (this.el) this.el.innerHTML = ''; },
  line(text, type = 'text') {
    if (!this.el) return;
    const ts = new Date().toLocaleTimeString('id-ID', { hour:'2-digit', minute:'2-digit', second:'2-digit' });
    const line = document.createElement('div');
    line.className = 'terminal-line';
    line.innerHTML = `
      <span class="terminal-prefix">[${ts}]</span>
      <span class="terminal-${type}">${escHtml(text)}</span>
    `;
    this.el.appendChild(line);
    this.el.scrollTop = this.el.scrollHeight;
  },
  success(t) { this.line(t, 'success'); },
  error(t) { this.line(t, 'error'); },
  warn(t) { this.line(t, 'warn'); },
  info(t) { this.line(t, 'info'); },
  text(t) { this.line(t, 'text'); },
  cursor() {
    if (!this.el) return;
    const c = document.createElement('span');
    c.className = 'terminal-cursor';
    c.id = 'term-cursor';
    this.el.appendChild(c);
    this.el.scrollTop = this.el.scrollHeight;
  },
  removeCursor() {
    const c = document.getElementById('term-cursor');
    if (c) c.remove();
  }
};

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── PROGRESS UPDATER ──
function setProgress(pct, label) {
  const bar = document.getElementById('progress-fill');
  const txt = document.getElementById('progress-label');
  const pctEl = document.getElementById('progress-pct');
  if (bar) bar.style.width = pct + '%';
  if (txt) txt.textContent = label || '';
  if (pctEl) pctEl.textContent = pct + '%';
}

// ── MAIN INSTALL ──
async function startInstall(params) {
  const { ipvps, password, domainPanel, domainNode, ramvps, ipAlias, portType, withAlias } = params;

  if (installActive) {
    alert('Install already running!');
    return;
  }

  const session = getSession();
  if (!session) return logout();

  // Check install permission
  const perm = canUserInstall(session);
  if (!perm.allowed) {
    showAlert(perm.reason, 'danger');
    return;
  }

  // Validation
  if (!ipvps || !password || !domainPanel || !domainNode || !ramvps) {
    showAlert('All fields are required!', 'danger');
    return;
  }

  // Lock UI
  installActive = true;
  toggleInstallUI(false);
  terminal.clear();

  terminal.info('▶ NEXORA PANEL INSTALLER v2.0');
  terminal.info('─'.repeat(45));
  terminal.text(`Target VPS  : ${ipvps}`);
  terminal.text(`Panel Domain: ${domainPanel}`);
  terminal.text(`Node Domain : ${domainNode}`);
  terminal.text(`RAM         : ${parseInt(ramvps)/1000} GB`);
  terminal.text(`Port Type   : ${portType === 'minecraft' ? 'Minecraft (19110-20000)' : 'Panel (2000-5000)'}`);
  if (withAlias) terminal.text(`IP Alias    : ${ipAlias}`);
  terminal.info('─'.repeat(45));
  terminal.cursor();

  setProgress(5, 'Connecting to VPS...');
  updateStatus('connecting');

  try {
    const response = await fetch(`${API_BASE}/api/install`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ipvps, password, domainPanel, domainNode, ramvps,
        ipAlias: withAlias ? ipAlias : domainNode,
        portType,
        userId: session.id,
        username: session.username
      }),
      signal: AbortSignal.timeout(900000) // 15 min timeout
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: 'Server error' }));
      throw new Error(err.error || 'Backend error');
    }

    // Stream response
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();

      for (const line of lines) {
        if (!line.trim() || !line.startsWith('data:')) continue;
        try {
          const event = JSON.parse(line.slice(5));
          handleInstallEvent(event);
        } catch {}
      }
    }

  } catch (err) {
    terminal.removeCursor();
    terminal.error('✗ ' + (err.message || 'Connection failed'));
    terminal.error('Make sure the backend API is running and reachable.');
    setProgress(0, 'Failed');
    updateStatus('error');
    installActive = false;
    toggleInstallUI(true);

    addLog({
      action: 'install_panel',
      userId: session.id,
      username: session.username,
      ipvps,
      domainPanel,
      status: 'failed',
      error: err.message
    });
  }
}

function handleInstallEvent(event) {
  const session = getSession();

  switch (event.type) {
    case 'log':
      terminal.removeCursor();
      terminal.text(event.message);
      terminal.cursor();
      break;

    case 'progress':
      setProgress(event.pct, event.label);
      if (event.label) {
        terminal.removeCursor();
        terminal.info('⟶ ' + event.label);
        terminal.cursor();
      }
      break;

    case 'step':
      terminal.removeCursor();
      terminal.info('━━ ' + event.message + ' ━━');
      terminal.cursor();
      break;

    case 'success':
      terminal.removeCursor();
      terminal.success('✓ ' + event.message);
      terminal.cursor();
      break;

    case 'error':
      terminal.removeCursor();
      terminal.error('✗ ' + event.message);
      terminal.cursor();
      break;

    case 'warn':
      terminal.removeCursor();
      terminal.warn('⚠ ' + event.message);
      terminal.cursor();
      break;

    case 'done':
      terminal.removeCursor();
      terminal.success('');
      terminal.success('━'.repeat(45));
      terminal.success('✓✓ INSTALLATION COMPLETE ✓✓');
      terminal.success('━'.repeat(45));

      if (event.data) {
        terminal.text('');
        terminal.info('Panel URL : ' + event.data.domainPanel);
        terminal.info('Username  : admin');
        terminal.info('Password  : admin');
        terminal.info('Node      : ' + event.data.domainNode);
        terminal.text('');
        terminal.warn('⚠ Change your panel password immediately!');
      }

      setProgress(100, 'Installation complete!');
      updateStatus('done');
      installActive = false;
      toggleInstallUI(true);

      // Increment install count for limited users
      if (session) {
        incrementInstallCount(session.id);
        addLog({
          action: 'install_panel',
          userId: session.id,
          username: session.username,
          ipvps: event.data?.ipvps || '-',
          domainPanel: event.data?.domainPanel || '-',
          status: 'success'
        });
      }

      showInstallSuccess(event.data);
      break;

    case 'failed':
      terminal.removeCursor();
      terminal.error('');
      terminal.error('✗ INSTALLATION FAILED: ' + (event.message || 'Unknown error'));
      setProgress(0, 'Failed');
      updateStatus('error');
      installActive = false;
      toggleInstallUI(true);

      if (session) {
        addLog({
          action: 'install_panel',
          userId: session.id,
          username: session.username,
          status: 'failed',
          error: event.message
        });
      }
      break;
  }
}

// ── UI HELPERS ──
function toggleInstallUI(enabled) {
  const btn = document.getElementById('btn-install');
  const inputs = document.querySelectorAll('.install-input');
  if (btn) {
    btn.disabled = !enabled;
    btn.textContent = enabled ? 'LAUNCH INSTALL' : 'INSTALLING...';
  }
  inputs.forEach(el => el.disabled = !enabled);
}

function updateStatus(status) {
  const el = document.getElementById('install-status');
  if (!el) return;
  el.className = 'status';
  switch (status) {
    case 'connecting': el.className += ' status-pending'; el.textContent = '● Connecting'; break;
    case 'running':    el.className += ' status-pending'; el.textContent = '● Running'; break;
    case 'done':       el.className += ' status-success'; el.textContent = '● Complete'; break;
    case 'error':      el.className += ' status-error';   el.textContent = '● Failed'; break;
    default:           el.className += ' status-pending'; el.textContent = '● Idle'; break;
  }
}

function showAlert(msg, type = 'info') {
  const existing = document.getElementById('install-alert');
  if (existing) existing.remove();
  const el = document.createElement('div');
  el.id = 'install-alert';
  el.className = `alert alert-${type}`;
  el.innerHTML = `<span>${msg}</span>`;
  const form = document.getElementById('install-form');
  if (form) form.prepend(el);
  setTimeout(() => el.remove(), 5000);
}

function showInstallSuccess(data) {
  const modal = document.getElementById('success-modal');
  if (modal && data) {
    document.getElementById('modal-domain').textContent = data.domainPanel || '-';
    document.getElementById('modal-node').textContent = data.domainNode || '-';
    modal.classList.add('active');
  }
}

// Toggle IP alias field
function toggleAlias(checked) {
  const aliasGroup = document.getElementById('alias-group');
  if (aliasGroup) {
    aliasGroup.style.display = checked ? 'block' : 'none';
  }
}
