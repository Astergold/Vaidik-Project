/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Dev server only: "false" disables the dev-session fallback. Ignored by production builds. */
  readonly VITE_STUB_SESSION?: string;
  /** Dev preview of a tenant brand colour, any CSS colour. */
  readonly VITE_BRAND_COLOR?: string;
}
