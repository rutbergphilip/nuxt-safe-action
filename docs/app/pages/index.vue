<script setup lang="ts">
definePageMeta({
  layout: 'default',
  header: true,
  footer: true,
})

useSeoMeta({
  title: 'nuxt-safe-action',
  description:
    'Type-safe server actions for Nuxt. Define actions with Zod validation and middleware, call them from the client with full type inference.',
  ogImage: '/social-card.png',
})

const copied = ref(false)

function copyInstall() {
  navigator.clipboard.writeText('npx nuxi module add nuxt-safe-action')
  copied.value = true
  setTimeout(() => (copied.value = false), 2000)
}

const features = [
  {
    icon: 'i-lucide-shield-check',
    title: 'End-to-end Type Safety',
    description:
      'Input and output types flow from server to client automatically. No manual type definitions needed.',
  },
  {
    icon: 'i-lucide-check-circle',
    title: 'Input Validation',
    description:
      'Zod schemas validate input before your handler runs. Validation errors are returned per-field.',
  },
  {
    icon: 'i-lucide-layers',
    title: 'Composable Middleware',
    description:
      'Chain auth checks, logging, rate limiting, and more with fully typed context passing.',
  },
  {
    icon: 'i-lucide-activity',
    title: 'Reactive Composable',
    description:
      'useAction gives you status, data, validationErrors, and lifecycle callbacks out of the box.',
  },
  {
    icon: 'i-lucide-folder-open',
    title: 'Auto Route Generation',
    description:
      'Drop files in server/actions/ and API routes are created for you. Zero configuration.',
  },
  {
    icon: 'i-lucide-server',
    title: 'H3Event Access',
    description:
      'Full request context available in middleware and handlers. Read cookies, headers, sessions.',
  },
]

const serverCode = `import { z } from 'zod'
import { actionClient } from '../utils/action-client'

export default actionClient
  .schema(z.object({
    title: z.string().min(1).max(200),
    body: z.string().min(1),
  }))
  .action(async ({ parsedInput }) => {
    const post = await db.post.create({
      data: parsedInput,
    })
    return { id: post.id, title: post.title }
  })`

const clientCode = `<script setup lang="ts">
import { createPost } from '#safe-action/actions'

const { execute, data, isExecuting } = useAction(
  createPost,
  {
    onSuccess({ data }) {
      console.log('Created:', data.title)
    },
  }
)
${'<'}/script>

<template>
  <form @submit.prevent="execute(formData)">
    <button :disabled="isExecuting">
      {{ isExecuting ? 'Creating...' : 'Create' }}
    </button>
  </form>
</template>`

const activeTab = ref<'server' | 'client'>('server')

const {
  public: { version },
} = useRuntimeConfig()
</script>

