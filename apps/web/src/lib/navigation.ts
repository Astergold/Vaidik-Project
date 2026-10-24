/**
 * Full page load to a same-site path. Used when the signed-in identity changes (start/exit impersonation), so no
 * cached query, React state or in-memory secret from the previous identity survives. Separate module so tests can mock it.
 */
export function hardNavigate(path: `/${string}`): void {
  window.location.assign(path);
}
