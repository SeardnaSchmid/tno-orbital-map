<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { activeBody, addBody, closeEditor, deleteBody, ensureBodyOverride, hasUnsavedDraft, save, state } from "../lib/state.js";
import { bodyDisplayName } from "../lib/presentation.js";
import { SECTORS } from "../lib/seed.js";

const body = activeBody;
const parentSearch = ref("");
const confirmation = ref(null);
const tab = computed({ get: () => state.editorTab, set: (value) => { state.editorTab = value; } });
const scienceEditable = computed(() => !!body.value?.is_custom);
const campaign = computed(() => state.draft?.body_overrides?.[body.value?.id] ?? null);
const parents = computed(() => {
  const query = parentSearch.value.trim().toLowerCase();
  const available = (state.draft?.bodies ?? []).filter((item) => item.id !== body.value?.id && item.kind !== "belt");
  const matching = query
    ? available.filter((item) => bodyDisplayName(state.draft, item).toLowerCase().includes(query))
    : available.filter((item) => item.id === body.value?.parent_id || ["sun", "earth", "mars", "jupiter", "saturn"].includes(item.id));
  return matching.sort((a, b) => bodyDisplayName(state.draft, a).localeCompare(bodyDisplayName(state.draft, b), "de"));
});
const campaignTags = computed({
  get: () => campaign.value?.tags.join(", ") || "",
  set: (value) => { campaign.value.tags = value.split(",").map((tag) => tag.trim()).filter(Boolean); }
});

watch(() => body.value?.id, (id) => {
  if (id) ensureBodyOverride(id);
  parentSearch.value = "";
}, { immediate: true });

function addStat() { campaign.value.stats.push({ label: "", value: "" }); }
function removeStat(index) { campaign.value.stats.splice(index, 1); }
function requestClose() {
  if (hasUnsavedDraft()) confirmation.value = "discard";
  else closeEditor();
}
function requestRemove() { confirmation.value = "delete"; }
function confirmAction() {
  if (confirmation.value === "discard") closeEditor();
  if (confirmation.value === "delete") remove();
  confirmation.value = null;
}
function remove() {
  try { deleteBody(body.value.id); }
  catch (error) { state.status = error.message; state.statusTone = "error"; }
}
function newBody() { addBody(); }
function onKeydown(event) {
  if (event.key !== "Escape") return;
  confirmation.value ? confirmation.value = null : requestClose();
}
onMounted(() => window.addEventListener("keydown", onKeydown));
onBeforeUnmount(() => window.removeEventListener("keydown", onKeydown));
</script>

