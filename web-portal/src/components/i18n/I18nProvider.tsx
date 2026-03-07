'use client';

import { useEffect } from 'react';
import i18n, { getCurrentLanguage } from '@/lib/i18n';

export function I18nProvider() {
  useEffect(() => {
    const applyHtmlLang = (lang: string) => {
      if (typeof document !== 'undefined') {
        document.documentElement.lang = lang;
      }
    };

    applyHtmlLang(getCurrentLanguage());

    const handleLanguageChanged = (lang: string) => {
      applyHtmlLang(lang);
    };

    i18n.on('languageChanged', handleLanguageChanged);
    return () => {
      i18n.off('languageChanged', handleLanguageChanged);
    };
  }, []);

  return null;
}
