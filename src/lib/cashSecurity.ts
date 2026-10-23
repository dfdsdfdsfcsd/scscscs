const MAX_ATTEMPTS = 3;
const LOCKOUT_MS = 5 * 60 * 1000;
const STORAGE_KEY = 'cash-security-attempts';

interface AttemptState {
  count: number;
  lockedUntil: number | null;
}

function getAttempts(): AttemptState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as AttemptState;
  } catch { /* ignore */ }
  return { count: 0, lockedUntil: null };
}

function saveAttempts(state: AttemptState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function isLockedOut(): { locked: boolean; remainingMs: number } {
  const state = getAttempts();
  if (state.lockedUntil && Date.now() < state.lockedUntil) {
    return { locked: true, remainingMs: state.lockedUntil - Date.now() };
  }
  if (state.lockedUntil && Date.now() >= state.lockedUntil) {
    saveAttempts({ count: 0, lockedUntil: null });
  }
  return { locked: false, remainingMs: 0 };
}

export function recordFailedAttempt(): { locked: boolean; remainingMs: number } {
  const state = getAttempts();
  const newCount = state.count + 1;
  if (newCount >= MAX_ATTEMPTS) {
    const lockedUntil = Date.now() + LOCKOUT_MS;
    saveAttempts({ count: 0, lockedUntil });
    return { locked: true, remainingMs: LOCKOUT_MS };
  }
  saveAttempts({ count: newCount, lockedUntil: null });
  return { locked: false, remainingMs: 0 };
}

export function resetAttempts() {
  saveAttempts({ count: 0, lockedUntil: null });
}

export function getRemainingAttempts(): number {
  const state = getAttempts();
  return Math.max(0, MAX_ATTEMPTS - state.count);
}

function generateSalt(): string {
  const arr = new Uint8Array(32);
  crypto.getRandomValues(arr);
  return Array.from(arr).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function hashPassword(password: string, salt: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(salt + ':' + password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function createPasswordHash(password: string): Promise<{ hash: string; salt: string }> {
  const salt = generateSalt();
  const hash = await hashPassword(password, salt);
  return { hash, salt };
}

export async function verifyPassword(password: string, storedHash: string, salt: string): Promise<boolean> {
  const hash = await hashPassword(password, salt);
  return hash === storedHash;
}
