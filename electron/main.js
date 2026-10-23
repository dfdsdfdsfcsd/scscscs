const { app, BrowserWindow, Menu, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow = null;
let autoUpdater = null;
let updateInfo = null;
let updateDownloaded = false;

try {
  autoUpdater = require('electron-updater').autoUpdater;
  if (autoUpdater) {
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = false;
    autoUpdater.on('update-available', (info) => {
      updateInfo = info;
      if (mainWindow) {
        mainWindow.webContents.send('update:available', { version: info.version, releaseDate: info.releaseDate });
      }
    });
    autoUpdater.on('update-not-available', () => {
      if (mainWindow) mainWindow.webContents.send('update:not-available');
    });
    autoUpdater.on('download-progress', (progress) => {
      if (mainWindow) mainWindow.webContents.send('update:progress', { percent: progress.percent, transferred: progress.transferred, total: progress.total });
    });
    autoUpdater.on('update-downloaded', (info) => {
      updateDownloaded = true;
      updateInfo = info;
      if (mainWindow) mainWindow.webContents.send('update:downloaded', { version: info.version });
    });
    autoUpdater.on('error', (err) => {
      if (mainWindow) mainWindow.webContents.send('update:error', { message: String(err) });
    });
  }
} catch (e) {
  // electron-updater not installed yet — auto-update disabled
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: 'StudioPro',
    icon: path.join(__dirname, 'build', 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    show: false,
  });

  Menu.setApplicationMenu(null);

  const isDev = process.env.ELECTRON_IS_DEV !== undefined
    ? parseInt(process.env.ELECTRON_IS_DEV, 10) === 1
    : !app.isPackaged;

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

  mainWindow.once('ready-to-show', () => {
    if (mainWindow) mainWindow.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// --- Native file/folder dialogs ---

ipcMain.handle('dialog:selectFile', async () => {
  if (!mainWindow) return { canceled: true };
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Selecionar arquivo',
    properties: ['openFile'],
    filters: [
      { name: 'Documentos e imagens', extensions: ['pdf', 'jpg', 'jpeg', 'png', 'doc', 'docx'] },
      { name: 'Todos os arquivos', extensions: ['*'] },
    ],
  });
  if (result.canceled || result.filePaths.length === 0) return { canceled: true };
  const filePath = result.filePaths[0];
  const fileName = path.basename(filePath);
  const ext = path.extname(filePath).slice(1).toLowerCase();
  let exists = true;
  try { fs.accessSync(filePath); } catch { exists = false; }
  return { canceled: false, filePath, fileName, fileExt: ext, exists };
});

ipcMain.handle('dialog:selectFolder', async () => {
  if (!mainWindow) return { canceled: true };
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Selecionar pasta',
    properties: ['openDirectory'],
  });
  if (result.canceled || result.filePaths.length === 0) return { canceled: true };
  const folderPath = result.filePaths[0];
  let exists = true;
  try { fs.accessSync(folderPath); } catch { exists = false; }
  return { canceled: false, folderPath, exists };
});

ipcMain.handle('shell:openPath', async (_event, targetPath) => {
  if (!targetPath) return { success: false, error: 'Caminho vazio' };
  try {
    let p = targetPath;
    // If it's a file, open its containing folder
    try {
      const stat = fs.statSync(p);
      if (stat.isFile()) p = path.dirname(p);
    } catch { /* path may not exist — try opening anyway */ }
    await shell.openPath(p);
    return { success: true };
  } catch (err) {
    return { success: false, error: String(err) };
  }
});

ipcMain.handle('fs:pathExists', async (_event, targetPath) => {
  if (!targetPath) return { exists: false };
  try { fs.accessSync(targetPath); return { exists: true }; } catch { return { exists: false }; }
});

ipcMain.handle('fs:copyFile', async (_event, srcPath, destDir) => {
  if (!srcPath || !destDir) return { success: false, error: 'Caminhos inválidos' };
  try {
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }
    const fileName = path.basename(srcPath);
    const dest = path.join(destDir, fileName);
    fs.copyFileSync(srcPath, dest);
    return { success: true, destPath: dest };
  } catch (err) {
    return { success: false, error: String(err) };
  }
});

// --- Logo management ---
const LOGO_DIR = path.join(app.getPath('userData'), 'logo');
const LOGO_EXT = ['png', 'jpg', 'jpeg', 'svg'];

