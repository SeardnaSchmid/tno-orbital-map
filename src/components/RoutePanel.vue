<script setup>
import { computed, nextTick, onMounted, ref } from "vue";
import { activeBody, activeRoute, clearRoute, clearRouteBody, focusBody, setRouteBody, updateRoute, view } from "../lib/state.js";
import { auDistanceLabel, hohmannTransferPlan, positionsFor } from "../lib/orbit.js";
import { bodyDisplayName, presentBody } from "../lib/presentation.js";

const emit = defineEmits(["close"]);
const sourceQuery = ref("");
const destinationQuery = ref("");
const sourceInput = ref(null);
const allBodies = computed(() => (view.value?.bodies ?? [])
  .filter((body) => body.kind !== "belt")
  .map((body) => presentBody(view.value, body)));
const byId = computed(() => new Map(allBodies.value.map((body) => [body.id, body])));
const source = computed(() => byId.value.get(activeRoute.value?.source_body_id));
const destination = computed(() => byId.value.get(activeRoute.value?.destination_body_id));
const routeDistance = computed(() => {
  if (!source.value || !destination.value) return null;
  const { positions } = positionsFor(view.value.bodies, view.value.reference_epoch, view.value.campaign_date);
  const from = positions.get(source.value.id);
  const to = positions.get(destination.value.id);
  return from && to ? Math.hypot(to.x - from.x, to.y - from.y) : null;
});
const transferPlan = computed(() => hohmannTransferPlan(source.value, destination.value, view.value.reference_epoch, view.value.campaign_date));
const kindLabel = (kind) => ({ star: "Stern", planet: "Planet", dwarf_planet: "Zwergplanet", moon: "Mond", asteroid: "Kleinplanet", comet: "Komet", custom: "Eigener Ort" }[kind] || kind);
const sectorLabel = (body) => ({ "inneres-system": "Inneres System", asteroidenguertel: "Asteroidengürtel", jupiter: "Jupiter", saturn: "Saturn", "aeusseres-system": "Äußeres System", kuiper: "Kuipergürtel" }[body.sector] || body.sector);

function results(query, role) {
  const term = query.trim().toLocaleLowerCase("de-DE");
  if (!term) return [];
  const blockedId = role === "destination" ? source.value?.id : null;
  return allBodies.value
    .filter((body) => body.id !== blockedId && (`${body.name} ${body.tags.join(" ")}`).toLocaleLowerCase("de-DE").includes(term))
    .sort((a, b) => a.name.localeCompare(b.name, "de"))
    .slice(0, 8);
}

const sourceResults = computed(() => results(sourceQuery.value, "source"));
const destinationResults = computed(() => results(destinationQuery.value, "destination"));

function choose(role, body) {
  setRouteBody(role, body.id);
  focusBody(body.id);
  if (role === "source") sourceQuery.value = "";
  else destinationQuery.value = "";
}

function setActive(role) {
  if (activeBody.value?.kind !== "belt") setRouteBody(role, activeBody.value.id);
}

onMounted(() => nextTick(() => sourceInput.value?.focus()));
</script>

<template>
  <aside class="popover route-panel" role="dialog" aria-modal="false" aria-label="Route bearbeiten" @keydown.esc="emit('close')">
    <header><div><span class="eyebrow">ROUTE</span><strong>Start → Ziel</strong></div><button class="icon-btn" aria-label="Route schließen" @click="emit('close')">×</button></header>

    <section class="route-field route-field--first">
      <div class="route-field__head"><span>START</span><strong>{{ source ? bodyDisplayName(view, source) : 'nicht gesetzt' }}</strong><button v-if="source" class="linkish danger-link" @click="clearRouteBody('source')">löschen</button></div>
      <div class="route-search"><input ref="sourceInput" v-model="sourceQuery" type="search" placeholder="Startkörper suchen"><button class="small-btn" :disabled="!activeBody || activeBody.kind === 'belt'" @click="setActive('source')">Aktiver Körper</button></div>
      <div v-if="sourceQuery" class="route-results"><button v-for="body in sourceResults" :key="body.id" @click="choose('source', body)"><span>{{ body.name }}</span><small>{{ kindLabel(body.kind) }} · {{ sectorLabel(body) }}</small></button><p v-if="!sourceResults.length">Kein Treffer</p></div>
    </section>

    <section class="route-field">
      <div class="route-field__head"><span>ZIEL</span><strong>{{ destination ? bodyDisplayName(view, destination) : 'nicht gesetzt' }}</strong><button v-if="destination" class="linkish danger-link" @click="clearRouteBody('destination')">löschen</button></div>
      <div class="route-search"><input v-model="destinationQuery" type="search" placeholder="Zielkörper suchen"><button class="small-btn" :disabled="!activeBody || activeBody.kind === 'belt'" @click="setActive('destination')">Aktiver Körper</button></div>
      <div v-if="destinationQuery" class="route-results"><button v-for="body in destinationResults" :key="body.id" @click="choose('destination', body)"><span>{{ body.name }}</span><small>{{ kindLabel(body.kind) }} · {{ sectorLabel(body) }}</small></button><p v-if="!destinationResults.length">Kein Treffer</p></div>
    </section>

    <section class="route-calculation">
      <span>BERECHNUNG</span>
      <div>
        <button :class="{ active: activeRoute.calculation === 'direct' }" :aria-pressed="activeRoute.calculation === 'direct'" @click="updateRoute({ calculation: 'direct' })"><strong>Direkt</strong><small>Gerade Entfernung jetzt</small></button>
        <button :class="{ active: activeRoute.calculation === 'hohmann' }" :aria-pressed="activeRoute.calculation === 'hohmann'" @click="updateRoute({ calculation: 'hohmann' })"><strong>Hohmann</strong><small>Effizienter Transfer</small></button>
      </div>
    </section>

    <div v-if="routeDistance !== null && activeRoute.calculation === 'direct'" class="route-distance">
      <span>DIREKTE DISTANZ</span><strong>{{ auDistanceLabel(routeDistance) }}</strong>
    </div>
    <div v-else-if="activeRoute.calculation === 'hohmann' && transferPlan" class="route-plan">
      <span><small>STARTFENSTER</small><strong>{{ transferPlan.launchOffsetDays > 0 ? `IN ${transferPlan.launchOffsetDays} T` : 'JETZT' }}</strong></span>
      <span><small>FLUGZEIT</small><strong>{{ transferPlan.flightDays }} T</strong></span>
      <span><small>ΔV</small><strong>{{ transferPlan.deltaVKms.toLocaleString('de-DE', { maximumFractionDigits: 2 }) }} KM/S</strong></span>
    </div>
    <p v-else-if="activeRoute.calculation === 'hohmann' && source && destination" class="route-unavailable">Ein Hohmann-Transfer ist nur zwischen Körpern mit demselben Primärkörper und berechenbaren Umlaufbahnen möglich.</p>

    <button v-if="source || destination" class="btn danger route-clear" @click="clearRoute">Route zurücksetzen</button>
  </aside>
</template>
