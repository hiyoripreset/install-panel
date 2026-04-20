# NEXORA Panel Installer

Web-based Pterodactyl Panel installer with user management, install logs, and role-based access.

---

## Project Structure

```
panel-installer/
├── index.html          ← Login / Register
├── dashboard.html      ← Member dashboard + install form
├── admin.html          ← Admin dashboard (users, logs, install)
├── css/
│   └── style.css       ← Global styles (cyber neon blue)
├── js/
│   ├── auth.js         ← Auth logic (login, register, session)
│   ├── app.js          ← Dashboard rendering, user/log management
│   └── install.js      ← Install engine + terminal output
├── api/
│   └── server.js       ← Express backend (SSH install handler)
└── package.json
```

---

## Deploy Guide

### Frontend (GitHub Pages / Vercel / Netlify)
1. Push the root folder to GitHub
2. Deploy to GitHub Pages / Vercel (point to root)
3. **Edit `js/install.js` line 4** — ganti URL backend:
   ```js
   : 'https://your-backend.railway.app'
   ```

### Backend (Railway / Render)
1. Push folder ke GitHub
2. Di Railway: New Project → Deploy from GitHub → set **root directory** ke `/`
3. Start command: `npm start`
4. Setelah deploy, copy URL Railway ke `js/install.js`

---

## Default Admin Account
- Username: `admin`
- Password: `Admin@2025`

**Ganti password di dashboard setelah pertama login!**

---

## Features
- ✅ Login / Register dengan role member & admin
- ✅ Member: 1x install gratis selamanya (tanpa akses admin)
- ✅ Admin bisa grant/revoke unlimited access per user
- ✅ Install Pterodactyl Panel + Wings (standard & custom alias mode)
- ✅ Pilih port allocation: Panel (2000-5000) atau Minecraft (19110-20000)
- ✅ Auto node config + Wings activation (node langsung hijau)
- ✅ Start Wings via token (Swings)
- ✅ Live terminal output saat install berlangsung
- ✅ Riwayat install per user & global log untuk admin
- ✅ User management: suspend, grant/revoke access, add user
