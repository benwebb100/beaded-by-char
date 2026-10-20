import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://beadedbychar.com.au',
  trailingSlash: 'ignore',
  build: { format: 'directory' },
});
