/**
 * i18n/config.js
 * 
 * Internationalisation setup for Agada.
 * Supports 6 Indian languages: EN, HI, TA, BN, TE, MR
 * 
 * Language detection order:
 *   1. User's previous selection (localStorage)
 *   2. Browser language setting
 *   3. Default: English
 */

import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'

import en from './locales/en.js'
import hi from './locales/hi.js'
import ta from './locales/ta.js'
import bn from './locales/bn.js'
import te from './locales/te.js'
import mr from './locales/mr.js'

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      hi: { translation: hi },
      ta: { translation: ta },
      bn: { translation: bn },
      te: { translation: te },
      mr: { translation: mr },
    },
    fallbackLng: 'en',
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
    },
    interpolation: {
      escapeValue: false,
    },
  })

export default i18n