<template>
  <div class="landing">
    <section class="hero-section">
      <div class="hero-glow" />
      <div class="hero-grid" />
      <div class="hero-container">
        <div class="hero-badge">
          <UIcon name="i-lucide-sparkles" class="size-3.5 text-emerald-400" />
          <span>v{{ version }} &mdash; Now with HTTP method support</span>
        </div>

        <h1 class="hero-title">
          Type-safe Server Actions
          <br />
          for <span class="hero-nuxt">Nuxt</span>
        </h1>

        <p class="hero-description">
          Define actions on the server with Zod validation and middleware. Call them from the client
          with full type inference, reactive status tracking, and field-level validation errors.
        </p>

        <div class="hero-actions">
          <UButton
            to="/getting-started/installation"
            size="lg"
            trailing-icon="i-lucide-arrow-right"
          >
            Get Started
          </UButton>
          <UButton
            to="https://github.com/rutbergphilip/nuxt-safe-action"
            target="_blank"
            color="neutral"
            variant="subtle"
            size="lg"
            icon="i-simple-icons-github"
          >
            GitHub
          </UButton>
        </div>

        <button class="install-cmd" @click="copyInstall">
          <span class="install-prompt">$</span>
          <span class="install-text">npx nuxi module add nuxt-safe-action</span>
          <UIcon
            :name="copied ? 'i-lucide-check' : 'i-lucide-copy'"
            :class="['install-icon', { 'text-emerald-400': copied }]"
          />
        </button>
      </div>
    </section>

    <section class="code-section">
      <div class="code-container">
        <div class="code-header-row">
          <h2 class="section-label">How it works</h2>
          <p class="section-sublabel">
            Define on the server. Use on the client. Types flow automatically.
          </p>
        </div>

        <div class="code-panels">
          <div class="code-panel">
            <div class="code-panel-header">
              <div class="code-panel-dot code-panel-dot--green" />
              <span class="code-panel-file">server/actions/create-post.ts</span>
              <span class="code-panel-badge code-panel-badge--server">Server</span>
            </div>
            <div class="code-block">
              <Shiki lang="typescript" :code="serverCode" />
            </div>
          </div>

          <div class="code-arrow">
            <div class="code-arrow-line" />
            <UIcon name="i-lucide-arrow-right" class="code-arrow-icon" />
            <span class="code-arrow-label">Full type inference</span>
          </div>

          <div class="code-panel">
            <div class="code-panel-header">
              <div class="code-panel-dot code-panel-dot--emerald" />
              <span class="code-panel-file">components/CreatePost.vue</span>
              <span class="code-panel-badge code-panel-badge--client">Client</span>
            </div>
            <div class="code-block">
              <Shiki lang="vue" :code="clientCode" />
            </div>
          </div>
        </div>

        <div class="code-mobile">
          <div class="code-mobile-tabs">
            <button
              :class="['code-mobile-tab', { active: activeTab === 'server' }]"
              @click="activeTab = 'server'"
            >
              <div class="code-panel-dot code-panel-dot--green" />
              Server
            </button>
            <button
              :class="['code-mobile-tab', { active: activeTab === 'client' }]"
              @click="activeTab = 'client'"
            >
              <div class="code-panel-dot code-panel-dot--emerald" />
              Client
            </button>
          </div>
          <div class="code-panel code-panel--mobile">
            <div class="code-panel-header">
              <span v-if="activeTab === 'server'" class="code-panel-file"
                >server/actions/create-post.ts</span
              >
              <span v-else class="code-panel-file">components/CreatePost.vue</span>
            </div>
            <div class="code-block">
              <Shiki v-if="activeTab === 'server'" lang="typescript" :code="serverCode" />
              <Shiki v-else lang="vue" :code="clientCode" />
            </div>
          </div>
        </div>
      </div>
    </section>

    <section class="features-section">
      <div class="features-container">
        <h2 class="section-label">Features</h2>
        <p class="section-sublabel">
          Everything you need for safe, validated server-client communication.
        </p>

        <div class="features-grid">
          <div v-for="feature in features" :key="feature.title" class="feature-card">
            <div class="feature-icon-wrap">
              <UIcon :name="feature.icon" class="feature-icon" />
            </div>
            <h3 class="feature-title">{{ feature.title }}</h3>
            <p class="feature-description">{{ feature.description }}</p>
          </div>
        </div>
      </div>
    </section>

    <section class="cta-section">
      <div class="cta-container">
        <div class="cta-glow" />
        <h2 class="cta-title">Ready to get started?</h2>
        <p class="cta-description">Add nuxt-safe-action to your project in seconds.</p>
        <div class="cta-actions">
          <UButton
            to="/getting-started/installation"
            size="lg"
            trailing-icon="i-lucide-arrow-right"
          >
            Read the Docs
          </UButton>
          <UButton
            to="https://stackblitz.com/github/rutbergphilip/nuxt-safe-action/tree/main/example"
            target="_blank"
            color="neutral"
            variant="subtle"
            size="lg"
            icon="i-simple-icons-stackblitz"
          >
            Try on StackBlitz
          </UButton>
        </div>
      </div>
    </section>
  </div>
</template>

<style>
html.dark .shiki,
html.dark .shiki span {
  color: var(--shiki-dark) !important;
  background-color: var(--shiki-dark-bg) !important;
}
</style>

<style scoped>
.landing {
  --gutter: clamp(1.25rem, 4vw, 3rem);
  --max-w: 72rem;
  font-feature-settings: 'cv02', 'cv03', 'cv04', 'cv11';
}

.hero-section {
  position: relative;
  overflow: hidden;
  padding: 5rem var(--gutter) 3rem;
  text-align: center;
}

.hero-glow {
  position: absolute;
  top: -40%;
  left: 50%;
  transform: translateX(-50%);
  width: 60rem;
  height: 36rem;
  background: radial-gradient(ellipse at center, rgba(0, 220, 130, 0.08) 0%, transparent 70%);
  pointer-events: none;
}

