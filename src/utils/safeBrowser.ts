export function getSafeOrigin(): string {
  if (typeof window === 'undefined') return 'https://example.com';
  try {
    if (window.location?.origin) {
      return window.location.origin;
    }
    return `${window.location.protocol}//${window.location.host}`;
  } catch {
    return 'https://example.com';
  }
}

export function safeLocalStorageGet(key: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function safeLocalStorageSet(key: string, value: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Ignore storage SecurityError/QuotaExceededError in restricted frames
  }
}

export function safeSessionStorageGet(key: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

export function safeSessionStorageSet(key: string, value: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(key, value);
  } catch {
    // Ignore storage SecurityError in restricted frames
  }
}
