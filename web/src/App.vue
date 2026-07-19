<template>
  <Toast position="top-right" />
  <ConfirmDialog />
  <AppNav v-if="!route.meta.bare && auth.organizer" />
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

const route = useRoute()
const auth = useAuthStore()
</script>