ipcMain.handle('dialog:selectLogo', async () => {
  if (!mainWindow) return { canceled: true };
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Selecionar logomarca',
    properties: ['openFile'],
    filters: [
      { name: 'Imagens (PNG, JPG, SVG)', extensions: LOGO_EXT },
      { name: 'Todos os arquivos', extensions: ['*'] },
    ],
  });
  if (result.canceled || result.filePaths.length === 0) return { canceled: true };
  const filePath = result.filePaths[0];
  const ext = path.extname(filePath).slice(1).toLowerCase();
  if (!LOGO_EXT.includes(ext)) {
    return { canceled: true, error: 'Formato não suportado. Use PNG, JPG, JPEG ou SVG.' };
  }
  try {
    if (!fs.existsSync(LOGO_DIR)) fs.mkdirSync(LOGO_DIR, { recursive: true });
    const fileName = `logo.${ext}`;
    const dest = path.join(LOGO_DIR, fileName);
    // Remove old logos with different extensions
    for (const oldExt of LOGO_EXT) {
      if (oldExt !== ext) {
        const oldPath = path.join(LOGO_DIR, `logo.${oldExt}`);
        if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
      }
    }
    fs.copyFileSync(filePath, dest);
    const fileName2 = path.basename(filePath);
    return { canceled: false, logoPath: dest, fileName: fileName2 };
  } catch (err) {
    return { canceled: true, error: String(err) };
  }
});

ipcMain.handle('fs:readLogoAsDataURL', async (_event, logoPath) => {
  if (!logoPath) return { success: false, error: 'Caminho vazio' };
  try {
    if (!fs.existsSync(logoPath)) return { success: false, error: 'Arquivo não encontrado' };
    const buffer = fs.readFileSync(logoPath);
    const ext = path.extname(logoPath).slice(1).toLowerCase();
    const mimeMap = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', svg: 'image/svg+xml' };
    const mime = mimeMap[ext] || 'application/octet-stream';
    const dataURL = `data:${mime};base64,${buffer.toString('base64')}`;
    return { success: true, dataURL };
  } catch (err) {
    return { success: false, error: String(err) };
  }
});

ipcMain.handle('fs:removeLogo', async (_event, logoPath) => {
  try {
    if (logoPath && fs.existsSync(logoPath)) {
      fs.unlinkSync(logoPath);
    }
    return { success: true };
  } catch (err) {
    return { success: false, error: String(err) };
  }
});

ipcMain.handle('fs:resolveLogoPath', async () => {
  try {
    if (!fs.existsSync(LOGO_DIR)) return { success: false };
    for (const ext of LOGO_EXT) {
      const p = path.join(LOGO_DIR, `logo.${ext}`);
      if (fs.existsSync(p)) return { success: true, logoPath: p };
    }
    return { success: false };
  } catch {
    return { success: false };
  }
});

// --- Google Drive Integration ---

const GOOGLE_CLIENT_ID = '1234567890-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx.apps.googleusercontent.com';
const GOOGLE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const REDIRECT_URI = 'http://127.0.0.1:8493/callback';
const TOKEN_FILE = path.join(app.getPath('userData'), 'gdrive-token.json');
const ROOT_FOLDER_NAME = 'StudioPro';
const CATEGORY_FOLDERS = [
  'Contratos',
  'Autorizações de Uso de Imagem',
  'Ordens de Serviço',
  'Recibos',
  'Outros Documentos',
];

function generatePKCE() {
  const crypto = require('crypto');
  const verifier = crypto.randomBytes(32).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

function loadToken() {
  try {
    if (fs.existsSync(TOKEN_FILE)) {
      return JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf-8'));
    }
  } catch {}
  return null;
}

function saveToken(token) {
  try {
    fs.writeFileSync(TOKEN_FILE, JSON.stringify(token), { mode: 0o600 });
  } catch {}
}

function deleteToken() {
  try {
    if (fs.existsSync(TOKEN_FILE)) fs.unlinkSync(TOKEN_FILE);
  } catch {}
}

async function refreshAccessToken(refreshToken) {
  const body = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  });
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Token refresh failed: ${errText}`);
  }
  const data = await res.json();
  return data;
}

async function getValidAccessToken() {
  const token = loadToken();
  if (!token) throw new Error('Not connected to Google Drive');
  const now = Date.now();
  if (token.expires_at && now > token.expires_at - 60000) {
    if (token.refresh_token) {
      const refreshed = await refreshAccessToken(token.refresh_token);
      const newToken = {
        ...token,
        access_token: refreshed.access_token,
        expires_at: now + (refreshed.expires_in || 3600) * 1000,
      };
      saveToken(newToken);
      return newToken.access_token;
    }
    throw new Error('Access token expired and no refresh token available');
  }
  return token.access_token;
}

async function driveApi(method, endpoint, body, contentType) {
  const accessToken = await getValidAccessToken();
  const headers = { 'Authorization': `Bearer ${accessToken}` };
  if (body) {
    if (contentType === 'multipart') {
      const boundary = 'b' + Math.random().toString(36).slice(2);
      headers['Content-Type'] = `multipart/related; boundary=${boundary}`;
      const parts = [];
      parts.push(`--${boundary}\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(body.metadata)}`);
      parts.push(`--${boundary}\r\nContent-Type: ${body.mimeType || 'application/pdf'}\r\n\r\n`);
      const bodyBuffer = Buffer.concat([
        Buffer.from(parts.join(''), 'utf-8'),
        body.data,
        Buffer.from(`\r\n--${boundary}--\r\n`, 'utf-8'),
      ]);
      const res = await fetch(`https://www.googleapis.com${endpoint}`, { method, headers, body: bodyBuffer });
      return res;
    } else {
      headers['Content-Type'] = contentType || 'application/json';
      const res = await fetch(`https://www.googleapis.com${endpoint}`, { method, headers, body: JSON.stringify(body) });
      return res;
    }
  }
  const res = await fetch(`https://www.googleapis.com${endpoint}`, { method, headers });
  return res;
}

