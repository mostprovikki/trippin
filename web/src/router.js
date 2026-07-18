import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from './stores/auth.js'

const routes = [
  { path: '/login', name: 'login', component: () => import('./views/LoginView.vue'), meta: { public: true } },
  { path: '/', name: 'trips', component: () => import('./views/TripsListView.vue'), meta: { auth: true } },
  { path: '/trips/new', name: 'trip-new', component: () => import('./views/TripNewView.vue'), meta: { auth: true } },
  { path: '/trips/:id', name: 'trip', component: () => import('./views/TripDetailView.vue'), meta: { auth: true } },
  { path: '/trips/:id/budget', name: 'trip-budget', component: () => import('./views/TripBudgetView.vue'), meta: { auth: true } },
  { path: '/trips/:id/itinerary', name: 'trip-itinerary', component: () => import('./views/TripItineraryView.vue'), meta: { auth: true } },
  { path: '/trips/:id/checklists', name: 'trip-checklists', component: () => import('./views/TripChecklistsView.vue'), meta: { auth: true } },
  { path: '/trips/:id/readiness', name: 'trip-readiness', component: () => import('./views/TripReadinessView.vue'), meta: { auth: true } },
  { path: '/trips/:id/archive', name: 'trip-archive', component: () => import('./views/TripArchiveView.vue'), meta: { auth: true } },
  { path: '/people', name: 'people', component: () => import('./views/PeopleListView.vue'), meta: { auth: true } },
  { path: '/people/:id', name: 'person', component: () => import('./views/PersonDetailView.vue'), meta: { auth: true } },
  { path: '/p/:token', name: 'participant', component: () => import('./views/ParticipantView.vue'), meta: { public: true, bare: true } }
]

export const router = createRouter({
  history: createWebHistory(),
  routes
})

let didInitialFetch = false

router.beforeEach(async (to) => {
  if (!to.meta.auth) return true
  const auth = useAuthStore()
  if (!didInitialFetch) {
    didInitialFetch = true
    await auth.fetchMe()
  }
  if (!auth.organizer) return { path: '/login', query: { redirect: to.fullPath } }
  return true
})

window.addEventListener('tripper:unauthorized', (e) => {
  if (router.currentRoute.value.path === '/login') return
  router.push({ path: '/login', query: { redirect: e.detail?.path || router.currentRoute.value.fullPath } })
})
