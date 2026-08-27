import { defineConfig } from 'astro/config'
import starlight from '@astrojs/starlight'

export default defineConfig({
  site: 'https://edmogeor.github.io',
  base: '/dashmark/docs',
  outDir: './dist/docs',
  vite: {
    resolve: {
      tsconfigPaths: false
    }
  },
  integrations: [
    starlight({
      title: 'Docs',
      description: 'Configure Dashmark dashboards for Docker services.',
      customCss: ['./src/styles/custom.css'],
      components: {
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
        }
      ]
    })
  ]
})
