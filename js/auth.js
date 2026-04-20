// ── AUTH SYSTEM ──
const AUTH_KEY = 'nexora_auth';
const USERS_KEY = 'nexora_users';
const LOGS_KEY = 'nexora_logs';
const INSTALL_COUNT_KEY = 'nexora_install_counts';

// Default admin account
const DEFAULT_ADMIN = {
  id: 'admin_001',
  username: 'admin',
  password: btoa('Admin@2025'), // base64 encoded
  email: 'admin@nexora.dev',
  role: 'admin',
  accessLevel: 'unlimited',
  createdAt: new Date().toISOString(),
  status: 'active'
};

// ── INIT ──
function initUsers() {
  let users = getUsers();
  if (!users.find(u => u.role === 'admin')) {
    users.unshift(DEFAULT_ADMIN);
    saveUsers(users);
  }
}

function getUsers() {
  try { return JSON.parse(localStorage.getItem(USERS_KEY) || '[]'); }
  catch { return []; }
}

function saveUsers(users) {
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

// ── SESSION ──
function getSession() {
  try { return JSON.parse(localStorage.getItem(AUTH_KEY)); }
  catch { return null; }
}

function setSession(user) {
  const session = { ...user, password: undefined, loginAt: new Date().toISOString() };
  localStorage.setItem(AUTH_KEY, JSON.stringify(session));
}

function clearSession() {
  localStorage.removeItem(AUTH_KEY);
}

function requireAuth(role) {
  const session = getSession();
  if (!session) {
    window.location.href = 'index.html';
    return null;
  }
  if (role === 'admin' && session.role !== 'admin') {
    window.location.href = 'dashboard.html';
    return null;
  }
  return session;
}

function requireGuest() {
  const session = getSession();
  if (session) {
    if (session.role === 'admin') window.location.href = 'admin.html';
    else window.location.href = 'dashboard.html';
  }
}

// ── REGISTER ──
function register(username, email, password) {
  const users = getUsers();

  if (users.find(u => u.username.toLowerCase() === username.toLowerCase())) {
    return { ok: false, msg: 'Username already taken' };
  }
  if (users.find(u => u.email.toLowerCase() === email.toLowerCase())) {
    return { ok: false, msg: 'Email already registered' };
  }
  if (username.length < 3) return { ok: false, msg: 'Username min 3 characters' };
  if (password.length < 6) return { ok: false, msg: 'Password min 6 characters' };

  const user = {
    id: 'user_' + Date.now(),
    username,
    email,
    password: btoa(password),
    role: 'member',
    accessLevel: 'limited', // limited = 1x install lifetime
    createdAt: new Date().toISOString(),
    status: 'active'
  };

  users.push(user);
  saveUsers(users);
  return { ok: true, user };
}

// ── LOGIN ──
function login(username, password) {
  initUsers();
  const users = getUsers();
  const user = users.find(u =>
    u.username.toLowerCase() === username.toLowerCase() ||
    u.email.toLowerCase() === username.toLowerCase()
  );

  if (!user) return { ok: false, msg: 'User not found' };
  if (user.status === 'suspended') return { ok: false, msg: 'Account suspended' };
  if (atob(user.password) !== password) return { ok: false, msg: 'Wrong password' };

  setSession(user);
  return { ok: true, user };
}

// ── LOGOUT ──
function logout() {
  clearSession();
  window.location.href = 'index.html';
}

// ── INSTALL COUNT (for limited users) ──
function getInstallCount(userId) {
  try {
    const counts = JSON.parse(localStorage.getItem(INSTALL_COUNT_KEY) || '{}');
    return counts[userId] || 0;
  } catch { return 0; }
}

function incrementInstallCount(userId) {
  try {
    const counts = JSON.parse(localStorage.getItem(INSTALL_COUNT_KEY) || '{}');
    counts[userId] = (counts[userId] || 0) + 1;
    localStorage.setItem(INSTALL_COUNT_KEY, JSON.stringify(counts));
  } catch {}
}

function canUserInstall(user) {
  if (user.role === 'admin') return { allowed: true };
  if (user.accessLevel === 'unlimited') return { allowed: true };
  const count = getInstallCount(user.id);
  if (count >= 1) return { allowed: false, reason: 'Free quota exhausted (1x lifetime install). Ask admin for full access.' };
  return { allowed: true };
}

// ── LOGS ──
function getLogs() {
  try { return JSON.parse(localStorage.getItem(LOGS_KEY) || '[]'); }
  catch { return []; }
}

function addLog(entry) {
  const logs = getLogs();
  logs.unshift({
    id: 'log_' + Date.now(),
    timestamp: new Date().toISOString(),
    ...entry
  });
  // Keep last 200
  if (logs.length > 200) logs.splice(200);
  localStorage.setItem(LOGS_KEY, JSON.stringify(logs));
}

// ── FORMAT ──
function formatDate(iso) {
  if (!iso) return '-';
  const d = new Date(iso);
  return d.toLocaleDateString('id-ID', { day:'2-digit', month:'short', year:'numeric' })
    + ' ' + d.toLocaleTimeString('id-ID', { hour:'2-digit', minute:'2-digit' });
}

function formatRelative(iso) {
  if (!iso) return '-';
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return m + 'm ago';
  const h = Math.floor(m / 60);
  if (h < 24) return h + 'h ago';
  return Math.floor(h / 24) + 'd ago';
}

// ── INIT ──
initUsers();
