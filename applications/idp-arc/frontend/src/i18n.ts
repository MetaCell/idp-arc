import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

import en from './locales/en/common.json'
import enLandingPage from './locales/en/landingPage.json'

i18n
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en, landingPage: enLandingPage },
    },
    lng: 'en',
    fallbackLng: 'en',
    interpolation: {
      // React already escapes values, so no need for i18next to do it.
      escapeValue: false,
    },
  })

export default i18n
