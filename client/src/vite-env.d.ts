/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL of the account server, e.g. https://gameme.onrender.com. Leave empty when the site and API are served together. */
  readonly VITE_API_URL?: string;
}
