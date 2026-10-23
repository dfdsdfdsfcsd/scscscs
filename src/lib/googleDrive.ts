import { supabase } from '@/lib/supabase';
import type { DocumentSyncLog } from '@/lib/types';

export interface GDriveStatus {
  connected: boolean;
  email?: string;
  error?: string;
}

export interface GDriveUploadResult {
  success: boolean;
  fileId?: string;
  folderId?: string;
  url?: string;
  rootFolderId?: string;
  rootUrl?: string;
  skipped?: boolean;
  error?: string;
}

interface ElectronAPI {
  gdriveConnect: () => Promise<{ success: boolean; email?: string; error?: string }>;
  gdriveDisconnect: () => Promise<{ success: boolean }>;
  gdriveStatus: () => Promise<GDriveStatus>;
  gdriveGetRootUrl: () => Promise<{ success: boolean; folderId?: string; url?: string; error?: string }>;
  gdriveUpload: (opts: {
    fileName: string;
    category: string;
    year: number;
    clientName: string | null;
    pdfBase64: string;
  }) => Promise<GDriveUploadResult>;
}

function getApi(): ElectronAPI | null {
  const api = (window as unknown as { electronAPI?: ElectronAPI }).electronAPI;
  if (!api || !api.gdriveConnect) return null;
  return api;
}

export function isGDriveAvailable(): boolean {
  return !!getApi();
}

export async function connectGDrive(): Promise<{ success: boolean; email?: string; error?: string }> {
  const api = getApi();
  if (!api) return { success: false, error: 'Google Drive está disponível apenas no aplicativo desktop.' };
  return api.gdriveConnect();
}

export async function disconnectGDrive(): Promise<{ success: boolean }> {
  const api = getApi();
  if (!api) return { success: true };
  return api.gdriveDisconnect();
}

export async function getGDriveStatus(): Promise<GDriveStatus> {
  const api = getApi();
  if (!api) return { connected: false, error: 'not_desktop' };
  return api.gdriveStatus();
}

export async function getGDriveRootUrl(): Promise<{ success: boolean; url?: string; error?: string }> {
  const api = getApi();
  if (!api) return { success: false, error: 'not_desktop' };
  const res = await api.gdriveGetRootUrl();
  return { success: res.success, url: res.url, error: res.error };
}

export function buildStandardFileName(
  date: Date,
  category: string,
  clientName: string | null,
  docNumber: string | null
): string {
  const dateStr = date.toISOString().slice(0, 10);
  const parts = [dateStr];
  const catLabel = category === 'Autorizações de Uso de Imagem' ? 'Autorizacao'
    : category === 'Ordens de Serviço' ? 'Ordem de Servico'
    : category === 'Outros Documentos' ? 'Documento'
    : category.replace(/s$/, '');
  parts.push(catLabel);
  if (clientName) parts.push(clientName);
  if (docNumber) parts.push(docNumber);
  return `${parts.join(' - ')}.pdf`;
}

export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export async function uploadToGDrive(
  blob: Blob,
  fileName: string,
  category: string,
  year: number,
  clientName: string | null
): Promise<GDriveUploadResult> {
  const api = getApi();
  if (!api) return { success: false, error: 'not_desktop' };
  const base64 = await blobToBase64(blob);
  return api.gdriveUpload({ fileName, category, year, clientName, pdfBase64: base64 });
}

export async function createSyncLogEntry(
  clientId: string | null,
  attachmentId: string | null,
  fileName: string,
  category: string,
  clientName: string | null,
  year: number,
  status: string,
  driveFileId?: string | null,
  driveFolderId?: string | null,
  driveUrl?: string | null,
  errorMessage?: string | null
): Promise<DocumentSyncLog | null> {
  const { data, error } = await supabase.from('document_sync_log').insert({
    client_id: clientId,
    attachment_id: attachmentId,
    file_name: fileName,
    category,
    client_name: clientName,
    year,
    status,
    drive_file_id: driveFileId ?? null,
    drive_folder_id: driveFolderId ?? null,
    drive_url: driveUrl ?? null,
    error_message: errorMessage ?? null,
    synced_at: status === 'synced' ? new Date().toISOString() : null,
  }).select('*').maybeSingle();
  if (error) return null;
  return data as DocumentSyncLog;
}

export async function updateSyncLogStatus(
  logId: string,
  status: string,
  driveFileId?: string | null,
  driveFolderId?: string | null,
  driveUrl?: string | null,
  errorMessage?: string | null
): Promise<void> {
  await supabase.from('document_sync_log').update({
    status,
    drive_file_id: driveFileId ?? null,
    drive_folder_id: driveFolderId ?? null,
    drive_url: driveUrl ?? null,
    error_message: errorMessage ?? null,
    synced_at: status === 'synced' ? new Date().toISOString() : null,
  }).eq('id', logId);
}

export const SYNC_CATEGORIES = {
  contrato: 'Contratos',
  autorizacao: 'Autorizações de Uso de Imagem',
  ordem: 'Ordens de Serviço',
  recibo: 'Recibos',
  outro: 'Outros Documentos',
};
