<template>
  <AppNav v-if="!route.meta.bare && auth.organizer" />
  <RouterView />
</template>

<script setup>
import { useRoute } from 'vue-router'
import { useAuthStore } from './stores/auth.js'
import AppNav from './components/AppNav.vue'

const route = useRoute()
const auth = useAuthStore()
</script>
