<script setup>
import { computed, nextTick, ref } from "vue";
import { activeBody, activeMission, addMission, addMissionTarget, deleteMission, focusBody, removeMissionTarget, selectMission, updateMission, view } from "../lib/state.js";
import { presentBody } from "../lib/presentation.js";

const emit = defineEmits(["close"]);
const query = ref("");
const searchInput = ref(null);
const confirmingDelete = ref(null);
const allBodies = computed(() => (view.value?.bodies ?? [])
  .filter((body) => body.kind !== "belt")
  .map((body) => presentBody(view.value, body)));
const byId = computed(() => new Map(allBodies.value.map((body) => [body.id, body])));
const targets = computed(() => (activeMission.value?.target_ids ?? []).map((id) => byId.value.get(id)).filter(Boolean));
const results = computed(() => {
  const term = query.value.trim().toLocaleLowerCase("de-DE");
  if (!term) return [];
  const selected = new Set(activeMission.value?.target_ids ?? []);
  return allBodies.value
    .filter((body) => !selected.has(body.id) && (`${body.name} ${body.tags.join(" ")}`).toLocaleLowerCase("de-DE").includes(term))
    .sort((a, b) => a.name.localeCompare(b.name, "de"))
    .slice(0, 8);
});

function targetSummary(mission) {
  const names = mission.target_ids.map((id) => byId.value.get(id)?.name).filter(Boolean);
  if (!names.length) return "Noch kein Ziel";
  return names.length > 2 ? `${names.slice(0, 2).join(" · ")} · +${names.length - 2}` : names.join(" · ");
}

function createMission() {
  confirmingDelete.value = null;
  addMission();
  nextTick(() => searchInput.value?.focus());
}

function requestDelete(id) {
  if (confirmingDelete.value !== id) {
    confirmingDelete.value = id;
    return;
  }
  confirmingDelete.value = null;
  deleteMission(id);
}

function addTarget(body) {
  if (!activeMission.value) return;
  addMissionTarget(activeMission.value.id, body.id);
  focusBody(body.id);
  query.value = "";
}

function addActiveTarget() {
  if (activeMission.value && activeBody.value?.kind !== "belt") addMissionTarget(activeMission.value.id, activeBody.value.id);
}
</script>

<template>
  <aside class="popover mission-panel" role="dialog" aria-modal="false" aria-label="Missionen bearbeiten" @keydown.esc="emit('close')">
    <header><div><span class="eyebrow">MISSIONEN</span><strong>{{ view.missions.length }} {{ view.missions.length === 1 ? 'MISSION' : 'MISSIONEN' }}</strong></div><button class="icon-btn" aria-label="Missionen schließen" @click="emit('close')">×</button></header>

    <div v-if="view.missions.length" class="mission-list" aria-label="Missionsliste">
      <div v-for="(mission, index) in view.missions" :key="mission.id" class="mission-list__row" :class="{ active: mission.id === view.active_mission_id }">
        <button class="mission-list__select" @click="selectMission(mission.id)">
          <span>MISSION {{ index + 1 }} · {{ mission.target_ids.length }} {{ mission.target_ids.length === 1 ? 'ZIEL' : 'ZIELE' }}</span>
          <strong>{{ mission.objective || 'Neue Mission' }}</strong>
          <small>{{ targetSummary(mission) }}</small>
        </button>
        <button class="mission-list__delete" :aria-label="`Mission ${index + 1} löschen`" @click="requestDelete(mission.id)">{{ confirmingDelete === mission.id ? 'SICHER?' : '×' }}</button>
      </div>
    </div>
    <button class="btn mission-add" :disabled="view.missions.length >= 3" @click="createMission">{{ view.missions.length >= 3 ? 'Maximal 3 Missionen' : '+ Mission hinzufügen' }}</button>

    <template v-if="activeMission">
      <label class="route-objective">Aufgabe<textarea :value="activeMission.objective" rows="3" placeholder="Was soll in dieser Mission erreicht werden?" @change="updateMission(activeMission.id, { objective: $event.currentTarget.value })"></textarea></label>

      <section class="mission-targets">
        <div class="mission-targets__head"><span>ZIELE</span><strong>{{ targets.length }}</strong></div>
        <div v-if="targets.length" class="mission-target-list">
          <div v-for="(body, index) in targets" :key="body.id" class="mission-target-row"><button @click="focusBody(body.id)"><small>ZIEL {{ String(index + 1).padStart(2, '0') }}</small><strong>{{ body.name }}</strong></button><button class="mission-target-remove" title="Ziel entfernen" :aria-label="`${body.name} aus Mission entfernen`" @click="removeMissionTarget(activeMission.id, body.id)">×</button></div>
        </div>
        <p v-else class="mission-target-empty">Noch kein Ziel gesetzt.</p>
        <div class="route-search mission-target-search"><input ref="searchInput" v-model="query" type="search" placeholder="Weiteres Ziel suchen"><button class="small-btn" :disabled="!activeBody || activeBody.kind === 'belt' || activeMission.target_ids.includes(activeBody.id)" @click="addActiveTarget">Aktiver Körper</button></div>
        <div v-if="query" class="route-results"><button v-for="body in results" :key="body.id" @click="addTarget(body)"><span>{{ body.name }}</span><small>{{ body.tags.slice(0, 2).join(' · ') }}</small></button><p v-if="!results.length">Kein Treffer</p></div>
      </section>
    </template>

    <p v-else class="empty mission-empty">Noch keine Mission angelegt.</p>
  </aside>
</template>
