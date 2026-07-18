<template>
  <main class="page">
    <h1>Log in</h1>
    <form class="card" @submit.prevent="onSubmit">
      <div class="field">
        <label for="email">Email</label>
        <input id="email" v-model="email" type="email" required autocomplete="username" />
      </div>
      <div class="field">
        <label for="password">Password</label>
        <input id="password" v-model="password" type="password" required autocomplete="current-password" />
      </div>
      <p v-if="error" class="badge-warn badge">{{ error }}</p>
      <button class="btn btn-primary" type="submit" :disabled="submitting">Log in</button>
    </form>
  </main>
</template>

<script setup>
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth.js'

const email = ref('')
const password = ref('')
const error = ref('')
const submitting = ref(false)
const router = useRouter()
const route = useRoute()
const auth = useAuthStore()

async function onSubmit() {
  error.value = ''
  submitting.value = true
  try {
    await auth.login(email.value, password.value)
    const dest = typeof route.query.redirect === 'string' && route.query.redirect.startsWith('/') ? route.query.redirect : '/'
    router.push(dest)
  } catch (e) {
    error.value = e.message
  } finally {
    submitting.value = false
  }
}
</script>