<template>
  <aside class="editor-drawer" role="dialog" aria-modal="true" aria-label="Körper und Kampagneninformationen bearbeiten">
    <header>
      <div><span class="eyebrow">GM-AUTORING</span><h2>{{ body ? bodyDisplayName(state.draft, body) : 'Kein Körper' }}</h2></div>
      <button class="icon-btn" aria-label="Editor schließen" @click="requestClose">×</button>
    </header>

    <nav class="editor-tabs" aria-label="Editorbereich">
      <button :class="{ active: tab === 'dossier' }" @click="tab = 'dossier'">Dossier</button>
      <button :class="{ active: tab === 'body' }" @click="tab = 'body'">{{ scienceEditable ? 'Körperdaten' : 'Wissenschaft' }}</button>
    </nav>

    <div v-if="body && campaign" class="editor-scroll">
      <section v-if="tab === 'dossier'" class="editor-section campaign-editor">
        <div class="section-line"><div><span class="eyebrow">SPIELERDOSSIER</span><h3>Kampagneninformationen</h3></div><small>für jeden Körper editierbar</small></div>
        <label>Anzeigename / Alias<input v-model="campaign.alias" :placeholder="body.name"></label>
        <label>Kampagnen-Tags<input v-model="campaignTags" placeholder="Fraktion, Gefahr, Auftrag"></label>
        <label>Information für die Spieler<textarea v-model="campaign.lore" rows="5" placeholder="Was weiß die Gruppe über diesen Ort?"></textarea></label>

        <div class="section-line"><h3>Freie Daten</h3><button class="small-btn" @click="addStat">+ Zeile</button></div>
        <div v-for="(stat, index) in campaign.stats" :key="index" class="stat-row">
          <input v-model="stat.label" aria-label="Bezeichnung" placeholder="Bezeichnung">
          <input v-model="stat.value" aria-label="Wert" placeholder="Wert">
          <button aria-label="Zeile löschen" @click="removeStat(index)">×</button>
        </div>
        <label class="gm-notes">Nur für die Spielleitung<textarea v-model="campaign.gm_notes" rows="3" placeholder="Diese Notiz erscheint nicht in der Spieleransicht."></textarea></label>
      </section>

      <section v-if="tab === 'body'" class="editor-section orbit-editor">
        <div class="section-line"><div><span class="eyebrow">ORBITALOBJEKT</span><h3>{{ scienceEditable ? 'Eigener Körper' : 'Astronomische Seed-Daten' }}</h3></div><small>{{ scienceEditable ? 'einfach starten, später verfeinern' : 'geschützt' }}</small></div>
        <template v-if="!scienceEditable">
          <p class="editor-note">Die wissenschaftlichen Felder bleiben unverändert. Alias, Spielerinformationen und freie Daten oben können bearbeitet werden.</p>
          <p v-if="body.description" class="science-preview">{{ body.description }}</p>
          <small v-if="body.source" class="science-source">QUELLE · {{ body.source }}</small>
        </template>

        <template v-if="scienceEditable">
          <div class="field-grid"><label>Name<input v-model="body.name"></label><label>Marker-Art<select v-model="body.kind"><option value="custom">Ort / Station</option><option value="asteroid">Kleinplanet</option><option value="moon">Mond</option><option value="comet">Komet</option><option value="planet">Planet</option></select></label></div>
          <label>Primärkörper suchen<input v-model="parentSearch" type="search" placeholder="z. B. Erde, Mars oder Jupiter"></label>
          <label>Übergeordnet<select v-model="body.parent_id"><option :value="null">Sonnenbaryzentrum / kein Elternkörper</option><option v-for="parent in parents" :key="parent.id" :value="parent.id">{{ bodyDisplayName(state.draft, parent) }}</option></select></label>
          <div class="field-grid"><label>Orbitale Distanz (AE)<input v-model.number="body.semi_major_axis_au" type="number" min="0" step=".00001"></label><label>Sektor<select v-model="body.sector"><option v-for="sector in SECTORS" :key="sector.id" :value="sector.id">{{ sector.name }}</option></select></label></div>
          <div class="field-grid"><label>Radius (km)<input v-model.number="body.radius_km" type="number" min="0" step="1" placeholder="bestimmt die Markergröße"></label><label>Visuelles Erscheinungsbild<input v-model="body.color_note" placeholder="z. B. silbrig · rotierende Habitatsektionen"></label></div>

          <details class="advanced-fields">
            <summary>Erweiterte Orbitdaten</summary>
            <div class="field-grid"><label>Exzentrizität<input v-model.number="body.eccentricity" type="number" min="0" max=".9" step=".001"></label><label>Umlaufzeit (Tage)<input v-model.number="body.orbital_period_days" type="number" min="0" step=".01"></label><label>Epoche-Anomalie (°)<input v-model.number="body.epoch_anomaly_deg" type="number" step="1"></label><label>Inklination (Referenz)<input v-model.number="body.inclination_deg" type="number" step=".1"></label></div>
            <label>Markierungsfarbe<input v-model="body.color" type="color"></label>
          </details>
        </template>
      </section>
    </div>

    <footer><button class="btn" @click="newBody">+ Neuer Körper</button><button v-if="scienceEditable" class="btn danger" @click="requestRemove">Löschen</button><button class="btn primary" @click="save">Speichern</button><span>{{ state.status }}</span></footer>

    <div v-if="confirmation" class="dialog-backdrop editor-confirmation" @click.self="confirmation = null">
      <section class="dialog-card" role="alertdialog" aria-modal="true">
        <span class="eyebrow">BESTÄTIGEN</span>
        <h3>{{ confirmation === 'delete' ? 'Eigenen Körper löschen?' : 'Änderungen verwerfen?' }}</h3>
        <p>{{ confirmation === 'delete' ? 'Der Körper wird aus dem Entwurf entfernt. Speichern übernimmt die Löschung endgültig.' : 'Alle Änderungen in diesem Editor gehen verloren.' }}</p>
        <footer><button class="btn" @click="confirmation = null">Abbrechen</button><button class="btn danger" @click="confirmAction">{{ confirmation === 'delete' ? 'Löschen' : 'Verwerfen' }}</button></footer>
      </section>
    </div>
  </aside>
</template>
