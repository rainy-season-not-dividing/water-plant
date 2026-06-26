import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

if (import.meta.env.DEV && typeof window !== 'undefined') {
  const bootProbeFlag = '__WATER_PLANT_BOOT_PROBE_ATTACHED__';
  const bootProbeWindow = window as Window & Record<string, unknown>;

  if (!bootProbeWindow[bootProbeFlag]) {
    bootProbeWindow[bootProbeFlag] = true;

    console.info('[boot-probe] href:', window.location.href);
    console.info('[boot-probe] origin:', window.location.origin);
    console.info('[boot-probe] mode:', import.meta.env.MODE);
    console.info(
      '[boot-probe] VITE_MODEL_BASE_URL:',
      import.meta.env.VITE_MODEL_BASE_URL ?? '(default)'
    );

    window.addEventListener('error', (event) => {
      console.error('[boot-probe] window error:', event.error ?? event.message);
    });

    window.addEventListener('unhandledrejection', (event) => {
      console.error('[boot-probe] unhandled rejection:', event.reason);
    });
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
