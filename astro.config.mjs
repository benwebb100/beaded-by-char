import { defineConfig } from 'astro/config';
import preact from '@astrojs/preact';

export default defineConfig({
  site: 'https://beadedbychar.com.au',
  trailingSlash: 'ignore',
  build: { format: 'directory' },
  integrations: [preact()],
});
