// Local browser URLs may use either loopback name. Never expand production origins.
export function allowedOrigins(appOrigin, production) {
  const configured = new URL(appOrigin);
  const origins = new Set([configured.origin]);
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
