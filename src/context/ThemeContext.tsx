import React, { createContext, useContext, useEffect, useState } from 'react';
import type { Language } from '../types';
import { t as translate, type TranslationKey } from '../i18n/translations';

type Theme = 'light' | 'dark';

interface ThemeContextValue {
  theme: Theme;
  toggleTheme: () => void;
  lang: Language;
  setLang: (lang: Language) => void;
  toggleLang: () => void;
  tr: (key: TranslationKey) => string;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => {
    try {
      const saved = window.localStorage.getItem('dugsiga_theme');
      if (saved === 'dark' || saved === 'light') return saved;
    } catch {
      // ignore storage errors
    }
    return 'light';
  });

  const [lang, setLangState] = useState<Language>(() => {
    try {
      const saved = window.localStorage.getItem('dugsiga_lang');
      if (saved === 'so' || saved === 'en') return saved;
    } catch {
      // ignore storage errors
    }
    return 'en';
  });

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    try {
      window.localStorage.setItem('dugsiga_theme', theme);
    } catch {
      // ignore
    }
  }, [theme]);

  const setLang = (next: Language) => {
    setLangState(next);
    try {
      window.localStorage.setItem('dugsiga_lang', next);
    } catch {
      // ignore
    }
  };

  const toggleTheme = () => setTheme((prev) => (prev === 'light' ? 'dark' : 'light'));
  const toggleLang = () => setLang(lang === 'en' ? 'so' : 'en');
  const tr = (key: TranslationKey) => translate(lang, key);

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, lang, setLang, toggleLang, tr }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside ThemeProvider');
  return ctx;
}
