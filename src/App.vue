<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { activeBody, activeMission, activeRoute, activeSector, adopt, boot, clearRoute, clearRouteBody, clearStatus, deleteView, flushPersist, importDocument, loadView, openEditor, publishCurrentView, reset, saveView, setCampaignDate, setRouteBody, setSector, state, updateRoute, updateView, view } from "./lib/state.js";
import { foundryMode, initialPublishedSnapshot, normalize, onPublishedSnapshot } from "./lib/storage.js";
import { SECTORS } from "./lib/seed.js";
import { auDistanceLabel, distanceLabel, hohmannTransferPlan, lightDelayLabel, positionsFor } from "./lib/orbit.js";
import { addCalendarStep, parseCalendarDate, replaceCalendarPart, todayCalendarDate } from "./lib/date.js";
import { bodyDisplayName, bodyPlayerLore, bodyPlayerStats, bodyPlayerTags, bodyScienceDescription, presentBody } from "./lib/presentation.js";
import OrbitalMap from "./components/OrbitalMap.vue";
import BodyEditor from "./components/BodyEditor.vue";
import BodyPicker from "./components/BodyPicker.vue";
import MissionPanel from "./components/MissionPanel.vue";

const fileInput = ref(null);
const showViews = ref(false);
const showPicker = ref(false);
const showMissions = ref(false);
const showData = ref(false);
const scale = ref(1);
const isPlaying = ref(false);
const selectedStep = ref("day");
const embeddedMode = foundryMode();
const foundryPlayer = embeddedMode === "player";
const playerMode = foundryPlayer;
const waitingForPublishedView = ref(foundryPlayer && !initialPublishedSnapshot());
const dossierOpen = ref(false);
const newViewName = ref("");
const dialog = ref(null);
const dialogPrimary = ref(null);
let playTimer = null;
let statusTimer = null;
const STEPS = {
  day: { label: "1 TAG", amount: 1, unit: "day" },
  week: { label: "7 TAGE", amount: 7, unit: "day" },
  month: { label: "1 MONAT", amount: 1, unit: "month" },
  year: { label: "1 JAHR", amount: 1, unit: "year" }
};
const fit = () => { scale.value = Math.min(window.innerWidth / 1920, window.innerHeight / 1080); };
boot();
const stopFollowingPublishedView = onPublishedSnapshot((snapshot) => {
  if (!foundryPlayer) return;
  waitingForPublishedView.value = !snapshot;
  if (snapshot) adopt(snapshot);
});
onMounted(() => { fit(); window.addEventListener("resize", fit); window.addEventListener("keydown", onKeydown); });
onBeforeUnmount(() => {
  window.removeEventListener("resize", fit);
  window.removeEventListener("keydown", onKeydown);
  stopPlayback();
  flushPersist();
  stopFollowingPublishedView();
});
const customCount = computed(() => (view.value?.bodies ?? []).filter((body) => body.is_custom).length);
const activeParent = computed(() => (view.value?.bodies ?? []).find((body) => body.id === activeBody.value?.parent_id));
const activeInfo = computed(() => presentBody(view.value, activeBody.value));
const activeTags = computed(() => bodyPlayerTags(view.value, activeBody.value));
const activeLore = computed(() => bodyPlayerLore(view.value, activeBody.value));
const activeDescription = computed(() => bodyScienceDescription(activeBody.value));
const activeStatsAll = computed(() => bodyPlayerStats(view.value, activeBody.value));
const activeVisual = computed(() => activeStatsAll.value.find((item) => item.label.trim().toLocaleLowerCase("de-DE") === "darstellung")?.value
  || activeBody.value?.color_note || "neutralgrau · schematische Darstellung");
