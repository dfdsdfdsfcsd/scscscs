export interface GmailStatus {
  connected: boolean;
  email?: string;
  error?: string;
}

export interface GmailSendResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

interface GmailAttachment {
  filename: string;
  mimeType: string;
  data: string;
}

interface ElectronAPI {
  gmailConnect: () => Promise<{ success: boolean; email?: string; error?: string }>;
  gmailDisconnect: () => Promise<{ success: boolean }>;
  gmailStatus: () => Promise<GmailStatus>;
  gmailSendEmail: (opts: {
    to: string;
    subject: string;
    body: string;
    attachments?: GmailAttachment[];
    senderName?: string;
  }) => Promise<GmailSendResult>;
  gmailSendTest: (opts: { to: string; senderName?: string }) => Promise<GmailSendResult>;
}

function getApi(): ElectronAPI | null {
  const api = (window as unknown as { electronAPI?: ElectronAPI }).electronAPI;
  if (!api || !api.gmailConnect) return null;
  return api;
}

export function isGmailAvailable(): boolean {
  return !!getApi();
}

export async function connectGmail(): Promise<{ success: boolean; email?: string; error?: string }> {
  const api = getApi();
  if (!api) return { success: false, error: 'O envio por e-mail está disponível apenas no aplicativo desktop.' };
  return api.gmailConnect();
}

export async function disconnectGmail(): Promise<{ success: boolean }> {
  const api = getApi();
  if (!api) return { success: true };
  return api.gmailDisconnect();
}

export async function getGmailStatus(): Promise<GmailStatus> {
  const api = getApi();
  if (!api) return { connected: false, error: 'not_desktop' };
  return api.gmailStatus();
}

export async function sendGmailEmail(opts: {
  to: string;
  subject: string;
  body: string;
  attachments?: GmailAttachment[];
  senderName?: string;
}): Promise<GmailSendResult> {
  const api = getApi();
  if (!api) return { success: false, error: 'O envio por e-mail está disponível apenas no aplicativo desktop.' };
  return api.gmailSendEmail(opts);
}

export async function sendGmailTest(to: string, senderName?: string): Promise<GmailSendResult> {
  const api = getApi();
  if (!api) return { success: false, error: 'O envio por e-mail está disponível apenas no aplicativo desktop.' };
  return api.gmailSendTest({ to, senderName });
}
