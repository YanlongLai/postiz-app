'use client';

import { createContext, FC, ReactNode, useContext, useEffect } from 'react';
import { setClientBrandName } from '@gitroom/helpers/utils/brand.client';
interface VariableContextInterface {
  stripeClient: string;
  billingEnabled: boolean;
  isChatBase: boolean;
  isGeneral: boolean;
  genericOauth: boolean;
  oauthLogoUrl: string;
  oauthDisplayName: string;
  mcpUrl?: string;
  cloudflareUrl: string;
  mainUrl: string;
  frontEndUrl: string;
  plontoKey: string;
  storageProvider: 'local' | 'cloudflare';
  backendUrl: string;
  environment: string;
  discordUrl: string;
  uploadDirectory: string;
  facebookPixel: string;
  telegramBotName: string;
  neynarClientId: string;
  appleClientId: string;
  isSecured: boolean;
  disableImageCompression: boolean;
  disableXAnalytics: boolean;
  language: string;
  dub: boolean;
  transloadit: string[];
  mediaProcessing: boolean;
  sentryDsn: string;
  extensionId: string;
  googleAdsId?: string;
  googleAdsTrialTracking?: string;
  recaptchaSiteKey?: string;
  brandName?: string;
  brandWhiteLabel?: boolean;
  brandLogoUrl?: string;
  brandTagline?: string;
  brandHomeUrl?: string;
  brandTermsUrl?: string;
  brandPrivacyUrl?: string;
  brandSourceUrl?: string;
}
const VariableContext = createContext({
  stripeClient: '',
  billingEnabled: false,
  isGeneral: true,
  genericOauth: false,
  isChatBase: false,
  oauthLogoUrl: '',
  googleAdsId: '',
  googleAdsTrialTracking: '',
  oauthDisplayName: '',
  mcpUrl: '',
  cloudflareUrl: '',
  mainUrl: '',
  frontEndUrl: '',
  storageProvider: 'local',
  plontoKey: '',
  backendUrl: '',
  discordUrl: '',
  uploadDirectory: '',
  isSecured: false,
  telegramBotName: '',
  facebookPixel: '',
  neynarClientId: '',
  appleClientId: '',
  disableImageCompression: false,
  disableXAnalytics: false,
  language: '',
  dub: false,
  transloadit: [],
  mediaProcessing: false,
  sentryDsn: '',
  extensionId: '',
  recaptchaSiteKey: '',
  brandName: '',
  brandWhiteLabel: false,
  brandLogoUrl: '',
  brandTagline: '',
  brandHomeUrl: '',
  brandTermsUrl: '',
  brandPrivacyUrl: '',
  brandSourceUrl: '',
} as VariableContextInterface);
export const VariableContextComponent: FC<
  VariableContextInterface & {
    children: ReactNode;
  }
> = (props) => {
  const { children, ...otherProps } = props;
  // Must run during render (not in an effect) so translated strings rendered
  // by children already carry the configured brand on the first paint.
  setClientBrandName(otherProps.brandWhiteLabel ? otherProps.brandName : '');
  useEffect(() => {
    if (typeof window !== 'undefined') {
      // @ts-ignore
      window.vars = otherProps;
    }
  }, []);
  return (
    <VariableContext.Provider value={otherProps}>
      {children}
    </VariableContext.Provider>
  );
};
export const useVariables = () => {
  return useContext(VariableContext);
};
export const loadVars = () => {
  // @ts-ignore
  return window.vars as VariableContextInterface;
};
