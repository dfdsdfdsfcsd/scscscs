const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  isElectron: true,
  selectFile: () => ipcRenderer.invoke('dialog:selectFile'),
  selectFolder: () => ipcRenderer.invoke('dialog:selectFolder'),
  openPath: (targetPath) => ipcRenderer.invoke('shell:openPath', targetPath),
  pathExists: (targetPath) => ipcRenderer.invoke('fs:pathExists', targetPath),
  copyFile: (srcPath, destDir) => ipcRenderer.invoke('fs:copyFile', srcPath, destDir),
  selectLogo: () => ipcRenderer.invoke('dialog:selectLogo'),
  readLogoAsDataURL: (logoPath) => ipcRenderer.invoke('fs:readLogoAsDataURL', logoPath),
  removeLogo: (logoPath) => ipcRenderer.invoke('fs:removeLogo', logoPath),
  resolveLogoPath: () => ipcRenderer.invoke('fs:resolveLogoPath'),
  // Google Drive
  gdriveConnect: () => ipcRenderer.invoke('gdrive:connect'),
  gdriveDisconnect: () => ipcRenderer.invoke('gdrive:disconnect'),
  gdriveStatus: () => ipcRenderer.invoke('gdrive:status'),
  gdriveGetRootUrl: () => ipcRenderer.invoke('gdrive:getRootFolderUrl'),
  gdriveUpload: (options) => ipcRenderer.invoke('gdrive:upload', options),
  // Gmail
  gmailConnect: () => ipcRenderer.invoke('gmail:connect'),
  gmailDisconnect: () => ipcRenderer.invoke('gmail:disconnect'),
  gmailStatus: () => ipcRenderer.invoke('gmail:status'),
  gmailSendEmail: (options) => ipcRenderer.invoke('gmail:sendEmail', options),
  gmailSendTest: (options) => ipcRenderer.invoke('gmail:sendTest', options),
  // Safe external URL (WhatsApp)
  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),
  // Auto-update
  updateCheck: () => ipcRenderer.invoke('update:check'),
  updateInstall: () => ipcRenderer.invoke('update:install'),
  updateStatus: () => ipcRenderer.invoke('update:status'),
  appVersion: () => ipcRenderer.invoke('app:version'),
  onUpdateAvailable: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('update:available', handler);
    return () => ipcRenderer.removeListener('update:available', handler);
  },
  onUpdateProgress: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('update:progress', handler);
    return () => ipcRenderer.removeListener('update:progress', handler);
  },
  onUpdateDownloaded: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('update:downloaded', handler);
    return () => ipcRenderer.removeListener('update:downloaded', handler);
  },
  onUpdateError: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('update:error', handler);
    return () => ipcRenderer.removeListener('update:error', handler);
  },
});
