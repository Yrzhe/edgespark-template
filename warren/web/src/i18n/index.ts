import i18next from "i18next";
import { initReactI18next } from "react-i18next";

void i18next.use(initReactI18next).init({
  fallbackLng: "en",
  interpolation: { escapeValue: false },
  resources: {
    en: {
      translation: {
        common: {
          retry: "Retry",
          loading: "Loading",
        },
      },
    },
  },
});
