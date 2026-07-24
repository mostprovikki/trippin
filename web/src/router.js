import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from './stores/auth.js'

const routes = [
  { path: '/login', name: 'login', component: () => import('./views/LoginView.vue'), meta: { public: true } },
  { path: '/', name: 'trips', component: () => import('./views/TripsListView.vue'), meta: { auth: true } },
  { path: '/trips/new', name: 'trip-new', component: () => import('./views/TripNewView.vue'), meta: { auth: true } },
  {
    path: '/trips/:id',
    component: () => import('./layouts/TripLayout.vue'),
    meta: { auth: true },
    children: [
      { path: '', name: 'trip-overview', component: () => import('./views/trip/TripOverviewView.vue') },
      { path: 'dates', name: 'trip-dates', component: () => import('./views/trip/TripDatesView.vue') },
      { path: 'destination', name: 'trip-destination', component: () => import('./views/trip/TripDestinationView.vue') },
      { path: 'goals', name: 'trip-goals', component: () => import('./views/trip/TripGoalsView.vue') },
      { path: 'people', name: 'trip-people', component: () => import('./views/trip/TripPeopleView.vue') },
      { path: 'budget', name: 'trip-budget', component: () => import('./views/trip/TripBudgetView.vue') },
      { path: 'itinerary', name: 'trip-itinerary', component: () => import('./views/trip/TripItineraryView.vue') },
      { path: 'checklists', name: 'trip-checklists', component: () => import('./views/trip/TripChecklistsView.vue') },
      { path: 'readiness', name: 'trip-readiness', component: () => import('./views/trip/TripReadinessView.vue') },
      { path: 'settings', name: 'trip-settings', component: () => import('./views/trip/TripSettingsView.vue') }
    ]
  },
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
