<script setup>
// tripper.md §2 Quick reference: tonight's stay (address, ref, Call · Map),
// people to call today, local emergency numbers. Sources: `stay` itinerary
// items, item phones, trip emergency_info (owner decision D4).
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { mapsUrl } from '../../utils/overview.js'

const props = defineProps({
  stay: { type: Object, default: null },
  todayItems: { type: Array, default: () => [] },
  emergencyInfo: { type: String, default: null }
})
const route = useRoute()
const tel = (phone) => `tel:${String(phone).replace(/[^\d+]/g, '')}`
const callable = computed(() => props.todayItems.filter((i) => i.phone && i.id !== props.stay?.id))
const empty = computed(() => !props.stay && !callable.value.length && !props.emergencyInfo)
</script>

<template>
  <section class="card overview-card quickref-card" aria-labelledby="qr-h">
    <h2 id="qr-h" class="overview-card-title">Quick reference</h2>
    <p v-if="empty" class="overview-empty">Add a stay in the Itinerary to see it here.</p>
    <ul v-else class="overview-rows">
      <li v-if="stay" class="overview-row overview-row-plain">
        <div class="overview-row-main">
          <strong>Tonight: {{ stay.title }}</strong>
          <p class="overview-row-reason">
            <template v-if="stay.location">{{ stay.location }}</template><template v-if="stay.booking_ref"> · <span class="booking-ref">ref {{ stay.booking_ref }}</span></template>
          </p>
          <p v-if="stay.notes" class="overview-row-reason">{{ stay.notes }}</p>
        </div>
        <span class="quickref-actions">
          <a v-if="stay.phone" :href="tel(stay.phone)">Call</a>
          <a v-if="mapsUrl(stay.location)" class="map-link" :href="mapsUrl(stay.location)" target="_blank" rel="noopener">Map</a>
        </span>
      </li>
      <li v-for="i in callable" :key="i.id" class="overview-row overview-row-plain">
        <a :href="tel(i.phone)">Call {{ i.title }}</a>
        <span class="overview-row-reason">{{ i.phone }}</span>
      </li>
      <li v-if="emergencyInfo" class="overview-row overview-row-plain">
        <div class="overview-row-main">
          <strong>Emergency</strong>
          <p class="overview-row-reason quickref-emergency">{{ emergencyInfo }}</p>
        </div>
      </li>
    </ul>
    <p class="overview-card-foot">
      From the itinerary's stays and bookings ·
      <RouterLink :to="{ name: 'trip-itinerary', params: { id: route.params.id } }">Edit in Itinerary</RouterLink>
    </p>
  </section>
</template>
