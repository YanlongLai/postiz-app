// Process-wide brand name used by translation post-processing on the client.
// The server side reads BRAND_NAME directly; the browser receives it from the
// root layout through VariableContextComponent, which calls setClientBrandName
// synchronously before any child renders.
import { applyBrandName } from './brand';

let clientBrandName = '';

export const setClientBrandName = (name?: string) => {
  clientBrandName = (name || '').trim();
};

export const currentBrandName = () => {
  if (typeof window === 'undefined') {
    return (process.env.BRAND_NAME || '').trim();
  }
  return clientBrandName;
};

export const brandText = (text: string) =>
  applyBrandName(text, currentBrandName());
