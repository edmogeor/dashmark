import { defineConfig } from 'astro/config'
import starlight from '@astrojs/starlight'

export default defineConfig({
  site: 'https://edmogeor.github.io',
  base: '/dashmark/docs',
  outDir: '../dist/client/docs',
  publicDir: '../public',
  vite: {
    resolve: {
      tsconfigPaths: false
    }
  },
  integrations: [
    starlight({
      title: 'Dashmark Docs',
      description: 'Configure Dashmark dashboards for Docker services.',
      favicon: '/favicon.svg',
      head: [
        { tag: 'meta', attrs: { property: 'og:image', content: 'https://edmogeor.github.io/dashmark/docs/brand/og-image.png' } },
        { tag: 'meta', attrs: { property: 'og:image:width', content: '1200' } },
        { tag: 'meta', attrs: { property: 'og:image:height', content: '630' } },
        { tag: 'meta', attrs: { name: 'twitter:image', content: 'https://edmogeor.github.io/dashmark/docs/brand/og-image.png' } }
      ],
      customCss: ['./src/styles/custom.css'],
      components: {
        SiteTitle: './src/components/SiteTitle.astro',
        ThemeSelect: './src/components/ThemeSelect.astro'
      },
      social: [
        { icon: 'github', label: 'GitHub', href: 'https://github.com/edmogeor/dashmark' }
      ],
      sidebar: [
        {
          label: 'Get started',
          items: [
            { label: 'Overview', link: '/' },
            { label: 'Quick start', link: '/guides/quick-start/' }
          ]
        },
        {
          label: 'Configuration',
          items: [
            { label: 'Card configuration', link: '/configuration/cards/' },
            { label: 'YAML configuration', link: '/configuration/yaml/' },
            { label: 'Dashboard settings', link: '/configuration/settings/' },
            { label: 'Access control', link: '/configuration/access-control/' }
          ]
        },
        {
          label: 'Metrics',
          items: [
            { label: 'Overview', link: '/metrics/' },
            { label: 'Library metrics', link: '/metrics/library/' },
            { label: 'Custom metrics', link: '/metrics/custom/' },
            { label: 'Contribute a library metric', link: '/metrics/contributing/' }
          ]
        },
        {
          label: 'Deployment',
          items: [
            { label: 'Deployment and security', link: '/deployment/security/' }
          ]
        },
        {
          label: 'Support Dashmark',
          items: [
            { label: 'Buy me a coffee', link: 'https://www.buymeacoffee.com/edmogeor' }
          ]
        }
      ]
    })
  ]
})
