import { createRouter, createMemoryHistory } from 'vue-router'

// Memory router with every trip route the Overview cards link to.
export async function cardRouter() {
  const names = ['trip-people', 'trip-checklists', 'trip-itinerary', 'trip-budget', 'trip-dates', 'trip-destination']
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/trips/:id', name: 'trip-overview', component: { template: '<div/>' } },
      ...names.map((name) => ({ path: `/trips/:id/${name.slice(5)}`, name, component: { template: '<div/>' } }))
    ]
  })
  await router.push('/trips/t1')
  await router.isReady()
  return router
}
