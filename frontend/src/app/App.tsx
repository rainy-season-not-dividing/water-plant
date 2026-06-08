import DashboardPage from '../pages/DashboardPage';
import AnimationPreview from '../simulation3d/AnimationPreview';
import { ErrorBoundary } from './ErrorBoundary';
import { useNetworkStatus } from '../hooks/useNetworkStatus';

function OfflineBanner() {
  const { isOnline } = useNetworkStatus();
  if (isOnline) return null;
  return (
    <div className="fixed top-0 inset-x-0 z-[9999] bg-amber-600/90 text-white text-center text-sm py-1.5 backdrop-blur-sm">
      网络已断开，部分功能不可用
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <OfflineBanner />
      <div
        className="relative h-screen bg-[#070b13] text-slate-100 flex flex-col overflow-x-hidden font-sans antialiased selection:bg-teal-500/30 selection:text-white"
        id="root-viewport"
      >
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_120%,rgba(16,185,129,0.06),transparent_60%)] z-0" id="bg-ambient-layer-1" />
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(18,24,38,0.3)_1px,transparent_1px),linear-gradient(90deg,rgba(18,24,38,0.3)_1px,transparent_1px)] bg-[size:32px_32px] md:bg-[size:48px_48px] z-0 opacity-40" id="bg-ambient-layer-2" />
        <DashboardPage />
        <AnimationPreview />
      </div>
    </ErrorBoundary>
  );
}
