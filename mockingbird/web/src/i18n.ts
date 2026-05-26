import i18next from "i18next";
import { initReactI18next } from "react-i18next";

const resources = {
  en: {
    translation: {
      loading: "Loading",
      loginRequired: "Sign in as the owner to manage Mockingbird.",
      signIn: "Sign in",
      signOut: "Sign out",
    },
  },
  zh: {
    translation: {
      loading: "加载中",
      loginRequired: "请以 owner 身份登录后管理 Mockingbird。",
      signIn: "登录",
      signOut: "退出",
    },
  },
};

void i18next.use(initReactI18next).init({
  resources,
  lng: navigator.language.startsWith("zh") ? "zh" : "en",
  fallbackLng: "en",
  interpolation: { escapeValue: false },
});

export default i18next;
