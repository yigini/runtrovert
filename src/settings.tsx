import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { loadSettings, saveSettings } from './db';
import { applySettings } from './tracking';
import { DEFAULT_SETTINGS, type Settings } from './types';

interface Ctx {
  settings: Settings;
  ready: boolean;
  update: (patch: Partial<Settings>) => void;
}

const SettingsContext = createContext<Ctx>({ settings: DEFAULT_SETTINGS, ready: false, update: () => {} });

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    loadSettings().then((s) => {
      setSettings(s);
      applySettings(s);
      setReady(true);
    });
  }, []);

  const update = useCallback((patch: Partial<Settings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      applySettings(next);
      saveSettings(next);
      return next;
    });
  }, []);

  return <SettingsContext.Provider value={{ settings, ready, update }}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  return useContext(SettingsContext);
}
