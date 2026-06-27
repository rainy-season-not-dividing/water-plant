import { createContext, useContext, type ReactNode } from 'react';
import { useCockpitAIChat } from '../../hooks/useCockpitAIChat';
import type { CockpitSectionKey } from '../../types';

type CockpitAIContextValue = ReturnType<typeof useCockpitAIChat>;

const CockpitAIContext = createContext<CockpitAIContextValue | null>(null);

interface CockpitAIProviderProps {
  section: CockpitSectionKey;
  selectedTab?: string | null;
  children: ReactNode;
}

export function CockpitAIProvider({
  section,
  selectedTab,
  children,
}: CockpitAIProviderProps) {
  const value = useCockpitAIChat({ section, selectedTab });
  return <CockpitAIContext.Provider value={value}>{children}</CockpitAIContext.Provider>;
}

export function useCockpitAIContext() {
  const context = useContext(CockpitAIContext);
  if (!context) {
    throw new Error('useCockpitAIContext must be used within CockpitAIProvider');
  }
  return context;
}
