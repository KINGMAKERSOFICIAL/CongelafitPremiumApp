import { useCallback, useEffect, useState } from 'react';

export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export type InstallPlatform = 'ios' | 'android' | 'desktop';

let deferredPromptGlobal: BeforeInstallPromptEvent | null = null;
let installedGlobal = false;
const listeners = new Set<() => void>();

function notify() {
  for (const fn of listeners) fn();
}

export function detectInstallPlatform(): InstallPlatform {
  if (typeof navigator === 'undefined') return 'desktop';
  const ua = navigator.userAgent || '';
  const isIPadOS = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
  if (/iphone|ipad|ipod/i.test(ua) || isIPadOS) return 'ios';
  if (/android/i.test(ua)) return 'android';
  return 'desktop';
}

export function isAppleDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const platform = navigator.platform || '';
  return /mac|iphone|ipad|ipod/i.test(platform) || /mac os x|iphone|ipad|ipod/i.test(ua);
}

export function isTabletDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const isIPadOS = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
  if (/ipad/i.test(ua) || isIPadOS) return true;
  if (/android/i.test(ua) && !/mobile/i.test(ua)) return true;
  return false;
}

export function isStandaloneMode(): boolean {
  if (typeof window === 'undefined') return false;
  const nav = navigator as Navigator & { standalone?: boolean };
  return (
    installedGlobal ||
    window.matchMedia?.('(display-mode: standalone)').matches === true ||
    nav.standalone === true
  );
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e: Event) => {
    e.preventDefault();
    deferredPromptGlobal = e as BeforeInstallPromptEvent;
    notify();
  });

  window.addEventListener('appinstalled', () => {
    deferredPromptGlobal = null;
    installedGlobal = true;
    notify();
  });
}

export function usePWAInstall() {
  const [, setTick] = useState(0);
  const platform = detectInstallPlatform();
  const isMac = isAppleDevice();
  const isTablet = isTabletDevice();
  const isInstalled = isStandaloneMode();
  const canNativeInstall = !isInstalled && deferredPromptGlobal !== null;

  useEffect(() => {
    const bump = () => setTick((t) => t + 1);
    listeners.add(bump);

    const mq = window.matchMedia?.('(display-mode: standalone)');
    mq?.addEventListener?.('change', bump);
    return () => {
      listeners.delete(bump);
      mq?.removeEventListener?.('change', bump);
    };
  }, []);

  const installNative = useCallback(async (): Promise<'accepted' | 'dismissed' | 'unavailable'> => {
    const promptEvt = deferredPromptGlobal;
    if (!promptEvt) return 'unavailable';
    await promptEvt.prompt();
    const { outcome } = await promptEvt.userChoice;
    if (outcome === 'accepted') {
      deferredPromptGlobal = null;
      installedGlobal = true;
    }
    notify();
    return outcome;
  }, []);

  return {
    platform,
    isMac,
    isTablet,
    isInstalled,
    canNativeInstall,
    installNative,
  };
}
