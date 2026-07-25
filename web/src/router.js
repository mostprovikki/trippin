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
  { path: '/search', name: 'search', component: () => import('./views/SearchView.vue'), meta: { auth: true } },
  { path: '/people', name: 'people', component: () => import('./views/PeopleListView.vue'), meta: { auth: true } },
  { path: '/people/:id', name: 'person', component: () => import('./views/PersonDetailView.vue'), meta: { auth: true } },
  { path: '/p/:token', name: 'participant', component: () => import('./views/ParticipantView.vue'), meta: { public: true, bare: true } },
  { path: '/:pathMatch(.*)*', name: 'not-found', component: () => import('./views/NotFoundView.vue'), meta: { public: true } }
]

export const router = createRouter({
  history: createWebHistory(),
  routes
})

let didInitialFetch = false

// Same-origin only. `startsWith('/')` alone also admits protocol-relative
// `//host`, which is an off-site URL wearing a path's clothes.
function safeRedirect(value) {
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') ? value : null
}

router.beforeEach(async (to) => {
  const auth = useAuthStore()
  // Arriving at /login with a session already in hand — Back after signing in,
  // or an in-app link. Without this the user gets a login form rendered
  // underneath the full app nav, search palette and Logout button.
  //
  // Deliberately reads only state we ALREADY have and never probes: calling
  // fetchMe() here would 401 for every signed-out visitor on the app's most
  // public screen, which is a console error on a page that should be silent.
  // A cold load straight to /login therefore just shows the form, which is the
  // right default when we genuinely do not know yet.
  if (to.path === '/login' && auth.organizer) {
    const target = safeRedirect(to.query.redirect)
    return target && target !== '/login' ? target : '/'
  }
  if (!to.meta.auth) return true
  if (!didInitialFetch) {
    didInitialFetch = true
    await auth.fetchMe()
  }
  if (!auth.organizer) return { path: '/login', query: { redirect: to.fullPath } }
  return true
})

window.addEventListener('tripper:unauthorized', (e) => {
  // Clearing the store is the whole point. Left set, an expired session still
  // looks live: the guard above waves every navigation through, the view's own
  // fetch 401s, and this handler fires again — a bounce loop whose only exit is
  // a hard reload. Resetting didInitialFetch makes the next guarded route
  // re-check with the server rather than trust the cleared state forever.
  useAuthStore().$patch({ organizer: null, aiEnabled: false })
  didInitialFetch = false
  if (router.currentRoute.value.path === '/login') return
  router.push({ path: '/login', query: { redirect: e.detail?.path || router.currentRoute.value.fullPath } })
})
