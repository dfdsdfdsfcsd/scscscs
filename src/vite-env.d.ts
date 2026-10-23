/// <reference types="vite/client" />

interface ElectronFileDialogResult {
  canceled: boolean;
  filePath?: string;
  fileName?: string;
  fileExt?: string;
  exists?: boolean;
}

interface ElectronFolderDialogResult {
  canceled: boolean;
  folderPath?: string;
  exists?: boolean;
}

interface ElectronAPI {
  platform: string;
  isElectron: boolean;
  selectFile: () => Promise<ElectronFileDialogResult>;
  selectFolder: () => Promise<ElectronFolderDialogResult>;
  openPath: (targetPath: string) => Promise<{ success: boolean; error?: string }>;
  pathExists: (targetPath: string) => Promise<{ exists: boolean }>;
  copyFile: (srcPath: string, destDir: string) => Promise<{ success: boolean; destPath?: string; error?: string }>;
  selectLogo: () => Promise<{ canceled: boolean; logoPath?: string; fileName?: string; error?: string }>;
  readLogoAsDataURL: (logoPath: string) => Promise<{ success: boolean; dataURL?: string; error?: string }>;
  removeLogo: (logoPath: string) => Promise<{ success: boolean; error?: string }>;
  resolveLogoPath: () => Promise<{ success: boolean; logoPath?: string }>;
  googleOAuthGetClientId: () => Promise<{ configured: boolean; clientId: string }>;
  googleOAuthSetClientId: (clientId: string) => Promise<{ success: boolean; error?: string }>;
  gdriveConnect: () => Promise<{ success: boolean; email?: string; error?: string }>;
  gdriveDisconnect: () => Promise<{ success: boolean }>;
  gdriveStatus: () => Promise<{ connected: boolean; email?: string; error?: string }>;
  gdriveGetRootUrl: () => Promise<{ success: boolean; url?: string; error?: string }>;
  gdriveUpload: (options: { fileName: string; category: string; year: number; clientName: string | null; pdfBase64: string }) => Promise<{ success: boolean; fileId?: string; folderId?: string; url?: string; rootFolderId?: string; rootUrl?: string; skipped?: boolean; error?: string }>;
  updateCheck: () => Promise<{ available: boolean; version?: string; releaseDate?: string; error?: string }>;
  updateInstall: () => Promise<{ success: boolean; error?: string }>;
  updateStatus: () => Promise<{ available: boolean; downloaded: boolean; version: string | null }>;
  appVersion: () => Promise<string>;
  onUpdateAvailable: (callback: (data: { version: string; releaseDate?: string }) => void) => () => void;
  onUpdateProgress: (callback: (data: { percent: number; transferred: number; total: number }) => void) => () => void;
  onUpdateDownloaded: (callback: (data: { version: string }) => void) => () => void;
  onUpdateError: (callback: (data: { message: string }) => void) => () => void;
}

interface Window {
  electronAPI?: ElectronAPI;
}
