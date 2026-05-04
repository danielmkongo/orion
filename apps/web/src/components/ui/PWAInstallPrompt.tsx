import { useState, useEffect } from 'react';
import { Download, X } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const DISMISS_KEY = 'orion-pwa-dismissed';

export function PWAInstallPrompt() {
  const [nativePrompt, setNativePrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIOS, setShowIOS]           = useState(false);
  const [visible, setVisible]           = useState(false);

  useEffect(() => {
    // Already installed or user dismissed
    const standalone = window.matchMedia('(display-mode: standalone)').matches
      || (navigator as any).standalone === true;
    if (standalone || sessionStorage.getItem(DISMISS_KEY)) return;

    const ua = navigator.userAgent;
    const isIOS = /iPad|iPhone|iPod/.test(ua) && !(window as any).MSStream;

    if (isIOS) {
      // Show manual iOS instructions after 3 s
      const t = setTimeout(() => { setShowIOS(true); setVisible(true); }, 3000);
      return () => clearTimeout(t);
    }

    // Android / Chrome — listen for the native install event
    const handler = (e: Event) => {
      e.preventDefault();
      setNativePrompt(e as BeforeInstallPromptEvent);
      setVisible(true);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const dismiss = () => {
    sessionStorage.setItem(DISMISS_KEY, '1');
    setVisible(false);
  };

  const install = async () => {
    if (!nativePrompt) return;
    await nativePrompt.prompt();
    const { outcome } = await nativePrompt.userChoice;
    if (outcome === 'accepted') setVisible(false);
    else dismiss();
  };

  if (!visible) return null;

  return (
    <div style={{
      position: 'fixed',
      bottom: 20,
      left: '50%',
      transform: 'translateX(-50%)',
      width: 'min(380px, calc(100vw - 32px))',
      zIndex: 9999,
      background: 'hsl(var(--surface))',
      border: '1px solid hsl(var(--border))',
      borderTop: '2px solid hsl(var(--primary))',
      boxShadow: '0 8px 40px rgba(0,0,0,0.4)',
    }}>
      {/* Body */}
      <div style={{ padding: '14px 14px 12px', display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        {/* Icon */}
        <div style={{
          width: 38, height: 38, flexShrink: 0,
          background: 'hsl(var(--primary) / 0.12)',
          border: '1px solid hsl(var(--primary) / 0.3)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Download size={17} style={{ color: 'hsl(var(--primary))' }} />
        </div>

        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 4 }}>Install Orion</div>
          {showIOS ? (
            <p style={{ fontSize: 12, color: 'hsl(var(--muted-fg))', lineHeight: 1.55, margin: 0 }}>
              Tap the <strong>Share</strong> button&nbsp;
              <span style={{ fontSize: 15, lineHeight: 1 }}>⎙</span>
              &nbsp;in Safari, then choose&nbsp;
              <strong>Add to Home Screen</strong>.
            </p>
          ) : (
            <p style={{ fontSize: 12, color: 'hsl(var(--muted-fg))', lineHeight: 1.55, margin: 0 }}>
              Add to your home screen for faster access and offline support.
            </p>
          )}
        </div>

        <button
          onClick={dismiss}
          style={{
            background: 'none', border: 'none', cursor: 'pointer', padding: 4,
            color: 'hsl(var(--muted-fg))', display: 'flex', flexShrink: 0,
          }}
          aria-label="Dismiss"
        >
          <X size={14} />
        </button>
      </div>

      {/* Action row — only for Android native prompt */}
      {!showIOS && (
        <div style={{ display: 'flex', borderTop: '1px solid hsl(var(--border))' }}>
          <button
            onClick={dismiss}
            style={{
              flex: 1, padding: '9px 0', background: 'transparent', border: 0,
              borderRight: '1px solid hsl(var(--border))',
              fontFamily: 'var(--font-mono)', fontSize: 10.5, letterSpacing: '0.1em',
              textTransform: 'uppercase', color: 'hsl(var(--muted-fg))', cursor: 'pointer',
            }}
          >
            Not now
          </button>
          <button
            onClick={install}
            style={{
              flex: 1, padding: '9px 0', background: 'hsl(var(--primary))', border: 0,
              fontFamily: 'var(--font-mono)', fontSize: 10.5, letterSpacing: '0.1em',
              textTransform: 'uppercase', color: '#fff', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}
          >
            <Download size={11} /> Install
          </button>
        </div>
      )}
    </div>
  );
}
