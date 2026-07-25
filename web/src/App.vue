<template>
  <Toast position="top-right" />
  <ConfirmDialog />
  <AppNav v-if="!route.meta.bare && auth.organizer" />
  <!-- Mounted once so Cmd/Ctrl+K works from any authenticated screen, not just
       wherever a search box happens to be on the page. -->
  <SearchPalette v-if="!route.meta.bare && auth.organizer" />
  <main>
    <RouterView />
  </main>
</template>

<script setup>
import { useRoute } from 'vue-router'
import Toast from 'primevue/toast'
import ConfirmDialog from 'primevue/confirmdialog'
import { useAuthStore } from './stores/auth.js'
import AppNav from './components/AppNav.vue'
import SearchPalette from './components/SearchPalette.vue'

const route = useRoute()
const auth = useAuthStore()
</script>