.hero-grid {
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(rgba(255, 255, 255, 0.02) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255, 255, 255, 0.02) 1px, transparent 1px);
  background-size: 4rem 4rem;
  mask-image: radial-gradient(ellipse at 50% 0%, black 30%, transparent 70%);
  pointer-events: none;
}

.hero-container {
  position: relative;
  max-width: var(--max-w);
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1.5rem;
}

.hero-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.35rem 0.85rem;
  border-radius: 9999px;
  border: 1px solid rgba(0, 220, 130, 0.2);
  background: rgba(0, 220, 130, 0.06);
  font-size: 0.8rem;
  font-weight: 500;
  color: var(--ui-text-muted);
  letter-spacing: 0.01em;
}

.hero-title {
  font-size: clamp(2.25rem, 6vw, 3.75rem);
  font-weight: 800;
  line-height: 1.1;
  letter-spacing: -0.035em;
  color: var(--ui-text-highlighted);
}

.hero-nuxt {
  background: linear-gradient(135deg, #00dc82 0%, #36e4a0 50%, #00dc82 100%);
  background-clip: text;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.hero-description {
  max-width: 40rem;
  font-size: clamp(0.95rem, 1.8vw, 1.1rem);
  line-height: 1.7;
  color: var(--ui-text-muted);
}

.hero-actions {
  display: flex;
  gap: 0.75rem;
  margin-top: 0.5rem;
}

.install-cmd {
  display: inline-flex;
  align-items: center;
  gap: 0.65rem;
  margin-top: 0.75rem;
  padding: 0.6rem 1rem;
  border-radius: 0.5rem;
  border: 1px solid var(--ui-border);
  background: var(--ui-bg-elevated);
  font-family: var(--font-mono, ui-monospace, monospace);
  font-size: 0.82rem;
  color: var(--ui-text-muted);
  cursor: pointer;
  transition:
    border-color 0.15s,
    background 0.15s;
}

.install-cmd:hover {
  border-color: var(--ui-border-accented);
  background: var(--ui-bg-accented);
}

.install-prompt {
  color: rgba(0, 220, 130, 0.6);
  user-select: none;
}

.install-text {
  color: var(--ui-text);
}

.install-icon {
  width: 0.9rem;
  height: 0.9rem;
  opacity: 0.5;
  transition: opacity 0.15s;
}

.install-cmd:hover .install-icon {
  opacity: 1;
}

.code-section {
  padding: 2rem var(--gutter) 4rem;
}

.code-container {
  max-width: var(--max-w);
  margin: 0 auto;
}

.section-label {
  font-size: 0.8rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--ui-primary);
  margin-bottom: 0.35rem;
}

.section-sublabel {
  font-size: 1.05rem;
  color: var(--ui-text-muted);
  margin-bottom: 2rem;
}

.code-header-row {
  text-align: center;
  margin-bottom: 2.5rem;
}

.code-panels {
  display: none;
  gap: 1.5rem;
  align-items: flex-start;
}

@media (min-width: 768px) {
  .code-panels {
    display: grid;
    grid-template-columns: 1fr auto 1fr;
  }
}

.code-panel {
  border-radius: 0.75rem;
  border: 1px solid var(--ui-border);
  background: var(--ui-bg-elevated);
  overflow: hidden;
}

.code-panel-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.65rem 1rem;
  border-bottom: 1px solid var(--ui-border);
  background: var(--ui-bg);
}

.code-panel-dot {
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 9999px;
  flex-shrink: 0;
}

.code-panel-dot--green {
  background: #00dc82;
  box-shadow: 0 0 6px rgba(0, 220, 130, 0.4);
}

.code-panel-dot--emerald {
  background: #36e4a0;
  box-shadow: 0 0 6px rgba(54, 228, 160, 0.4);
}

