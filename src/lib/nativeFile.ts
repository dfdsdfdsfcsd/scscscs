const ALLOWED_EXTENSIONS = ['pdf', 'jpg', 'jpeg', 'png', 'doc', 'docx'];

export function isAllowedFileType(ext: string): boolean {
  return ALLOWED_EXTENSIONS.includes(ext.toLowerCase());
}

export function allowedExtensionsLabel(): string {
  return 'PDF, JPG, JPEG, PNG, DOC, DOCX';
}

export async function nativeSelectFile(): Promise<{
  canceled: boolean;
  filePath?: string;
  fileName?: string;
  fileExt?: string;
}> {
  const api = window.electronAPI;
  if (!api) return { canceled: true };
  return api.selectFile();
}

export async function nativeSelectFolder(): Promise<{
  canceled: boolean;
  folderPath?: string;
}> {
  const api = window.electronAPI;
  if (!api) return { canceled: true };
  return api.selectFolder();
}

export async function nativeOpenPath(targetPath: string): Promise<boolean> {
  const api = window.electronAPI;
  if (!api) return false;
  const res = await api.openPath(targetPath);
  return res.success;
}

export async function nativePathExists(targetPath: string): Promise<boolean> {
  const api = window.electronAPI;
  if (!api) return true;
  const res = await api.pathExists(targetPath);
  return res.exists;
}

export async function nativeCopyFile(srcPath: string, destDir: string): Promise<{
  success: boolean;
  destPath?: string;
  error?: string;
}> {
  const api = window.electronAPI;
  if (!api) return { success: false, error: 'Não disponível no navegador' };
  return api.copyFile(srcPath, destDir);
}

export function isElectron(): boolean {
  return !!window.electronAPI?.isElectron;
}

// --- Logo management ---

export async function nativeSelectLogo(): Promise<{
  canceled: boolean;
  logoPath?: string;
  fileName?: string;
  error?: string;
}> {
  const api = window.electronAPI;
  if (!api) return { canceled: true, error: 'Seletor de arquivos disponível apenas no aplicativo desktop.' };
  return api.selectLogo();
}

export async function nativeReadLogoAsDataURL(logoPath: string): Promise<{
  success: boolean;
  dataURL?: string;
  error?: string;
}> {
  const api = window.electronAPI;
  if (!api) return { success: false, error: 'Não disponível no navegador.' };
  return api.readLogoAsDataURL(logoPath);
}

export async function nativeRemoveLogo(logoPath: string): Promise<{ success: boolean; error?: string }> {
  const api = window.electronAPI;
  if (!api) return { success: false, error: 'Não disponível no navegador.' };
  return api.removeLogo(logoPath);
}

export async function nativeResolveLogoPath(): Promise<{ success: boolean; logoPath?: string }> {
  const api = window.electronAPI;
  if (!api) return { success: false };
  return api.resolveLogoPath();
}