const activeStats = computed(() => activeStatsAll.value.filter((item) => item.label.trim().toLocaleLowerCase("de-DE") !== "darstellung"));
const solved = computed(() => positionsFor(view.value?.bodies ?? [], view.value?.reference_epoch, view.value?.campaign_date));
const activePosition = computed(() => solved.value.positions.get(activeBody.value?.id));
const routeSource = computed(() => (view.value?.bodies ?? []).find((body) => body.id === activeRoute.value?.source_body_id));
const routeDestination = computed(() => (view.value?.bodies ?? []).find((body) => body.id === activeRoute.value?.destination_body_id));
const routeSourceDistance = computed(() => {
  const from = solved.value.positions.get(routeSource.value?.id);
  const to = activePosition.value;
  return from && to ? Math.hypot(to.x - from.x, to.y - from.y) : null;
});
const routeDistance = computed(() => {
  const from = solved.value.positions.get(routeSource.value?.id);
  const to = solved.value.positions.get(routeDestination.value?.id);
  return from && to ? Math.hypot(to.x - from.x, to.y - from.y) : null;
});
const routeTransfer = computed(() => activeRoute.value?.calculation === "hohmann"
  ? hohmannTransferPlan(routeSource.value, routeDestination.value, view.value?.reference_epoch, view.value?.campaign_date)
  : null);
const missionIndex = computed(() => Math.max(0, (view.value?.missions ?? []).findIndex((mission) => mission.id === activeMission.value?.id)));
const missionTargetCount = computed(() => activeMission.value?.target_ids?.length ?? 0);
const heliocentricDistance = computed(() => activePosition.value ? Math.hypot(activePosition.value.x, activePosition.value.y) : null);
const activeRole = computed(() => activeBody.value?.id === routeSource.value?.id
  ? "ROUTENSTART"
  : activeBody.value?.id === routeDestination.value?.id
    ? "ROUTENZIEL"
    : activeMission.value?.target_ids?.includes(activeBody.value?.id) ? "MISSIONSZIEL" : "");
const style = computed(() => ({ transform: `translate(-50%, -50%) scale(${scale.value})` }));
const dateParts = computed(() => parseCalendarDate(view.value?.campaign_date) ?? { year: 2026, month: 1, day: 1 });
const activeView = computed(() => view.value?.saved_views.find((record) => record.id === state.activeViewId));

watch(() => state.status, (message) => {
  if (statusTimer) window.clearTimeout(statusTimer);
  if (message) statusTimer = window.setTimeout(clearStatus, 2600);
});

