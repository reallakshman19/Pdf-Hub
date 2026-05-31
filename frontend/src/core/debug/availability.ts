const LOCAL_DEBUG_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

export function isDebugRouteEnabled(hostname: string): boolean {
  return LOCAL_DEBUG_HOSTNAMES.has(hostname);
}