async function findOrCreateFolder(name, parentId) {
  let query = `name='${name.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  if (parentId) query += ` and '${parentId}' in parents`;
  else query += ` and parents='root'`;
  const res = await driveApi('GET', `/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name)`);
  const data = await res.json();
  if (data.files && data.files.length > 0) return data.files[0];
  const createRes = await driveApi('POST', '/drive/v3/files', {
    name,
    mimeType: 'application/vnd.google-apps.folder',
    parents: parentId ? [parentId] : ['root'],
  });
  const created = await createRes.json();
  return created;
}

async function findOrCreateYearFolder(year, categoryFolderId) {
  return findOrCreateFolder(String(year), categoryFolderId);
}

async function findOrCreateClientFolder(clientName, yearFolderId) {
  if (!clientName) return null;
  return findOrCreateFolder(clientName, yearFolderId);
}

async function ensureFolderPath(category, year, clientName) {
  const root = await findOrCreateFolder(ROOT_FOLDER_NAME, null);
  const catFolder = await findOrCreateFolder(category, root.id);
  const yearFolder = await findOrCreateYearFolder(year, catFolder.id);
  if (clientName) {
    const clientFolder = await findOrCreateClientFolder(clientName, yearFolder.id);
    return { rootId: root.id, folderId: clientFolder.id };
  }
  return { rootId: root.id, folderId: yearFolder.id };
}

ipcMain.handle('gdrive:connect', async () => {
  try {
    const pkce = generatePKCE();
    const state = Math.random().toString(36).slice(2);
    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
      `client_id=${GOOGLE_CLIENT_ID}` +
      `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
      `&response_type=code` +
      `&scope=${encodeURIComponent(GOOGLE_SCOPE)}` +
      `&code_challenge=${pkce.challenge}` +
      `&code_challenge_method=S256` +
      `&state=${state}` +
      `&access_type=offline` +
      `&prompt=consent`;

    const authWin = new BrowserWindow({
      width: 500,
      height: 700,
      modal: true,
      parent: mainWindow,
      webPreferences: { contextIsolation: true, nodeIntegration: false },
    });

    return new Promise((resolve) => {
      let resolved = false;
      const timeout = setTimeout(() => {
        if (!resolved) { resolved = true; authWin.close(); resolve({ success: false, error: 'Tempo esgotado' }); }
      }, 120000);

      authWin.webContents.on('will-redirect', async (event, url) => {
        if (url.startsWith(REDIRECT_URI)) {
          event.preventDefault();
          try {
            const urlObj = new URL(url);
            const code = urlObj.searchParams.get('code');
            const returnedState = urlObj.searchParams.get('state');
            if (returnedState !== state) throw new Error('State mismatch');
            if (!code) throw new Error('No code returned');

            const tokenBody = new URLSearchParams({
              client_id: GOOGLE_CLIENT_ID,
              code,
              code_verifier: pkce.verifier,
              redirect_uri: REDIRECT_URI,
              grant_type: 'authorization_code',
            });
            const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
              method: 'POST',
              headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
              body: tokenBody.toString(),
            });
            if (!tokenRes.ok) {
              const errText = await tokenRes.text();
              throw new Error(`Token exchange failed: ${errText}`);
            }
            const tokenData = await tokenRes.json();

            // Get user email
            const userInfoRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
              headers: { 'Authorization': `Bearer ${tokenData.access_token}` },
            });
            const userInfo = await userInfoRes.json();

            const token = {
              access_token: tokenData.access_token,
              refresh_token: tokenData.refresh_token,
              expires_at: Date.now() + (tokenData.expires_in || 3600) * 1000,
              email: userInfo.email,
            };
            saveToken(token);

            resolved = true;
            clearTimeout(timeout);
            authWin.close();
            resolve({ success: true, email: userInfo.email });
          } catch (err) {
            resolved = true;
            clearTimeout(timeout);
            authWin.close();
            resolve({ success: false, error: String(err) });
          }
        }
      });

      authWin.on('closed', () => {
        if (!resolved) { resolved = true; clearTimeout(timeout); resolve({ success: false, error: 'Janela fechada' }); }
      });

      authWin.loadURL(authUrl);
    });
  } catch (err) {
    return { success: false, error: String(err) };
  }
});

