import { useEffect, useRef } from 'react';

declare global {
  interface Window {
    echarts?: {
      init: (element: HTMLDivElement) => {
        setOption: (option: unknown) => void;
        resize: () => void;
        dispose: () => void;
      };
      graphic?: {
        LinearGradient: new (x0: number, y0: number, x1: number, y1: number, colorStops: Array<{ offset: number; color: string }>) => unknown;
      };
    };
  }
}

let echartsLoaderPromise: Promise<void> | null = null;

function ensureEchartsLoaded(): Promise<void> {
  if (window.echarts) return Promise.resolve();
  if (echartsLoaderPromise) return echartsLoaderPromise;
  echartsLoaderPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-echarts-loader="true"]');
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('Failed to load ECharts')), { once: true });
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/echarts@5.5.0/dist/echarts.min.js';
    script.async = true;
    script.dataset.echartsLoader = 'true';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load ECharts'));
    document.head.appendChild(script);
  });
  return echartsLoaderPromise;
}

function useSimpleChart(option: unknown) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const chartHost = ref.current;
    if (!chartHost) return;
    let chart: { setOption: (option: unknown) => void; resize: () => void; dispose: () => void } | null = null;
    let disposed = false;
    const resize = () => chart?.resize();

    void ensureEchartsLoaded()
      .then(() => {
        if (!window.echarts || disposed) return;
        chart = window.echarts.init(chartHost);
        chart.setOption(option);
        window.addEventListener('resize', resize);
      })
      .catch(() => undefined);

    return () => {
      disposed = true;
      window.removeEventListener('resize', resize);
      chart?.dispose();
    };
  }, [option]);

  return ref;
}

export function BarChart({ option, className }: { option: unknown; className?: string }) {
  const ref = useSimpleChart(option);
  return <div ref={ref} className={className ?? 'h-[280px] w-full'} />;
}

export function LineChart({ option, className }: { option: unknown; className?: string }) {
  const ref = useSimpleChart(option);
  return <div ref={ref} className={className ?? 'h-[280px] w-full'} />;
}

export function PieChart({ option, className }: { option: unknown; className?: string }) {
  const ref = useSimpleChart(option);
  return <div ref={ref} className={className ?? 'h-[320px] w-full'} />;
}
