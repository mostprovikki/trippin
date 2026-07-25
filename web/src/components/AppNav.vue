<script setup>
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Button from 'primevue/button'
import { useAuthStore } from '../stores/auth.js'
import { useTripsStore } from '../stores/trips.js'
import { TRIP_SECTIONS } from '../utils/tripNav.js'
import { isDark, toggleThemeMode } from '../composables/useThemeMode.js'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const trips = useTripsStore()

const crumbs = computed(() => {
  const name = route.name
  if (name === 'trips') return [{ label: 'Trips' }]
  if (name === 'trip-new') return [{ label: 'Trips', to: '/' }, { label: 'New trip' }]
  if (name === 'people') return [{ label: 'People' }]
  if (name === 'person') return [{ label: 'People', to: '/people' }, { label: 'Person' }]
  const section = TRIP_SECTIONS.find((s) => s.name === name)
  if (section) {
    const tripCrumb = {
      label: trips.current?.name || 'Trip',
      to: name === 'trip-overview' ? null : { name: 'trip-overview', params: { id: route.params.id } }
    }
    const out = [{ label: 'Trips', to: '/' }, tripCrumb]
    if (name !== 'trip-overview') out.push({ label: section.label })
    return out
  }
  return []
})

async function onLogout() {
  await auth.logout()
  router.push('/login')
}
</script>

<template>
  <header class="app-nav">
    <RouterLink to="/" class="app-brand"><i class="pi pi-compass" aria-hidden="true" /> Tripper</RouterLink>

    <nav class="app-crumbs" aria-label="Breadcrumb">
      <template v-for="(c, i) in crumbs" :key="i">
        <i v-if="i > 0" class="pi pi-angle-right app-crumb-sep" aria-hidden="true" />
        <RouterLink v-if="c.to" :to="c.to" class="app-crumb">{{ c.label }}</RouterLink>
        <span v-else class="app-crumb app-crumb-current">{{ c.label }}</span>
      </template>
    </nav>

    <div class="app-nav-right">
      <RouterLink to="/" class="app-nav-link" :class="{ 'app-nav-link-active': route.name === 'trips' || String(route.name).startsWith('trip') }">Trips</RouterLink>
      <RouterLink to="/people" class="app-nav-link" :class="{ 'app-nav-link-active': route.name === 'people' || route.name === 'person' }">People</RouterLink>
      <Button
        type="button"
        severity="secondary"
        text
        rounded
        size="small"
        class="app-theme-toggle"
        :icon="isDark ? 'pi pi-sun' : 'pi pi-moon'"
        :aria-label="isDark ? 'Switch to light theme' : 'Switch to dark theme'"
        :title="isDark ? 'Switch to light theme' : 'Switch to dark theme'"
        data-test="theme-toggle"
        @click="toggleThemeMode"
      />
      <Button label="Logout" severity="secondary" text size="small" @click="onLogout" />
    </div>
  </header>
</template>

<style scoped>
.app-nav {
  position: sticky;
  top: 0;
  z-index: 20;
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0.5rem 1.25rem;
  border-bottom: 1px solid var(--app-border);
  background: var(--app-nav-bg);
  backdrop-filter: saturate(180%) blur(12px);
  -webkit-backdrop-filter: saturate(180%) blur(12px);
}
.app-brand {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  font-weight: 700;
  letter-spacing: -0.01em;
  color: var(--app-primary);
  text-decoration: none;
}
.app-crumbs { display: flex; align-items: center; gap: 0.375rem; min-width: 0; flex: 1; }
.app-crumb { color: var(--app-text-muted); text-decoration: none; font-size: 0.875rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.app-crumb:hover { color: var(--app-text); }
.app-crumb-current { color: var(--app-text); font-weight: 600; }
.app-crumb-sep { font-size: 0.75rem; color: var(--app-text-subtle); }
.app-nav-right { display: flex; align-items: center; gap: 0.25rem; }
.app-nav-link {
  color: var(--app-text);
  text-decoration: none;
  font-weight: 500;
  font-size: 0.875rem;
  padding: 0.375rem 0.625rem;
  border-radius: var(--app-radius-sm);
}
.app-nav-link:hover { background: var(--app-hover); }
.app-nav-link-active { color: var(--app-primary); font-weight: 600; }

@media (max-width: 640px) {
  .app-crumbs { display: none; }
  .app-nav { gap: 0.5rem; }
  .app-nav-right { margin-left: auto; }
}
</style>