ipcMain.handle('gdrive:disconnect', async () => {
  deleteToken();
  return { success: true };
});

ipcMain.handle('gdrive:status', async () => {
  const token = loadToken();
  if (!token) return { connected: false };
  try {
    await getValidAccessToken();
    return { connected: true, email: token.email };
  } catch {
    return { connected: false, email: token.email, error: 'Token expired' };
  }
});

ipcMain.handle('gdrive:getRootFolderUrl', async () => {
  try {
    const root = await findOrCreateFolder(ROOT_FOLDER_NAME, null);
    return { success: true, folderId: root.id, url: `https://drive.google.com/drive/folders/${root.id}` };
  } catch (err) {
    return { success: false, error: String(err) };
  }
});

ipcMain.handle('gdrive:upload', async (_event, options) => {
  try {
    const { fileName, category, year, clientName, pdfBase64 } = options;
    const { rootId, folderId } = await ensureFolderPath(category, year, clientName);

    // Check if file already exists in folder
    const query = `name='${fileName.replace(/'/g, "\\'")}' and '${folderId}' in parents and trashed=false`;
    const checkRes = await driveApi('GET', `/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name)`);
    const checkData = await checkRes.json();
    if (checkData.files && checkData.files.length > 0) {
      const existing = checkData.files[0];
      return {
        success: true,
        fileId: existing.id,
        folderId,
        url: `https://drive.google.com/file/d/${existing.id}/view`,
        rootFolderId: rootId,
        rootUrl: `https://drive.google.com/drive/folders/${rootId}`,
        skipped: true,
      };
    }

    const pdfBuffer = Buffer.from(pdfBase64, 'base64');
    const uploadRes = await driveApi('POST', '/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink', {
      metadata: { name: fileName, parents: [folderId] },
      mimeType: 'application/pdf',
      data: pdfBuffer,
    }, 'multipart');

    if (!uploadRes.ok) {
      const errText = await uploadRes.text();
      return { success: false, error: `Upload failed: ${errText}` };
    }
    const uploaded = await uploadRes.json();
    return {
      success: true,
      fileId: uploaded.id,
      folderId,
      url: uploaded.webViewLink || `https://drive.google.com/file/d/${uploaded.id}/view`,
      rootFolderId: rootId,
      rootUrl: `https://drive.google.com/drive/folders/${rootId}`,
    };
  } catch (err) {
    return { success: false, error: String(err) };
  }
});

// --- Auto-update IPC handlers ---

ipcMain.handle('update:check', async () => {
  if (!autoUpdater) return { available: false, error: 'Auto-update não disponível' };
  try {
    const result = await autoUpdater.checkForUpdates();
    if (result && result.updateInfo) {
      return { available: true, version: result.updateInfo.version, releaseDate: result.updateInfo.releaseDate };
    }
    return { available: false };
  } catch (err) {
    return { available: false, error: String(err) };
  }
});

ipcMain.handle('update:install', async () => {
  if (!autoUpdater || !updateDownloaded) return { success: false, error: 'Nenhuma atualização pronta para instalar' };
  // Save a flag so the app quits cleanly, then restart
  setTimeout(() => {
    autoUpdater.quitAndInstall(false, true);
  }, 100);
  return { success: true };
});

ipcMain.handle('update:status', async () => {
  return {
    available: !!updateInfo,
    downloaded: updateDownloaded,
    version: updateInfo?.version ?? null,
  };
});

ipcMain.handle('app:version', async () => {
  return app.getVersion();
});

app.whenReady().then(() => {
  createWindow();

  // Check for updates after a short delay (only in packaged app)
  if (autoUpdater && !app.isPackaged) {
    // Dev mode — skip
  } else if (autoUpdater && app.isPackaged) {
    setTimeout(() => {
      autoUpdater.checkForUpdates().catch(() => {});
    }, 5000);
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
