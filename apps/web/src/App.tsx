import { useEffect } from 'react';
import { DashboardLayout } from './components/layout/DashboardLayout';
import { usePaletteEngine } from './hooks/usePaletteEngine';
import { usePlayback } from './hooks/usePlayback';

export default function App() {
  const { regenerate } = usePaletteEngine();
  usePlayback();

  useEffect(() => {
    regenerate();
  }, [regenerate]);

  return <DashboardLayout />;
}