function stepDate(direction = 1) {
  const step = STEPS[selectedStep.value];
  setCampaignDate(addCalendarStep(view.value.campaign_date, direction * step.amount, step.unit), isPlaying.value ? "" : "Datum gespeichert");
}
function jumpToToday() {
  stopPlayback();
  setCampaignDate(todayCalendarDate(), "Auf heute gesetzt");
}
function updateDatePart(part, event) {
  stopPlayback();
  setCampaignDate(replaceCalendarPart(view.value.campaign_date, part, event.currentTarget.value));
  event.currentTarget.value = dateParts.value[part];
}
function stopPlayback() {
  isPlaying.value = false;
  if (playTimer) window.clearInterval(playTimer);
  playTimer = null;
}
function togglePlayback() {
  if (isPlaying.value) return stopPlayback();
  isPlaying.value = true;
  playTimer = window.setInterval(() => stepDate(1), 250);
}
function startEditing() {
  stopPlayback();
  closeMenus();
  openEditor("dossier");
}
async function freezeForPlayers() {
  stopPlayback();
  closeMenus();
  try {
    await publishCurrentView();
  } catch (error) {
    state.status = `Freigabe fehlgeschlagen: ${error.message}`;
    state.statusTone = "error";
  }
}
function closeMenus() {
  showPicker.value = false;
  showViews.value = false;
  showMissions.value = false;
  showData.value = false;
}
function toggleMenu(name) {
  const menu = { picker: showPicker, views: showViews, data: showData }[name];
  const next = !menu.value;
  closeMenus();
  menu.value = next;
}
function openMissions() {
  if (playerMode) return;
  closeMenus();
  showMissions.value = true;
}
function openConfirm({ title, message, confirmLabel = "Bestätigen", tone = "primary", onConfirm }) {
  dialog.value = { title, message, confirmLabel, tone, onConfirm };
  nextTick(() => dialogPrimary.value?.focus());
}
function confirmDialog() {
  const action = dialog.value?.onConfirm;
  dialog.value = null;
  action?.();
}
function onKeydown(event) {
  if (event.key !== "Escape" || state.editing) return;
  if (dialog.value) dialog.value = null;
  else closeMenus();
}
function exportData() {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([JSON.stringify(view.value, null, 2)], { type: "application/json" }));
  link.download = `prototyp-2-orbit-${view.value.campaign_date}.json`;
  link.click(); setTimeout(() => URL.revokeObjectURL(link.href), 500);
  state.status = "Export erstellt";
  showData.value = false;
}
async function importData(event) {
  const file = event.target.files?.[0]; event.target.value = "";
  if (!file) return;
  try {
    const doc = normalize(JSON.parse(await file.text()));
    if (!doc.bodies.length) throw new Error("Die Datei enthält keine Körper.");
    const custom = doc.bodies.filter((body) => body.is_custom).length;
    openConfirm({
      title: "Import übernehmen?",
      message: `${doc.bodies.length} Körper, ${custom} eigene Orte und ${doc.saved_views.length} Szenen werden als aktueller Stand gespeichert.`,
      confirmLabel: "Importieren",
      onConfirm: () => { importDocument(doc); closeMenus(); }
    });
  } catch (error) {
    state.status = `Import fehlgeschlagen: ${error.message}`;
    state.statusTone = "error";
  }
}
function storeView() {
  try {
    saveView(newViewName.value);
    newViewName.value = "";
  } catch (error) {
    state.status = error.message;
    state.statusTone = "error";
  }
}
function selectView(id) {
  if (loadView(id)) showViews.value = false;
}
function removeView(record) {
  openConfirm({
    title: "Szene löschen?",
    message: `„${record.name}“ wird dauerhaft aus diesem Kampagnenstand entfernt.`,
    confirmLabel: "Löschen",
    tone: "danger",
    onConfirm: () => deleteView(record.id)
  });
}
function requestReset() {
  openConfirm({
    title: "Auf Vorgaben zurücksetzen?",
    message: "Der lokal gespeicherte Kampagnenstand wird gelöscht. Exportiere ihn vorher, wenn du ihn behalten möchtest.",
    confirmLabel: "Zurücksetzen",
    tone: "danger",
    onConfirm: async () => {
      closeMenus();
      try { await reset(); }
      catch (error) {
        state.status = `Zurücksetzen fehlgeschlagen: ${error.message}`;
        state.statusTone = "error";
      }
    }
  });
}
function recordFocus(record) {
  const body = view.value?.bodies.find((item) => item.id === record.active_body_id);
  return body ? bodyDisplayName(view.value, body) : "kein Fokus";
}
const kindLabel = (kind) => ({ star: "Stern", planet: "Planet", dwarf_planet: "Zwergplanet", moon: "Mond", asteroid: "Kleinplanet", comet: "Komet", belt: "Gürtelregion", custom: "Eigener Körper" }[kind] || kind);
</script>

