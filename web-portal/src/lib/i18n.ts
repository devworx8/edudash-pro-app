import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import enCommon from '../locales/en/common.json';
import afCommon from '../locales/af/common.json';
import zuCommon from '../locales/zu/common.json';

const STORAGE_KEY = '@edudash_language';

type SupportedLanguage = 'en' | 'af' | 'zu';

const resources = {
  en: { common: enCommon },
  af: { common: afCommon },
  zu: { common: zuCommon },
};

const getStoredLanguage = (): SupportedLanguage | null => {
  if (typeof window === 'undefined') return null;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) return null;
    const normalized = stored.split('-')[0] as SupportedLanguage;
    return normalized in resources ? normalized : null;
  } catch {
    return null;
  }
};

const detectLanguage = (): SupportedLanguage => {
  const stored = getStoredLanguage();
  if (stored) return stored;
  if (typeof navigator !== 'undefined') {
    const browserLang = navigator.language?.split('-')[0] as SupportedLanguage;
    if (browserLang in resources) return browserLang;
  }
  return 'en';
};

if (!i18n.isInitialized) {
  i18n
    .use(initReactI18next)
    .init({
      resources,
      lng: detectLanguage(),
      fallbackLng: 'en',
      defaultNS: 'common',
      ns: ['common'],
      interpolation: { escapeValue: false },
      react: { useSuspense: false },
      returnObjects: true,
      keySeparator: '.',
      pluralSeparator: '_',
    });
}

export const changeLanguage = async (language: SupportedLanguage) => {
  if (!(language in resources)) return;
  await i18n.changeLanguage(language);
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(STORAGE_KEY, language);
    } catch {
      // ignore storage failures
    }
  }
};

export const getCurrentLanguage = (): SupportedLanguage => {
  const current = i18n.language?.split('-')[0] as SupportedLanguage;
  return (current in resources ? current : 'en');
};

export default i18n;
