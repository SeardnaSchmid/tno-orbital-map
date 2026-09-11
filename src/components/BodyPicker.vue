<script setup>
/* Die Sichtbarkeitsliste als Baum. Bei sechshundert Körpern trägt eine flache
 * Liste nicht mehr: Monde gehören unter ihren Primärkörper, und wer einen
 * bestimmten Körper sucht, soll ihn tippen können statt zu scrollen.
 *
 * Vier Ebenen — Sektor, Gruppe, Körper, Mond. Jede schaltet ihren ganzen Ast;
 * die Zahl rechts sagt, wie viel davon gerade liegt. */

import { computed, nextTick, onMounted, ref, watch } from "vue";
import { SECTORS } from "../lib/seed.js";
import { addBody, focusBody, openEditor, setSelectedIds, state, toggleSelected, view } from "../lib/state.js";
import { buildTree, trifftSuche } from "../lib/tree.js";
import { presentBody } from "../lib/presentation.js";

const emit = defineEmits(["close"]);
const suche = ref("");
const suchfeld = ref(null);
const zu = ref(new Set());

const alle = computed(() => (view.value?.bodies ?? []).map((body) => presentBody(view.value, body)));
const begriff = computed(() => suche.value.trim().toLowerCase());
const baum = computed(() => buildTree(alle.value, SECTORS, begriff.value));

const bilanz = (ids) => ({ von: ids.length, an: ids.filter((id) => state.selectedIds.has(id)).length });
const gewaehlt = (id) => state.selectedIds.has(id);
const voll = (ids) => ids.length > 0 && ids.every((id) => state.selectedIds.has(id));
const teils = (ids) => ids.some((id) => state.selectedIds.has(id)) && !voll(ids);

/* Ein Ast, der nicht voll liegt, wird ganz gelegt; ein voller wird geräumt. */
function schalteAst(ids) {
  if (!ids.length) return;
  const raeumen = voll(ids);
  const naechste = new Set(state.selectedIds);
  for (const id of ids) raeumen ? naechste.delete(id) : naechste.add(id);
  setSelectedIds(naechste);
}

const eingeklappt = (pfad) => zu.value.has(pfad);
function klappe(pfad) {
  const naechste = new Set(zu.value);
  naechste.has(pfad) ? naechste.delete(pfad) : naechste.add(pfad);
  zu.value = naechste;
}

/* Ab hier lohnt das Zuklappen: Erde und ihr eine Mond bleiben offen, Jupiter
 * mit seinen zweiundsiebzig nicht. */
const VOLL_AB = 8;

/* Ohne Suche liegt nur der aktive Sektor offen — sechs aufgeklappte Sektoren
 * wären wieder die lange Liste von vorher. Mit Suche ist alles offen, sonst
 * versteckt sich der Treffer hinter einem Dreieck. */
watch([() => view.value?.active_sector, begriff, baum], ([aktiv, suchend, aktuellerBaum]) => {
  if (suchend) { zu.value = new Set(); return; }
  const naechste = new Set(SECTORS.filter((s) => s.id !== aktiv).map((s) => s.id));
  for (const sektor of aktuellerBaum) {
    for (const gruppe of sektor.gruppen) {
      const stand = bilanz(gruppe.ids);
      if (gruppe.ids.length > VOLL_AB || (gruppe.ids.length && stand.an === 0)) naechste.add(gruppe.pfad);
      for (const knoten of gruppe.knoten) if (knoten.kinder.length > VOLL_AB) naechste.add(knoten.pfad);
    }
  }
  zu.value = naechste;
}, { immediate: true });

const gesamt = computed(() => bilanz(alle.value.map((koerper) => koerper.id)));

function leeren() { suche.value = ""; nextTick(() => suchfeld.value?.focus()); }
function fokussiere(id) {
  focusBody(id);
  emit("close");
}

/* Nach einer Suche ist das Naheliegende, genau die Treffer zu zeigen und
 * sonst nichts — die Auswahl von vorher wäre nur im Weg. */
function nurTreffer() {
  const gefunden = alle.value.filter((koerper) => trifftSuche(koerper, begriff.value));
  setSelectedIds(gefunden.map((koerper) => koerper.id), gefunden[0]?.id);
}
function neuerKoerper() {
  emit("close");
  openEditor();
  addBody();
}
onMounted(() => nextTick(() => suchfeld.value?.focus()));
</script>