.code-panel-file {
  font-family: var(--font-mono, ui-monospace, monospace);
  font-size: 0.75rem;
  color: var(--ui-text-muted);
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.code-panel-badge {
  font-size: 0.65rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  padding: 0.15rem 0.5rem;
  border-radius: 9999px;
}

.code-panel-badge--server {
  background: rgba(0, 220, 130, 0.1);
  color: #00dc82;
}

.code-panel-badge--client {
  background: rgba(54, 228, 160, 0.1);
  color: #36e4a0;
}

.code-block {
  margin: 0;
  overflow-x: auto;
}

.code-block :deep(pre) {
  padding: 1rem 1.15rem;
  margin: 0;
  overflow-x: auto;
  font-family: var(--font-mono, ui-monospace, monospace);
  font-size: 0.78rem;
  line-height: 1.7;
  tab-size: 2;
  background: transparent !important;
}

.code-block :deep(pre code) {
  font-family: inherit;
  background: transparent;
}

.code-arrow {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  padding-top: 6rem;
  color: var(--ui-text-dimmed);
}

.code-arrow-line {
  width: 1px;
  height: 2rem;
  background: linear-gradient(to bottom, transparent, var(--ui-border-accented));
}

.code-arrow-icon {
  width: 1.25rem;
  height: 1.25rem;
  color: var(--ui-primary);
}

.code-arrow-label {
  font-size: 0.7rem;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--ui-text-dimmed);
  white-space: nowrap;
  writing-mode: vertical-rl;
  transform: rotate(180deg);
}

.code-mobile {
  display: block;
}

@media (min-width: 768px) {
  .code-mobile {
    display: none;
  }
}

.code-mobile-tabs {
  display: flex;
  gap: 0;
  margin-bottom: -1px;
}

.code-mobile-tab {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 0.65rem 1rem;
  border: 1px solid var(--ui-border);
  background: var(--ui-bg);
  font-size: 0.82rem;
  font-weight: 500;
  color: var(--ui-text-dimmed);
  cursor: pointer;
  transition:
    color 0.15s,
    background 0.15s;
}

.code-mobile-tab:first-child {
  border-radius: 0.75rem 0 0 0;
}

.code-mobile-tab:last-child {
  border-radius: 0 0.75rem 0 0;
  border-left: 0;
}

.code-mobile-tab.active {
  background: var(--ui-bg-elevated);
  color: var(--ui-text);
}

.code-panel--mobile {
  border-top-left-radius: 0;
  border-top-right-radius: 0;
}

.features-section {
  padding: 3rem var(--gutter) 4rem;
}

.features-container {
  max-width: var(--max-w);
  margin: 0 auto;
  text-align: center;
}

.features-grid {
  display: grid;
  grid-template-columns: repeat(1, 1fr);
  gap: 1px;
  background: var(--ui-border);
  border: 1px solid var(--ui-border);
  border-radius: 0.75rem;
  overflow: hidden;
  text-align: left;
}

@media (min-width: 640px) {
  .features-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (min-width: 1024px) {
  .features-grid {
    grid-template-columns: repeat(3, 1fr);
  }
}

.feature-card {
  padding: 1.5rem;
  background: var(--ui-bg);
  transition: background 0.2s;
}

.feature-card:hover {
  background: var(--ui-bg-elevated);
}

.feature-icon-wrap {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 2.25rem;
  height: 2.25rem;
  border-radius: 0.5rem;
  background: rgba(0, 220, 130, 0.08);
  border: 1px solid rgba(0, 220, 130, 0.15);
  margin-bottom: 0.85rem;
}

.feature-icon {
  width: 1.1rem;
  height: 1.1rem;
  color: var(--ui-primary);
}

.feature-title {
  font-size: 0.92rem;
  font-weight: 600;
  color: var(--ui-text-highlighted);
  margin-bottom: 0.4rem;
}

.feature-description {
  font-size: 0.84rem;
  line-height: 1.6;
  color: var(--ui-text-muted);
}

.cta-section {
  padding: 3rem var(--gutter) 5rem;
}

.cta-container {
  position: relative;
  max-width: 40rem;
  margin: 0 auto;
  text-align: center;
  padding: 3rem 2rem;
  border-radius: 1rem;
  border: 1px solid var(--ui-border);
  background: var(--ui-bg-elevated);
  overflow: hidden;
}

.cta-glow {
  position: absolute;
  top: -50%;
  left: 50%;
  transform: translateX(-50%);
  width: 30rem;
  height: 20rem;
  background: radial-gradient(ellipse at center, rgba(0, 220, 130, 0.06) 0%, transparent 70%);
  pointer-events: none;
}

.cta-title {
  position: relative;
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--ui-text-highlighted);
  margin-bottom: 0.5rem;
}

.cta-description {
  position: relative;
  font-size: 0.95rem;
  color: var(--ui-text-muted);
  margin-bottom: 1.5rem;
}

.cta-actions {
  position: relative;
  display: flex;
  justify-content: center;
  gap: 0.75rem;
}
</style>
