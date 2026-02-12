export default defineAppConfig({
  seo: {
    image: '/social-card.png',
  },
  header: {
    links: [{
      icon: 'i-simple-icons-github',
      to: 'https://github.com/rutbergphilip/nuxt-safe-action',
      target: '_blank',
      'aria-label': 'GitHub',
    }],
  },
  footer: {
    credits: 'MIT License',
  },
  github: {
    owner: 'rutbergphilip',
    repo: 'nuxt-safe-action',
    branch: 'main',
    rootDir: 'docs',
  },
})
