<template>
  <main class="auth-page">
    <div class="auth-box">
      <p class="auth-brand"><i class="pi pi-compass" aria-hidden="true" /> Tripper</p>
      <h1>Log in</h1>
      <form class="card auth-card" @submit.prevent="onSubmit">
        <div class="field">
          <label for="email">Email</label>
          <InputText id="email" v-model="email" type="email" required autocomplete="username" fluid />
        </div>
        <div class="field">
          <label for="password">Password</label>
          <Password
            v-model="password"
            input-id="password"
            :feedback="false"
            toggle-mask
            :input-props="{ required: true, autocomplete: 'current-password' }"
            fluid
          />
        </div>
        <Message v-if="error" severity="error" :closable="false">{{ error }}</Message>
        <Button type="submit" label="Log in" :disabled="submitting" fluid />
      </form>
    </div>
  </main>
</template>

<script setup>
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import InputText from 'primevue/inputtext'
import Password from 'primevue/password'
import Button from 'primevue/button'
import Message from 'primevue/message'
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

<style scoped>
.auth-page {
  min-height: calc(100vh - 2rem);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1.5rem 1rem;
}
.auth-box {
  width: 100%;
  max-width: 22rem;
}
.auth-brand {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.375rem;
  margin: 0 0 0.25rem;
  color: var(--app-primary);
  font-weight: 700;
  font-size: 1.125rem;
  letter-spacing: -0.01em;
}
.auth-box h1 { text-align: center; margin-bottom: 1.25rem; }
.auth-card { padding: 1.5rem; }
</style>
