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
.app-nav { border-radius: 0; border-left: 0; border-right: 0; border-top: 0; }
.app-nav-link {
  color: #1a1a1a;
  text-decoration: none;
  font-weight: 600;
  padding: 0.5rem 0.75rem;
  display: inline-block;
}
.app-nav-link.router-link-active { color: #2563eb; }
</style>
