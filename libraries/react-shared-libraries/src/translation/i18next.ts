import i18next from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import resourcesToBackend from 'i18next-resources-to-backend';
import { initReactI18next } from 'react-i18next/initReactI18next';
import { fallbackLng, languages, defaultNS } from './i18n.config';
import { brandText } from '@gitroom/helpers/utils/brand.client';
const runsOnServerSide = typeof window === 'undefined';

// White-label: rewrite the upstream product name in every translated string
// (and every inline default) when BRAND_NAME is configured. A no-op otherwise.
const brandPostProcessor = {
  type: 'postProcessor' as const,
  name: 'brand',
  process: (value: string) => brandText(value),
};

i18next
  .use(brandPostProcessor)
  .use(initReactI18next)
  .use(LanguageDetector)
  .use(
    resourcesToBackend((language: any, namespace: any) => {
      return import(`./locales/${language}/${namespace}.json`);
    })
  )
  .init({
    supportedLngs: languages,
    fallbackLng,
    lng: undefined,
    fallbackNS: defaultNS,
    defaultNS,
    detection: {
      order: ['cookie', 'header'],
    },
    preload: runsOnServerSide ? languages : [],
    postProcess: ['brand'],
  });

export default i18next;
