<template>
  <Menubar :model="items" class="app-nav">
    <template #item="{ item, props }">
      <RouterLink :to="item.route" class="app-nav-link" v-bind="props.action">{{ item.label }}</RouterLink>
    </template>
    <template #end>
      <Button label="Logout" severity="secondary" text @click="onLogout" />
    </template>
  </Menubar>
</template>

<script setup>
import { useRouter } from 'vue-router'
import Menubar from 'primevue/menubar'
import Button from 'primevue/button'
import { useAuthStore } from '../stores/auth.js'

const router = useRouter()
const auth = useAuthStore()

const items = [
  { label: 'Trips', route: '/' },
  { label: 'People', route: '/people' }
]

async function onLogout() {
  await auth.logout()
  router.push('/login')
}
</script>

<style scoped>
.app-nav {
  border-radius: 0;
  border: 0;
  border-bottom: 1px solid #e5e5e7;
  background: rgba(255, 255, 255, 0.85);
  backdrop-filter: saturate(180%) blur(12px);
  -webkit-backdrop-filter: saturate(180%) blur(12px);
  padding: 0.375rem 1.25rem;
}
.app-nav-link {
  color: #1d1d1f;
  text-decoration: none;
  font-weight: 500;
  font-size: 0.9375rem;
  padding: 0.5rem 0.75rem;
  display: inline-block;
  border-radius: 8px;
  transition: color 0.15s ease, background 0.15s ease;
}
.app-nav-link:hover {
  background: #f5f5f7;
}
.app-nav-link.router-link-active {
  color: #2563eb;
  font-weight: 600;
}
</style>
