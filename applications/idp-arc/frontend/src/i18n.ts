import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

import en from './locales/en/translation.json'

i18n
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
    },
    lng: 'en',
    fallbackLng: 'en',
    interpolation: {
      // React already escapes values, so no need for i18next to do it.
      escapeValue: false,
    },
  })

export default i18n
