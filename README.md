<div align="center">

<img src="icons/icon-512.png" alt="Study Vault Logo" width="120" height="120" style="border-radius:20px"/>

# 📚 Study Vault

**Your Personal Study File Manager — Secure, Fast & Free**

[![GitHub Pages](https://img.shields.io/badge/Live-GitHub%20Pages-6366f1?style=for-the-badge&logo=github)](https://mshakib0205-cell.github.io/personal-vault/)
[![MEGA Storage](https://img.shields.io/badge/Storage-MEGA%2020GB%20Free-d9534f?style=for-the-badge&logo=mega)](https://mega.nz)
[![PWA](https://img.shields.io/badge/PWA-Installable-3fb950?style=for-the-badge&logo=googlechrome)](#-install-as-app)
[![License](https://img.shields.io/badge/License-MIT-8b949e?style=for-the-badge)](LICENSE)

**🌐 Live App → [mshakib0205-cell.github.io/personal-vault](https://mshakib0205-cell.github.io/personal-vault/)**

</div>

---

## 🎯 What is Study Vault?

Study Vault is a **Progressive Web App (PWA)** that serves as your personal study file manager. Store, organize, and instantly find all your study materials from any device — phone, tablet, or desktop.

All your files are securely stored in your own **MEGA cloud account** with end-to-end encryption. The app itself is completely **free to host** on GitHub Pages.

---

## ✨ Features

| Feature | Details |
|---|---|
| 📁 **Nested Folders** | Create unlimited folders inside folders |
| ⬆️ **Smart Upload** | Drag-and-drop or browse — blocks videos & audio automatically |
| 👁️ **File Preview** | PDF, images, code with syntax highlighting, Office docs |
| 🔍 **Instant Search** | Search files and folders as you type |
| 🌙 **Dark & Light Mode** | Toggleable theme, saved to device |
| ⊞ **Grid & List View** | Switch between card grid and list layout |
| 📲 **PWA Installable** | Install on Android, iOS, and desktop like a native app |
| 📡 **Offline Access** | Recently opened files available without internet |
| ✏️ **Full File Management** | Upload, preview, download, rename, move, delete, multi-select |
| 🔐 **End-to-End Encrypted** | MEGA encrypts everything — even MEGA can't read your files |

---

## 📂 Supported File Types

| Category | Formats |
|---|---|
| 📄 Documents | PDF, DOC, DOCX, PPT, PPTX, XLS, XLSX, ODT, ODS, ODP |
| 🖼️ Images | JPG, PNG, WEBP, GIF, SVG, BMP |
| 💻 Code | Java, C, C++, Python, JS, TS, HTML, CSS, PHP, Go, Rust, SQL, JSON, YAML, Markdown, Jupyter |
| 🗜️ Archives | ZIP, RAR, 7Z, TAR, GZ |
| 📝 Text | TXT, CSV, RTF, MD |

> ❌ **Not allowed:** Videos (MP4, AVI, etc.) and Audio (MP3, WAV, etc.)

---

## 🚀 Getting Started

### Step 1 — Create a Free MEGA Account
1. Go to **[mega.nz/register](https://mega.nz/register)**
2. Sign up with any email — you get **20 GB free storage**
3. Verify your email

### Step 2 — Open the App
Visit: **[https://mshakib0205-cell.github.io/personal-vault/](https://mshakib0205-cell.github.io/personal-vault/)**

### Step 3 — Sign In & Start Uploading
- Sign in with your MEGA email and password
- The app automatically creates a `StudyVault/` folder in your MEGA account
- Create folders, upload files, and organize your study materials!

---

## 📱 Install as App

### Android (Chrome)
1. Open the app URL in Chrome
2. Tap ⋮ menu → **Add to Home Screen**
3. Tap **Add**

### iPhone / iPad (Safari)
1. Open the app URL in Safari
2. Tap the Share button (□↑)
3. Tap **Add to Home Screen** → **Add**

### Desktop (Chrome / Edge)
1. Open the app URL
2. Click the 📲 install icon in the address bar
3. Click **Install**

---

## 🏗️ Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Vanilla HTML5 + CSS3 + ES Modules (JavaScript) |
| Storage | [MEGA](https://mega.nz) Cloud — 20 GB free, end-to-end encrypted |
| Auth | MEGA account (email + password) |
| Offline Cache | IndexedDB + Service Worker |
| Hosting | GitHub Pages (free, HTTPS) |
| File Preview | Native browser APIs + Prism.js for code highlighting |
| PWA | Web App Manifest + Service Worker |

**Zero frameworks. Zero backend. Zero monthly cost.**

---

## 📁 Project Structure

```
personal-vault/
├── index.html          ← Login page
├── app.html            ← Main app shell
├── manifest.json       ← PWA manifest
├── sw.js               ← Service Worker (offline support)
├── SETUP.md            ← Detailed setup instructions
├── css/
│   ├── main.css        ← Design system (dark/light tokens, components)
│   ├── auth.css        ← Login page styles
│   └── app.css         ← App shell, navigation, file grid/list
├── js/
│   ├── mega.js         ← MEGA SDK wrapper (auth, session, quota)
│   ├── storage.js      ← Folder & file CRUD via megajs
│   ├── cache.js        ← IndexedDB (offline files + search index)
│   ├── upload.js       ← File upload with type validation & progress
│   ├── preview.js      ← File preview (PDF, image, code, archives)
│   ├── search.js       ← Universal instant search
│   ├── ui.js           ← All views, modals, toasts, rendering
│   └── sw-register.js  ← PWA install + Service Worker registration
└── icons/
    ├── icon-192.png
    └── icon-512.png
```

---

## 🔒 Security & Privacy

- **End-to-End Encryption** — MEGA encrypts all files before they leave your device
- **Your account, your data** — Files stored in YOUR personal MEGA account
- **No third-party servers** — Only MEGA's infrastructure is used
- **Session storage** — Login session cleared when browser closes (unless "Remember me" is checked)
- **File type validation** — Only study-relevant files accepted; executables and media blocked
- **HTTPS enforced** — GitHub Pages provides automatic HTTPS

---

## 🌐 Storage Options

The app uses MEGA's free 20 GB plan by default. Want more space?

| Plan | Storage | Price |
|---|---|---|
| Free | 20 GB | Free forever |
| Pro Lite | 400 GB | ~€4.99/month |
| Pro I | 2 TB | ~€9.99/month |
| Pro II | 8 TB | ~€19.99/month |

The app automatically uses whatever storage your MEGA account has — no app changes needed.

---

## 🛠️ Local Development

```bash
# Clone the repo
git clone https://github.com/mshakib0205-cell/personal-vault.git
cd personal-vault

# Start a local server (Python)
python -m http.server 8080

# Open in browser
# http://localhost:8080/index.html
```

> **Note:** Service Workers require HTTPS or `localhost`. Use `localhost` for local development.

---

## 📤 Deploy Your Own Copy

1. **Fork** this repository
2. Go to your fork → **Settings → Pages**
3. Set source: **main branch → / (root)**
4. Your app will be live at `https://YOURUSERNAME.github.io/personal-vault/`

---

## 📸 App Preview

| Login | Home | Folders |
|---|---|---|
| Sign in with MEGA | Storage stats + recent files | Navigate nested folders |

| Upload | Search | Preview |
|---|---|---|
| Drag & drop files | Instant results | PDF, code, images |

---

## 🤝 Contributing

This is a personal project, but improvements are welcome!

1. Fork the repo
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Commit changes: `git commit -m 'Add my feature'`
4. Push: `git push origin feature/my-feature`
5. Open a Pull Request

---

## 📄 License

MIT License — free to use, modify, and distribute.

---

<div align="center">

Made with ❤️ for students everywhere

**[⭐ Star this repo](https://github.com/mshakib0205-cell/personal-vault)** if it helped you!

</div>
