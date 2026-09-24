import { createContext, useContext, useState, type ReactNode } from "react";
import { getInitialLanguage, setLanguage, type Language } from "./i18n";

const LanguageContext = createContext<{ language: Language; changeLanguage: (value: Language) => void } | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, updateLanguage] = useState<Language>(getInitialLanguage);
  const changeLanguage = (value: Language) => {
    setLanguage(value);
    updateLanguage(value);
  };
  return <LanguageContext.Provider value={{ language, changeLanguage }}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) throw new Error("LanguageProvider missing");
  return context;
}

export function LanguageSwitcher() {
  const { language, changeLanguage } = useLanguage();
  return <div className="language-switch" role="group" aria-label={language === "sk" ? "Jazyk" : "Language"}>
    <button type="button" lang="sk" aria-pressed={language === "sk"} onClick={() => changeLanguage("sk")}>SK</button>
    <button type="button" lang="en" aria-pressed={language === "en"} onClick={() => changeLanguage("en")}>EN</button>
  </div>;
}
