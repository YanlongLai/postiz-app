import { setDefaultResultOrder } from 'node:dns';
import * as net from 'node:net';

// The repo still pins Node 18 typings; the release runtime is Node 22.20.0.
const workerNet = net as typeof net & {
  getDefaultAutoSelectFamilyAttemptTimeout(): number;
  setDefaultAutoSelectFamilyAttemptTimeout(value: number): void;
};

// Keep IPv4 first, but allow a slow connection a full second before trying
// the next address instead of abandoning it after Node 22's default 250ms.
// This retains IPv6 fallback and the SSRF dispatcher's pinned DNS lookup.
setDefaultResultOrder('ipv4first');
workerNet.setDefaultAutoSelectFamilyAttemptTimeout(
  Math.max(1000, workerNet.getDefaultAutoSelectFamilyAttemptTimeout())
);
