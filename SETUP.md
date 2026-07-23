# Study Vault — Setup Guide

## 🚀 Your App is LIVE at:
## 👉 https://mshakib0205-cell.github.io/personal-vault/

**GitHub Repo:** https://github.com/mshakib0205-cell/personal-vault

---

## What You Need

- ✅ A [MEGA](https://mega.nz) account (free, 20 GB) — sign up at **mega.nz**
- ✅ GitHub repo already set up ✓

---

## Step 1 — Create a MEGA Account (if you don't have one)

1. Go to **[mega.nz/register](https://mega.nz/register)**
2. Enter your email and create a strong password
3. Verify your email
4. You get **20 GB free storage** — no credit card needed

---

## Step 2 — Host on GitHub Pages (Free HTTPS)

### 2a — Create a GitHub Repository

1. Go to **[github.com](https://github.com)** and log in
2. Click **➕ New** → **New repository**
3. Name it: `study-vault` (or anything you like)
4. Set it to **Public**
5. Click **Create repository**

### 2b — Upload the App Files

**Option A: GitHub Website (Easiest)**
1. Open the repository you just created
2. Click **"uploading an existing file"**
3. Drag ALL files from `E:\personal vault\` into the upload area
4. Make sure to include ALL subfolders (`css/`, `js/`, `icons/`)
5. Click **Commit changes**

**Option B: Git (Command Line)**
```bash
cd "E:\personal vault"
git init
git add .
git commit -m "Initial Study Vault"
git branch -M main
git remote add origin https://github.com/YOURUSERNAME/study-vault.git
git push -u origin main
```

### 2c — Enable GitHub Pages

1. Go to your repository → **Settings** tab
2. Click **Pages** (left sidebar)
3. Under **Source**, select **"Deploy from a branch"**
4. Choose **main** branch → **/ (root)** folder
5. Click **Save**

**Your app will be live at:**
```
https://YOURUSERNAME.github.io/study-vault/
```
*(takes ~2 minutes to go live)*

---

## Step 3 — Open the App

1. Visit your GitHub Pages URL: `https://YOURUSERNAME.github.io/study-vault/`
2. Sign in with your **MEGA email and password**
3. The app creates a `StudyVault` folder in your MEGA account
4. Start uploading your study files!

---

## Step 4 — Install as PWA (Optional but Recommended)

### On Android / Chrome:
1. Open the app URL in Chrome
2. Tap the **⋮ menu** → **Add to Home Screen**
3. Tap **Add** — the app icon appears on your home screen

### On Desktop Chrome/Edge:
1. Open the app URL
2. Click the **📲 install icon** in the address bar
3. Click **Install** — the app opens as a standalone window

### On iOS Safari:
1. Open the app URL in Safari
2. Tap the **Share** button (square with arrow)
3. Scroll down → tap **Add to Home Screen**
4. Tap **Add**

---

## Troubleshooting

### "Login failed" error
- Double-check your MEGA email and password
- Make sure you verified your MEGA email after signup
- Try logging in at [mega.nz](https://mega.nz) first to confirm credentials

### App not loading
- Make sure GitHub Pages is enabled (Step 2c)
- Wait 2-3 minutes after enabling GitHub Pages
- Try a hard refresh: `Ctrl + Shift + R` (or `Cmd + Shift + R` on Mac)

### Files not uploading
- Check your internet connection
- Make sure the file type is allowed (no videos or audio)
- Maximum file size: limited by your available MEGA quota (20 GB free)

### App works offline?
- The app shell (UI) works offline after first load
- Recently opened files (up to 100 MB) are cached for offline viewing
- Uploading requires internet connection

---

## File Types Allowed

| Category | Extensions |
|---|---|
| Documents | PDF, DOC, DOCX, PPT, PPTX, XLS, XLSX, ODT, ODS, ODP |
| Images | JPG, PNG, WEBP, GIF, SVG, BMP |
| Code | Java, C, C++, Python, JS, TS, HTML, CSS, PHP, Ruby, Go, Rust, SQL, JSON, XML, YAML, Markdown, Jupyter |
| Archives | ZIP, RAR, 7Z, TAR, GZ |
| Text | TXT, CSV, RTF, MD |

❌ **Not allowed:** Videos (MP4, AVI, etc.) and Audio (MP3, WAV, etc.)

---

## Storage Details

- **Provider:** MEGA (mega.nz)
- **Free Storage:** 20 GB
- **Encryption:** End-to-end (even MEGA can't read your files)
- **Cross-device:** Login from any device, same files
- **Privacy:** Files stored in your personal MEGA account

---

## Need More Storage?

Upgrade your MEGA account at **[mega.nz/pro](https://mega.nz/pro)**:
- Pro Lite: 400 GB — ~€4.99/month
- Pro I: 2 TB — ~€9.99/month
- Pro II: 8 TB — ~€19.99/month

The app automatically uses whatever storage your MEGA account has.
