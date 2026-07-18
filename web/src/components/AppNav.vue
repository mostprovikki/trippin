<template>
  <nav class="app-nav">
    <RouterLink to="/" class="app-nav-link">Trips</RouterLink>
    <RouterLink to="/people" class="app-nav-link">People</RouterLink>
    <button class="btn app-nav-logout" @click="onLogout">Logout</button>
  </nav>
</template>

<script setup>
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth.js'

const router = useRouter()
const auth = useAuthStore()

async function onLogout() {
  await auth.logout()
  router.push('/login')
}
</script>

<style scoped>
.app-nav {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.5rem 1rem;
  background: #fff;
  border-bottom: 1px solid #e2e2e2;
  overflow-x: auto;
  white-space: nowrap;
}

.app-nav-link {
  color: #1a1a1a;
  text-decoration: none;
  font-weight: 600;
  padding: 0.25rem 0.5rem;
}

.app-nav-link.router-link-active {
  color: #2563eb;
}

.app-nav-logout {
  margin-left: auto;
}
</style>
