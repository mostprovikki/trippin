import { describe, it, expect, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import { mountWithBase } from '../test-utils.js'
import LoginView from './LoginView.vue'
import { useAuthStore } from '../stores/auth.js'

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div>home</div>' } },
      { path: '/login', component: LoginView },
      { path: '/trips/:id/budget', component: { template: '<div>budget</div>' } }
    ]
  })
}

describe('LoginView redirect', () => {
  it('honors ?redirect after successful login', async () => {
    const router = makeRouter()
    await router.push('/login?redirect=/trips/9/budget')
    await router.isReady()
    const wrapper = mountWithBase(LoginView, { global: { plugins: [router] } })
    const auth = useAuthStore()
    auth.login = vi.fn().mockResolvedValue()
    await wrapper.find('#email').setValue('a@b.c')
    await wrapper.find('#password').setValue('pw')
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(router.currentRoute.value.fullPath).toBe('/trips/9/budget')
  })

  it('ignores non-path redirect values', async () => {
    const router = makeRouter()
    await router.push('/login?redirect=https://evil.example')
    await router.isReady()
    const wrapper = mountWithBase(LoginView, { global: { plugins: [router] } })
    const auth = useAuthStore()
    auth.login = vi.fn().mockResolvedValue()
    await wrapper.find('#email').setValue('a@b.c')
    await wrapper.find('#password').setValue('pw')
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/')
  })
})
