import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { supabase } from '@/lib/supabase';
import type { Settings } from '@/lib/types';
import { nativeResolveLogoPath, nativeReadLogoAsDataURL } from '@/lib/nativeFile';

const defaultSettings: Settings = {
  id: '',
  studio_name: 'Meu Estúdio',
  fantasy_name: null,
  tax_id: null,
  address: null,
  cep: null,
  phone: null,
  whatsapp: null,
  email: null,
  logo_url: null,
  primary_color: '#0f766e',
  accent_color: '#f59e0b',
  theme: 'light',
  date_format: 'DD/MM/YYYY',
  currency: 'BRL',
  business_hours: null,
  default_duration_min: 60,
  alerts_enabled: true,
  alert_advance_days: 7,
  documents_folder: null,
  exports_folder: null,
  backup_folder: null,
  cancellation_rules: null,
  reschedule_rules: null,
  cash_security_enabled: false,
  cash_password_hash: null,
  cash_password_salt: null,
  gdrive_connected: false,
  gdrive_account_email: null,
  gdrive_auto_sync: false,
  gdrive_last_sync: null,
  gdrive_root_folder_id: null,
  gdrive_root_folder_url: null,
};

interface SettingsContextValue {
  settings: Settings;
  loading: boolean;
  refresh: () => Promise<void>;
  save: (updates: Partial<Settings>) => Promise<void>;
  toggleTheme: () => Promise<void>;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    const { data, error } = await supabase.from('settings').select('*').limit(1).maybeSingle();
    if (error) { console.error('Settings load error:', error.message); setLoading(false); return; }
    if (data) {
      const loaded = data as Settings;
      // Resolve logo from Electron app data if no logo_url is set or it's a local path
      if (!loaded.logo_url || loaded.logo_url.startsWith('file://') || loaded.logo_url.includes('userData')) {
        try {
          const resolved = await nativeResolveLogoPath();
          if (resolved.success && resolved.logoPath) {
            const dataRes = await nativeReadLogoAsDataURL(resolved.logoPath);
            if (dataRes.success && dataRes.dataURL) {
              loaded.logo_url = dataRes.dataURL;
            } else if (!loaded.logo_url) {
              loaded.logo_url = null;
            }
          }
        } catch { /* not in Electron, ignore */ }
      }
      setSettings(loaded);
    } else {
      const { data: created, error: insertError } = await supabase
        .from('settings')
        .insert({})
        .select('*')
        .maybeSingle();
      if (insertError) console.error('Settings init error:', insertError.message);
      if (created) setSettings(created as Settings);
    }
    setLoading(false);
  };

  useEffect(() => {
    refresh();
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', settings.theme === 'dark');
    root.style.setProperty('--color-primary', settings.primary_color);
    root.style.setProperty('--color-accent', settings.accent_color);
    try { localStorage.setItem('theme', settings.theme); } catch { /* ignore */ }
  }, [settings.theme, settings.primary_color, settings.accent_color]);

  const toggleTheme = async () => {
    const newTheme = settings.theme === 'dark' ? 'light' : 'dark';
    try { await save({ theme: newTheme }); } catch { /* error already reverted by save */ }
  };

  const save = async (updates: Partial<Settings>) => {
    const prevSettings = settings;
    const newSettings = { ...settings, ...updates, updated_at: new Date().toISOString() };
    setSettings(newSettings);
    const { id, ...updatable } = newSettings;
    const { error } = await supabase.from('settings').update(updatable).eq('id', id);
    if (error) {
      setSettings(prevSettings);
      throw new Error(error.message);
    }
  };

  return (
    <SettingsContext.Provider value={{ settings, loading, refresh, save, toggleTheme }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used within SettingsProvider');
  return ctx;
}
