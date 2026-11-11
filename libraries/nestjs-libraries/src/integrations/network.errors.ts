const transientCodes = new Set(['ETIMEDOUT', 'ECONNRESET', 'EAI_AGAIN']);

export function isTransientNetworkError(err: any): boolean {
  return (
    !!err &&
    (transientCodes.has(err.code) ||
      err.message === 'fetch failed' ||
      isTransientNetworkError(err.cause) ||
      (Array.isArray(err.errors) && err.errors.some(isTransientNetworkError)))
  );
}

// Only these failures establish that this request never reached the platform.
// A reset or a bare "fetch failed" can happen after a mutation was accepted.
export function isBeforeConnectError(err: any): boolean {
  if (!err) return false;
  if (Array.isArray(err.errors) && err.errors.length) {
    return err.errors.every(isBeforeConnectError);
  }
  return (
    (err.code === 'EAI_AGAIN' && err.syscall === 'getaddrinfo') ||
    (['ETIMEDOUT', 'ENETUNREACH', 'EHOSTUNREACH', 'ECONNREFUSED'].includes(err.code) &&
      err.syscall === 'connect') ||
    isBeforeConnectError(err.cause)
  );
}
