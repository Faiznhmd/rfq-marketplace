function parseOrigin(value, production, setting = 'APP_ORIGIN') {
  let url;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error(setting + ' must be a valid browser origin.');
  }
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  ) {
    throw new Error(setting + ' must contain only a scheme, hostname and optional port.');
  }
  if (
    production &&
    (url.protocol !== 'https:' || ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
  ) {
    throw new Error(setting + ' must be the public HTTPS origin in production, not localhost.');
  }
  return url;
}

// Render's platform environment is trusted configuration, never request headers.
export function resolveAuthConfig(env = process.env) {
  const onRender = env.RENDER === 'true';
  const production = onRender || env.NODE_ENV === 'production';
  const origin =
    env.APP_ORIGIN?.trim() ||
    (onRender ? env.RENDER_EXTERNAL_URL : '') ||
    (production ? '' : 'http://localhost:5173');
  if (!origin)
    throw new Error('Set APP_ORIGIN to the public HTTPS origin before starting production.');
  const appOrigin = parseOrigin(origin, production).origin;
  if (env.TRUST_PROXY && !['0', '1'].includes(env.TRUST_PROXY)) {
    throw new Error('TRUST_PROXY must be 0 or 1.');
  }
  return {
    production,
    appOrigin,
    trustProxy: env.TRUST_PROXY ? env.TRUST_PROXY === '1' : onRender,
  };
}

export function allowedOrigins(appOrigin, production) {
  const configured = parseOrigin(appOrigin, production);
  const origins = new Set([configured.origin]);
  // Equivalent loopback names are allowed only during local development, on this port.
  if (
    !production &&
    configured.protocol === 'http:' &&
    ['localhost', '127.0.0.1', '[::1]'].includes(configured.hostname)
  ) {
    for (const hostname of ['localhost', '127.0.0.1', '[::1]']) {
      const alias = new URL(configured.origin);
      alias.hostname = hostname;
      origins.add(alias.origin);
    }
  }
  return origins;
}
