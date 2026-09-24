/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  /** e.g. "campax.com.br": each empresa is served at <slug>.<VITE_BASE_DOMAIN> (spec 08). Empty = off. */
  readonly VITE_BASE_DOMAIN?: string;
}