<template>
  <aside class="popover picker" role="dialog" aria-modal="false" aria-label="Kartenanzeige" @keydown.esc="emit('close')">
    <header>
      <span class="eyebrow">ANZEIGE &amp; SUCHE</span>
      <button class="icon-btn" @click="emit('close')">×</button>
    </header>

    <div class="picker-search">
      <input ref="suchfeld" v-model="suche" type="search" placeholder="Suchen — Name oder Tag" autocomplete="off">
      <button v-if="suche" class="icon-btn" title="Suche leeren" @click="leeren">×</button>
    </div>

    <p class="picker-status">
      <span>{{ gesamt.an }} von {{ gesamt.von }} sichtbar</span>
      <button v-if="begriff" class="linkish" @click="nurTreffer">nur Treffer zeigen</button>
    </p>

    <div class="picker-tree">
      <p v-if="!baum.length" class="picker-leer">Kein Körper passt zu Name oder Tag.</p>

      <section v-for="sektor in baum" :key="sektor.pfad">
        <div class="tree-zeile tief-0">
          <button class="tree-klapp" :aria-expanded="!eingeklappt(sektor.pfad)" @click="klappe(sektor.pfad)">
            {{ eingeklappt(sektor.pfad) ? '▸' : '▾' }}
          </button>
          <input type="checkbox" :checked="voll(sektor.ids)" :indeterminate.prop="teils(sektor.ids)"
                 @change="schalteAst(sektor.ids)">
          <button class="tree-name tree-toggle eyebrow" @click="klappe(sektor.pfad)">{{ sektor.name }}</button>
          <small>{{ bilanz(sektor.ids).an }}/{{ sektor.ids.length }}</small>
        </div>

        <template v-if="!eingeklappt(sektor.pfad)">
          <template v-for="gruppe in sektor.gruppen" :key="gruppe.pfad">
            <div class="tree-zeile tief-1">
              <button class="tree-klapp" :aria-expanded="!eingeklappt(gruppe.pfad)" @click="klappe(gruppe.pfad)">
                {{ eingeklappt(gruppe.pfad) ? '▸' : '▾' }}
              </button>
              <input type="checkbox" :checked="voll(gruppe.ids)" :indeterminate.prop="teils(gruppe.ids)"
                     :disabled="!gruppe.ids.length" @change="schalteAst(gruppe.ids)">
              <button class="tree-name tree-toggle" @click="klappe(gruppe.pfad)">{{ gruppe.name }}</button>
              <small>{{ bilanz(gruppe.ids).an }}/{{ gruppe.ids.length }}</small>
            </div>

            <template v-if="!eingeklappt(gruppe.pfad)">
              <template v-for="knoten in gruppe.knoten" :key="knoten.pfad">
                <div class="tree-zeile tief-2" :class="{ treffer: begriff && knoten.treffer }">
                  <button v-if="knoten.kinder.length" class="tree-klapp"
                          :aria-expanded="!eingeklappt(knoten.pfad)" @click="klappe(knoten.pfad)">
                    {{ eingeklappt(knoten.pfad) ? '▸' : '▾' }}
                  </button>
                  <span v-else class="tree-klapp leer"></span>
                  <input type="checkbox" :checked="gewaehlt(knoten.koerper.id)"
                         @change="toggleSelected(knoten.koerper.id)">
                  <button class="tree-name tree-toggle" @click="fokussiere(knoten.koerper.id)">{{ knoten.koerper.name }}</button>
                  <small v-if="knoten.kindIds.length">{{ bilanz(knoten.kindIds).an }}/{{ knoten.kindIds.length }}</small>
                </div>

                <template v-if="!eingeklappt(knoten.pfad)">
                  <div v-for="kind in knoten.kinder" :key="kind.pfad"
                       class="tree-zeile tief-3" :class="{ treffer: begriff && kind.treffer }">
                    <span class="tree-klapp leer"></span>
                    <input type="checkbox" :checked="gewaehlt(kind.koerper.id)"
                           @change="toggleSelected(kind.koerper.id)">
                    <button class="tree-name tree-toggle" @click="fokussiere(kind.koerper.id)">{{ kind.koerper.name }}</button>
                  </div>
                </template>
              </template>
            </template>
          </template>
        </template>
      </section>
    </div>
    <button class="btn picker-add" @click="neuerKoerper">+ Neuer Körper</button>
  </aside>
</template>
