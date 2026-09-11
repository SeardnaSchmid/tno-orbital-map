<script setup>
import { computed, nextTick, onMounted, ref } from "vue";
import { activeBody, clearGroupBody, focusBody, setGroupBody, updateGroup, view } from "../lib/state.js";
import { auDistanceLabel, hohmannTransferPlan, positionsFor } from "../lib/orbit.js";
import { bodyDisplayName, presentBody } from "../lib/presentation.js";

const emit = defineEmits(["close"]);
const locationQuery = ref("");
const destinationQuery = ref("");
const locationInput = ref(null);
const allBodies = computed(() => (view.value?.bodies ?? []).filter((body) => body.kind !== "belt").map((body) => presentBody(view.value, body)));
const byId = computed(() => new Map(allBodies.value.map((body) => [body.id, body])));
const location = computed(() => byId.value.get(view.value?.group?.location_body_id));
const destination = computed(() => byId.value.get(view.value?.group?.destination_body_id));
const routeDistance = computed(() => {
  if (!location.value || !destination.value) return null;
  const { positions } = positionsFor(view.value.bodies, view.value.reference_epoch, view.value.campaign_date);
  const from = positions.get(location.value.id);
  const to = positions.get(destination.value.id);
  return from && to ? Math.hypot(to.x - from.x, to.y - from.y) : null;
});
const transferPlan = computed(() => hohmannTransferPlan(location.value, destination.value, view.value.reference_epoch, view.value.campaign_date));
const kindLabel = (kind) => ({ star: "Stern", planet: "Planet", dwarf_planet: "Zwergplanet", moon: "Mond", asteroid: "Kleinplanet", comet: "Komet", custom: "Eigener Ort" }[kind] || kind);
const sectorLabel = (body) => ({ "inneres-system": "Inneres System", asteroidenguertel: "Asteroidengürtel", jupiter: "Jupiter", saturn: "Saturn", "aeusseres-system": "Äußeres System", kuiper: "Kuipergürtel" }[body.sector] || body.sector);

function results(query, role) {
  const term = query.trim().toLocaleLowerCase("de-DE");
  if (!term) return [];
  const blockedId = role === "destination" ? location.value?.id : null;
  return allBodies.value
    .filter((body) => body.id !== blockedId && (`${body.name} ${body.tags.join(" ")}`).toLocaleLowerCase("de-DE").includes(term))
    .sort((a, b) => a.name.localeCompare(b.name, "de"))
    .slice(0, 8);
}

const locationResults = computed(() => results(locationQuery.value, "location"));
const destinationResults = computed(() => results(destinationQuery.value, "destination"));

function choose(role, body) {
  setGroupBody(role, body.id);
  focusBody(body.id);
  if (role === "location") locationQuery.value = "";
  else destinationQuery.value = "";
}

function setActive(role) {
  if (activeBody.value) setGroupBody(role, activeBody.value.id);
}

onMounted(() => nextTick(() => locationInput.value?.focus()));
</script>

<template>
  <aside class="popover route-panel" role="dialog" aria-modal="false" aria-label="Kampagnenroute bearbeiten" @keydown.esc="emit('close')">
    <header><div><span class="eyebrow">KAMPAGNENROUTE</span><strong>{{ view.group.name }}</strong></div><button class="icon-btn" aria-label="Route schließen" @click="emit('close')">×</button></header>

    <div class="route-meta">
      <label>Bezeichnung<input :value="view.group.name" @change="updateGroup({ name: $event.currentTarget.value })"></label>
      <label>Status<select :value="view.group.status" @change="updateGroup({ status: $event.currentTarget.value })"><option value="unknown">Position offen</option><option value="orbiting">Im Orbit</option><option value="landed">Gelandet</option><option value="in-transit">Im Transit</option></select></label>
    </div>

    <label class="route-objective">Aktuelle Aufgabe<textarea :value="view.group.objective" rows="4" placeholder="Was soll die Gruppe als Nächstes erreichen?" @change="updateGroup({ objective: $event.currentTarget.value })"></textarea></label>

    <section class="route-field">
      <div class="route-field__head"><span>STANDORT</span><strong>{{ location ? bodyDisplayName(view, location) : 'nicht gesetzt' }}</strong><button v-if="location" class="linkish danger-link" @click="clearGroupBody('location')">löschen</button></div>
      <div class="route-search"><input ref="locationInput" v-model="locationQuery" type="search" placeholder="Standort suchen"><button class="small-btn" :disabled="!activeBody" @click="setActive('location')">Aktiver Körper</button></div>
      <div v-if="locationQuery" class="route-results"><button v-for="body in locationResults" :key="body.id" @click="choose('location', body)"><span>{{ body.name }}</span><small>{{ kindLabel(body.kind) }} · {{ sectorLabel(body) }}</small></button><p v-if="!locationResults.length">Kein Treffer</p></div>
    </section>

    <section class="route-field">
      <div class="route-field__head"><span>ZIEL</span><strong>{{ destination ? bodyDisplayName(view, destination) : 'nicht gesetzt' }}</strong><button v-if="destination" class="linkish danger-link" @click="clearGroupBody('destination')">löschen</button></div>
      <div class="route-search"><input v-model="destinationQuery" type="search" placeholder="Ziel suchen"><button class="small-btn" :disabled="!activeBody" @click="setActive('destination')">Aktiver Körper</button></div>
      <div v-if="destinationQuery" class="route-results"><button v-for="body in destinationResults" :key="body.id" @click="choose('destination', body)"><span>{{ body.name }}</span><small>{{ kindLabel(body.kind) }} · {{ sectorLabel(body) }}</small></button><p v-if="!destinationResults.length">Kein Treffer</p></div>
    </section>

    <div v-if="routeDistance !== null" class="route-distance">
      <span>STANDORT → ZIEL</span>
      <strong>{{ auDistanceLabel(routeDistance) }}</strong>
    </div>
    <button v-if="location && destination" class="route-transfer-toggle" :class="{ active: view.group.show_transfer }" :disabled="!transferPlan" :aria-pressed="view.group.show_transfer" @click="updateGroup({ show_transfer: !view.group.show_transfer })">
      <span>HOHMANN-TRANSFER</span>
      <strong>{{ !transferPlan ? 'NICHT VERFÜGBAR' : view.group.show_transfer ? 'SICHTBAR' : 'AUS' }}</strong>
    </button>
  </aside>
</template>