<template>
  <div id="stage"><main id="sheet" :class="{ 'player-view': playerMode }" :style="style">
    <header class="hud">
      <div class="hud-id"><span class="eyebrow">P2 / FLUGDYNAMIK</span><h1>Orbital<span>karte</span></h1><small><i></i> {{ playerMode ? 'SPIELERANSICHT' : 'GM-KONSOLE' }}</small></div>
      <nav v-if="!playerMode" class="sector-tabs" aria-label="Sektor"><button v-for="sector in SECTORS" :key="sector.id" :class="{ active: activeSector.id === sector.id }" @click="setSector(sector.id)">{{ sector.name }}</button></nav>
      <div v-else class="player-title"><span class="eyebrow">AKTIVER SEKTOR</span><strong>{{ activeSector.name }}</strong><small>{{ view.campaign_date }}</small></div>
      <div v-if="!playerMode" class="hud-tools">
        <button class="btn" :aria-expanded="showPicker" @click="toggleMenu('picker')">Anzeige</button>
        <button class="btn" :aria-expanded="showViews" @click="toggleMenu('views')">Szenen</button>
        <button v-if="embeddedMode === 'gm'" class="btn primary" @click="freezeForPlayers">Spieler einfrieren</button>
        <button class="data-trigger" :aria-expanded="showData" aria-label="Datenverwaltung" @click="toggleMenu('data')">•••</button>
      </div>
      <div v-else class="hud-tools player-tools"><span>SPIELERANSICHT · KAMERA FIX</span></div>
    </header>

    <section v-if="!playerMode" class="control-strip">
      <div class="strip-index">SIM<strong>{{ isPlaying ? 'RUN' : 'HALT' }}</strong></div>
      <div class="date-control">
        <span>SIMULATION / UTC</span>
        <div class="date-fields" role="group" aria-label="Simulationsdatum">
          <input class="date-day" :value="String(dateParts.day).padStart(2, '0')" inputmode="numeric" maxlength="2" aria-label="Tag" @focus="$event.currentTarget.select()" @change="updateDatePart('day', $event)" @keydown.enter="$event.currentTarget.blur()"><i>.</i>
          <input class="date-month" :value="String(dateParts.month).padStart(2, '0')" inputmode="numeric" maxlength="2" aria-label="Monat" @focus="$event.currentTarget.select()" @change="updateDatePart('month', $event)" @keydown.enter="$event.currentTarget.blur()"><i>.</i>
          <input class="date-year" :value="dateParts.year" inputmode="numeric" maxlength="6" aria-label="Jahr" @focus="$event.currentTarget.select()" @change="updateDatePart('year', $event)" @keydown.enter="$event.currentTarget.blur()">
          <button class="today-button" aria-label="Zum heutigen Datum springen" @click="jumpToToday">Heute</button>
        </div>
      </div>
      <div class="date-transport" aria-label="Zeitsteuerung">
        <button class="step-button" aria-label="Einen Schritt zurück" @click="stepDate(-1)">−</button>
        <button class="play-button" :class="{ active: isPlaying }" :aria-label="isPlaying ? 'Simulation pausieren' : 'Simulation abspielen'" @click="togglePlayback"><span>{{ isPlaying ? 'Ⅱ' : '▶' }}</span>{{ isPlaying ? 'PAUSE' : 'PLAY' }}</button>
        <button class="step-button" aria-label="Einen Schritt vor" @click="stepDate(1)">+</button>
        <label><span>SCHRITT</span><select v-model="selectedStep" aria-label="Schrittweite"><option v-for="(step, id) in STEPS" :key="id" :value="id">{{ step.label }}</option></select></label>
      </div>
      <div class="strip-context"><span>AKTIVE SZENE<strong>{{ activeView ? `${activeView.name}${state.viewDirty ? ' · GEÄNDERT' : ''}` : 'UNGESPEICHERTER STAND' }}</strong></span><span>KÖRPER<strong>{{ state.selectedIds.size.toString().padStart(2, '0') }} SICHTBAR</strong></span></div>
    </section>

    <section v-else class="player-strip"><span>MISSIONSDATUM<strong>{{ view.campaign_date }}</strong></span><span v-if="activeMission">MISSION<strong>{{ missionIndex + 1 }} / {{ view.missions.length }} · {{ missionTargetCount }} {{ missionTargetCount === 1 ? 'ZIEL' : 'ZIELE' }}</strong></span><span v-if="routeSource || routeDestination">ROUTE<strong>{{ activeRoute.calculation === 'hohmann' ? 'HOHMANN · EFFIZIENT' : 'DIREKT' }}</strong></span><span v-if="routeTransfer">FLUGZEIT<strong>{{ routeTransfer.flightDays }} T</strong></span><span v-else-if="routeDistance !== null">DISTANZ<strong>{{ auDistanceLabel(routeDistance) }}</strong></span><span v-if="routeDistance !== null">SIGNALLAUFZEIT<strong>{{ lightDelayLabel(routeDistance) }}</strong></span></section>

    <OrbitalMap :interactive="!playerMode" :selectable="!waitingForPublishedView" @edit-missions="openMissions" />

    <aside v-if="activeBody" class="detail-panel" :class="{ expanded: dossierOpen }">
      <header><span class="eyebrow">OBJ / {{ activeBody.id }}</span><div class="detail-panel__actions"><button class="dossier-toggle" @click="dossierOpen = !dossierOpen">{{ dossierOpen ? 'KOMPAKT' : 'DOSSIER' }}</button><button v-if="!playerMode" class="config-btn" title="Dossier bearbeiten" aria-label="Dossier bearbeiten" @click="startEditing">⚙</button></div></header>
      <div class="object-title"><span>{{ kindLabel(activeBody.kind) }}{{ activeBody.is_custom ? ' · GM' : '' }}</span><h2>{{ activeInfo.name }}</h2></div>
      <p v-if="activeRole" class="group-context">{{ activeRole }}</p>
      <p v-if="activeTags.length" class="tags"><span v-for="tag in activeTags" :key="tag">{{ tag }}</span></p>
      <p class="visual-look"><i :style="{ backgroundColor: activeBody.color || '#929b9b' }"></i><span><small>AUSSEHEN</small>{{ activeVisual }}</span></p>
      <p class="lore"><span v-if="activeLore" class="campaign-lore">{{ activeLore }}</span><span v-if="!activeLore || dossierOpen" class="science-lore">{{ activeDescription || 'Kein wissenschaftliches Kurzprofil verfügbar.' }}</span></p>
      <dl>
        <dt>Primärkörper</dt><dd>{{ activeParent ? bodyDisplayName(view, activeParent) : activeBody.kind === 'star' ? 'Referenz' : activeBody.kind === 'belt' ? 'Sol · Bezugssystem' : 'Sonnenbaryzentrum' }}</dd>
        <template v-if="activeBody.kind !== 'star' && activeBody.kind !== 'belt' && heliocentricDistance !== null"><dt>Distanz zu Sol</dt><dd>{{ distanceLabel(heliocentricDistance) }}</dd></template>
        <template v-if="activeBody.kind !== 'belt' && routeSource && routeSourceDistance !== null"><dt>Distanz zum Routenstart</dt><dd>{{ distanceLabel(routeSourceDistance) }}</dd><dt>Signallaufzeit</dt><dd>{{ lightDelayLabel(routeSourceDistance) }}</dd></template>
        <template v-if="dossierOpen"><template v-if="activeBody.kind !== 'belt'"><dt>Große Halbachse</dt><dd>{{ distanceLabel(activeBody.semi_major_axis_au) }}</dd><dt>Exzentrizität</dt><dd>{{ activeBody.eccentricity.toLocaleString('de-DE') }}</dd><dt>Umlaufzeit</dt><dd>{{ activeBody.orbital_period_days ? `${activeBody.orbital_period_days.toLocaleString('de-DE')} T` : 'statisch' }}</dd></template><template v-for="stat in activeStats" :key="`${stat.label}-${stat.value}`"><dt>{{ stat.label }}</dt><dd>{{ stat.value }}</dd></template></template>
      </dl>
      <section v-if="!playerMode" class="route-dock">
        <div class="route-dock__row">
          <button class="route-dock__end" :disabled="activeBody.kind === 'belt'" :class="{ active: activeBody.id === routeSource?.id }" :title="activeBody.id === routeSource?.id ? `${activeInfo.name} als Routenstart lösen` : `${activeInfo.name} als Routenstart setzen`" @click="activeBody.id === routeSource?.id ? clearRouteBody('source') : setRouteBody('source', activeBody.id)">
            <small>START</small><strong>{{ routeSource ? bodyDisplayName(view, routeSource) : 'nicht gesetzt' }}</strong>
          </button>
          <select class="route-dock__calc" aria-label="Berechnungsart" :value="activeRoute?.calculation" @change="updateRoute({ calculation: $event.currentTarget.value })">
            <option value="direct" title="Gerade Entfernung zum eingestellten Datum">Direkt</option>
            <option value="hohmann" title="Treibstoffeffizienter Zweimpuls-Transfer">Hohmann</option>
          </select>
          <button class="route-dock__end" :disabled="activeBody.kind === 'belt'" :class="{ active: activeBody.id === routeDestination?.id }" :title="activeBody.id === routeDestination?.id ? `${activeInfo.name} als Routenziel lösen` : `${activeInfo.name} als Routenziel setzen`" @click="activeBody.id === routeDestination?.id ? clearRouteBody('destination') : setRouteBody('destination', activeBody.id)">
            <small>ZIEL</small><strong>{{ routeDestination ? bodyDisplayName(view, routeDestination) : 'nicht gesetzt' }}</strong>
          </button>
          <button v-if="routeSource || routeDestination" class="route-dock__clear" aria-label="Route zurücksetzen" title="Route zurücksetzen" @click="clearRoute">×</button>
        </div>
        <div v-if="activeRoute?.calculation === 'direct' && routeDistance !== null" class="route-distance"><span>DIREKTE DISTANZ</span><strong>{{ auDistanceLabel(routeDistance) }}</strong></div>
        <div v-else-if="activeRoute?.calculation === 'hohmann' && routeTransfer" class="route-plan">
          <span><small>STARTFENSTER</small><strong>{{ routeTransfer.launchOffsetDays > 0 ? `IN ${routeTransfer.launchOffsetDays} T` : 'JETZT' }}</strong></span>
          <span><small>FLUGZEIT</small><strong>{{ routeTransfer.flightDays }} T</strong></span>
          <span><small>ΔV</small><strong>{{ routeTransfer.deltaVKms.toLocaleString('de-DE', { maximumFractionDigits: 2 }) }} KM/S</strong></span>
        </div>
        <p v-else-if="activeRoute?.calculation === 'hohmann' && routeSource && routeDestination" class="route-unavailable">Ein Hohmann-Transfer ist nur zwischen Körpern mit demselben Primärkörper und berechenbaren Umlaufbahnen möglich.</p>
      </section>
      <footer><span>{{ dossierOpen ? 'KAMPAGNENDOSSIER' : 'NAV-ÜBERSICHT' }}</span><strong>VALID</strong></footer>
    </aside>

    <BodyPicker v-if="showPicker" @close="showPicker = false" />
    <MissionPanel v-if="showMissions" @close="showMissions = false" />

    <aside v-if="showViews" class="popover views" role="dialog" aria-label="Gespeicherte Szenen" @keydown.esc="showViews = false">
      <header><span class="eyebrow">GESPEICHERTE SZENEN</span><button class="icon-btn" @click="showViews = false">×</button></header>
      <div class="view-create"><input v-model="newViewName" placeholder="Name der neuen Szene" @keydown.enter="storeView"><button class="btn primary" @click="storeView">Speichern</button></div>
      <div v-for="record in view.saved_views" :key="record.id" class="view-row" :class="{ active: state.activeViewId === record.id, dirty: state.activeViewId === record.id && state.viewDirty }">
        <button class="view-load" @click="selectView(record.id)"><span>{{ record.name }}{{ state.activeViewId === record.id && state.viewDirty ? ' · geändert' : '' }}</span><small>{{ record.campaign_date }} · {{ record.selected_ids.length }} Körper · Fokus {{ recordFocus(record) }}</small></button>
        <button class="view-delete" :aria-label="`${record.name} löschen`" @click="removeView(record)">×</button>
      </div>
      <p v-if="!view.saved_views.length" class="empty">Noch keine Szene gespeichert.</p>
      <button v-if="activeView" class="btn view-update" @click="updateView(activeView.id)">Aktive Szene aktualisieren</button>
    </aside>

    <aside v-if="showData" class="popover data-menu" role="dialog" aria-label="Datenverwaltung" @keydown.esc="showData = false">
      <header><span class="eyebrow">DATENVERWALTUNG</span><button class="icon-btn" @click="showData = false">×</button></header>
      <p>Der aktuelle Kampagnenstand wird lokal in diesem Browser gespeichert.</p>
      <button class="btn" @click="exportData">JSON exportieren</button><button class="btn" @click="fileInput?.click()">JSON importieren</button><button class="btn danger" @click="requestReset">Auf Vorgaben zurücksetzen</button>
      <small>{{ view.bodies.length }} Körper · {{ customCount }} eigene Orte · {{ view.saved_views.length }} Szenen</small>
    </aside>

    <div v-if="state.status" class="toast" :class="`toast--${state.statusTone}`" role="status">{{ state.status }}</div>
    <div v-if="waitingForPublishedView" class="published-empty" role="status"><span class="eyebrow">NAVIGATIONSTISCH</span><h2>Noch keine Ansicht freigegeben</h2><p>Die Spielleitung hat für diese Foundry-Szene noch keinen Kartenstand eingefroren.</p></div>
    <BodyEditor v-if="state.editing" />

    <div v-if="dialog" class="dialog-backdrop" @click.self="dialog = null">
      <section class="dialog-card" role="alertdialog" aria-modal="true">
        <span class="eyebrow">BESTÄTIGEN</span><h2>{{ dialog.title }}</h2><p>{{ dialog.message }}</p>
        <footer><button class="btn" @click="dialog = null">Abbrechen</button><button ref="dialogPrimary" class="btn" :class="dialog.tone" @click="confirmDialog">{{ dialog.confirmLabel }}</button></footer>
      </section>
    </div>
  </main></div>
  <input ref="fileInput" type="file" accept="application/json,.json" hidden @change="importData">
</template>
