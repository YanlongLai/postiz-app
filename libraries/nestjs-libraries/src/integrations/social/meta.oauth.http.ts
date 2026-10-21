export type MetaOAuthStage =
  | 'code-exchange'
  | 'long-lived-token-exchange'
  | 'permissions'
  | 'identity';

type MetaOAuthFailureReason =
  | 'network-error'
  | 'invalid-json'
  | 'invalid-payload'
  | 'upstream-error';

type MetaErrorPayload = {
  error?: {
    code?: unknown;
    error_subcode?: unknown;
  };
};

export class MetaOAuthError extends Error {
  override readonly name = 'MetaOAuthError';

  constructor(
    public readonly provider: string,
    public readonly stage: MetaOAuthStage,
    public readonly status: number,
    public readonly reason: MetaOAuthFailureReason,
    public readonly code?: string,
    public readonly subcode?: string
  ) {
    super(`Meta ${provider} OAuth failed at ${stage}`);
  }

  toLog() {
    return {
      provider: this.provider,
      stage: this.stage,
      status: this.status,
      reason: this.reason,
      ...(this.code ? { code: this.code } : {}),
      ...(this.subcode ? { subcode: this.subcode } : {}),
    };
  }
}

function safeCode(value: unknown): string | undefined {
  if (typeof value !== 'string' && typeof value !== 'number') {
    return undefined;
  }

  return String(value).slice(0, 64);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function upstreamError(payload: unknown): {
  code?: string;
  subcode?: string;
} {
  if (!isRecord(payload) || !isRecord(payload.error)) {
    return {};
  }

  const error = payload.error as MetaErrorPayload['error'];
  return {
    code: safeCode(error?.code),
    subcode: safeCode(error?.error_subcode),
  };
}

export async function fetchMetaJson<T>(
  provider: string,
  stage: MetaOAuthStage,
  url: string,
  timeoutMs = 15_000
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    let response: Response;
    try {
      response = await fetch(url, { signal: controller.signal });
    } catch {
      throw new MetaOAuthError(provider, stage, 0, 'network-error');
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new MetaOAuthError(
        provider,
        stage,
        response.status || 0,
        'invalid-json'
      );
    }

    const { code, subcode } = upstreamError(payload);
    if (!response.ok || (isRecord(payload) && 'error' in payload)) {
      throw new MetaOAuthError(
        provider,
        stage,
        response.status || 0,
        'upstream-error',
        code,
        subcode
      );
    }

    if (!isRecord(payload)) {
      throw new MetaOAuthError(
        provider,
        stage,
        response.status || 0,
        'invalid-payload'
      );
    }

    return payload as T;
  } finally {
    clearTimeout(timeout);
  }
}

export function requireMetaString(
  provider: string,
  stage: MetaOAuthStage,
  payload: unknown,
  field: string
): string {
  if (
    !isRecord(payload) ||
    typeof payload[field] !== 'string' ||
    !payload[field]
  ) {
    throw new MetaOAuthError(provider, stage, 200, 'invalid-payload');
  }

  return payload[field] as string;
}

export function requireMetaArray(
  provider: string,
  stage: MetaOAuthStage,
  payload: unknown,
  field: string
): unknown[] {
  if (!isRecord(payload) || !Array.isArray(payload[field])) {
    throw new MetaOAuthError(provider, stage, 200, 'invalid-payload');
  }

  return payload[field] as unknown[];
}

export function metaGraphUrl(
  apiVersion: string,
  path: string,
  params: Record<string, string | undefined>
) {
  const url = new URL(`https://graph.facebook.com/${apiVersion}/${path}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      url.searchParams.set(key, value);
    }
  }

  return url.toString();
}
