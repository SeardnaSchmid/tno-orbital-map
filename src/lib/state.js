import { computed, reactive } from "vue";
import { clone, forget, load, normalize, persist, uid } from "./storage.js";
import { KERNAUSWAHL, SECTORS } from "./seed.js";

export const state = reactive({
  data: null, draft: null, activeBodyId: "sun", selectedIds: new Set(),
  camera: { focus: "sun", auPerScreen: 3.4, zoom: 1, panX: 0, panY: 0 }, editing: false,
  editorTab: "dossier", status: "", statusTone: "ok", activeViewId: null, viewDirty: false
});

export const view = computed(() => state.draft || state.data);
export const activeBody = computed(() => view.value?.bodies.find((body) => body.id === state.activeBodyId) ?? null);
export const activeSector = computed(() => SECTORS.find((sector) => sector.id === view.value?.active_sector) ?? SECTORS[0]);

/* Ein Sektor bringt den Kern seines Bestands mit, nicht seinen ganzen. Wer
 * einen eigenen Körper anlegt, will ihn sofort sehen — is_custom zählt darum
 * immer zum Kern. Kennt ein Sektor keinen Kern, bleibt es beim alten
 * Verhalten und er zeigt alles, was er hat. */
const KERN = new Set(KERNAUSWAHL);
let persistTimer = null;

function announce(message, tone = "ok") {
  state.status = message;
  state.statusTone = tone;
}

export function clearStatus() {
  state.status = "";
  state.statusTone = "ok";
}

export function markViewDirty() {
  if (state.activeViewId) state.viewDirty = true;
}

function schedulePersist(message = "Gespeichert") {
  if (state.draft || !state.data) return;
  if (persistTimer) globalThis.clearTimeout(persistTimer);
  persistTimer = globalThis.setTimeout(() => {
    persist(state.data);
    persistTimer = null;
  }, 180);
  if (message) announce(message);
}

export function flushPersist() {
  if (!persistTimer || !state.data) return;
  globalThis.clearTimeout(persistTimer);
  persistTimer = null;
  persist(state.data);
}

function defaultSelection(doc, sectorId = doc.active_sector) {
  const imSektor = doc.bodies.filter((body) => body.sector === sectorId);
  const kern = imSektor.filter((body) => KERN.has(body.id) || body.is_custom);
  return (kern.length ? kern : imSektor).map((body) => body.id);
}

function setSectorContext(id) {
  const sector = SECTORS.find((item) => item.id === id) ?? SECTORS[0];
  state.data.active_sector = sector.id;
  state.camera = { ...clone(sector.camera), zoom: 1, panX: 0, panY: 0 };
  state.selectedIds = new Set(defaultSelection(state.data, sector.id));
  state.activeBodyId = state.selectedIds.has(sector.camera.focus)
    ? sector.camera.focus
    : [...state.selectedIds].find((bodyId) => bodyId !== "sun") ?? "sun";
}

function applyView(record, shouldPersist = true) {
  if (!record || !state.data) return false;
  state.data.campaign_date = record.campaign_date;
  state.data.active_sector = record.sector;
  state.data.group = clone(record.group);
  state.data.last_view_id = record.id;
  state.selectedIds = new Set(record.selected_ids);
  state.camera = clone(record.camera);
  state.activeBodyId = record.active_body_id && state.data.bodies.some((body) => body.id === record.active_body_id)
    ? record.active_body_id : [...state.selectedIds].find((bodyId) => bodyId !== "sun") ?? "sun";
  state.activeViewId = record.id;
  state.viewDirty = false;
  if (shouldPersist) schedulePersist(`Szene „${record.name}“ geladen`);
  return true;
}

export function adopt(doc, { persistDocument = false } = {}) {
  state.data = normalize(doc);
  state.draft = null;
  state.editing = false;
  state.activeViewId = null;
  state.viewDirty = false;
  const remembered = state.data.saved_views.find((record) => record.id === state.data.last_view_id);
  if (remembered) applyView(remembered, false);
  else {
    const location = state.data.bodies.find((body) => body.id === state.data.group.location_body_id);
    setSectorContext(location?.sector ?? state.data.active_sector);
    if (location) {
      state.selectedIds.add(location.id);
      if (state.data.group.destination_body_id) state.selectedIds.add(state.data.group.destination_body_id);
      state.activeBodyId = location.id;
    }
  }
  if (persistDocument) persist(state.data);
}

export const boot = () => adopt(load());
export function setSector(id) {
  if (!state.data || state.draft) return;
  setSectorContext(id);
  markViewDirty();
  state.data.last_view_id = null;
  schedulePersist("Sektor gespeichert");
}
export function setSelectedIds(ids, preferredActiveId = null) {
  const next = new Set(ids);
  state.selectedIds = next;
  if (preferredActiveId && next.has(preferredActiveId)) state.activeBodyId = preferredActiveId;
  else if (!next.has(state.activeBodyId)) state.activeBodyId = [...next].find((bodyId) => bodyId !== "sun") ?? "sun";
  markViewDirty();
}
export function toggleSelected(id) {
  const next = new Set(state.selectedIds);
  const removing = next.has(id);
  removing ? next.delete(id) : next.add(id);
  setSelectedIds(next, removing ? null : id);
}
export function selectBody(id) {
  if (!view.value?.bodies.some((body) => body.id === id)) return;
  state.activeBodyId = id;
  markViewDirty();
}
export function focusBody(id) {
  const body = view.value?.bodies.find((item) => item.id === id);
  if (!body || state.draft) return;
  if (body.sector !== state.data.active_sector) setSectorContext(body.sector);
  const byId = new Map(state.data.bodies.map((item) => [item.id, item]));
  let current = body;
  while (current) {
    state.selectedIds.add(current.id);
    /* Die Primärkörper kommen mit, der Stern nur, wenn er ohnehin liegt: sonst
     * holte jeder Sprung auf einen Planeten Sol zurück in die Auswahl. */
    const parent = byId.get(current.parent_id);
    current = parent?.kind === "star" && !state.selectedIds.has(parent.id) ? null : parent;
  }
  state.activeBodyId = body.id;
  markViewDirty();
  state.data.last_view_id = null;
  schedulePersist("");
}
export function setCampaignDate(value, message = "Datum gespeichert") {
  if (!state.data || state.draft) return;
  state.data.campaign_date = value;
  markViewDirty();
  state.data.last_view_id = null;
  schedulePersist(message);
}
export function openEditor(tab = "dossier") {
  if (!state.data) return;
  state.draft = clone(state.data);
  state.editing = true;
  state.editorTab = tab;
  state.draft.body_overrides ??= {};
  state.draft.body_overrides[state.activeBodyId] ??= { alias: "", tags: [], lore: "", stats: [], gm_notes: "" };
  clearStatus();
}
export function hasUnsavedDraft() {
  return !!state.draft && JSON.stringify(normalize(state.draft)) !== JSON.stringify(state.data);
}
export const closeEditor = () => { state.draft = null; state.editing = false; };
export function ensureBodyOverride(id) {
  if (!state.draft || !id) return null;
  state.draft.body_overrides ??= {};
  state.draft.body_overrides[id] ??= { alias: "", tags: [], lore: "", stats: [], gm_notes: "" };
  return state.draft.body_overrides[id];
}
function mutateGroup(mutator, message) {
  const doc = state.draft || state.data;
  if (!doc?.group) return;
  mutator(doc.group, doc);
  if (!state.draft) {
    markViewDirty();
    doc.last_view_id = null;
    schedulePersist(message);
  }
}
export function updateGroup(fields) {
  mutateGroup((group) => {
    if (Object.hasOwn(fields, "name")) group.name = String(fields.name || "").trim() || "GRUPPE";
    if (Object.hasOwn(fields, "objective")) group.objective = String(fields.objective || "").trim();
    if (Object.hasOwn(fields, "show_transfer")) group.show_transfer = !!fields.show_transfer;
    if (["orbiting", "landed", "in-transit", "unknown"].includes(fields.status)) group.status = fields.status;
  }, "Route gespeichert");
}
export function setGroupBody(role, id) {
  mutateGroup((group, doc) => {
    if (!doc.bodies.some((body) => body.id === id && body.kind !== "belt")) return;
    if (role === "location") {
      group.location_body_id = id;
      if (group.destination_body_id === id) group.destination_body_id = null;
      if (group.status === "unknown") group.status = "orbiting";
    }
    if (role === "destination") {
      group.destination_body_id = id === group.location_body_id ? null : id;
      if (group.destination_body_id) group.status = "in-transit";
    }
  }, role === "location" ? "Standort gespeichert" : "Ziel gespeichert");
}
export function clearGroupBody(role) {
  mutateGroup((group) => {
    if (role === "location") {
      group.location_body_id = null;
      group.destination_body_id = null;
      group.status = "unknown";
    } else {
      group.destination_body_id = null;
      if (group.status === "in-transit") group.status = "orbiting";
    }
  }, "Route gespeichert");
}
export function save() {
  if (!state.draft) return;
  state.data = normalize(state.draft);
  persist(state.data);
  state.draft = null;
  state.editing = false;
  announce("Änderungen gespeichert");
}
export function importDocument(doc) {
  adopt(doc, { persistDocument: true });
  announce("Import gespeichert");
}
export function reset() { forget(); adopt(load()); announce("Vorgaben geladen"); }
export function addBody() {
  if (!state.draft) openEditor("body");
  const body = {
    id: uid(), name: "Neuer Ort", kind: "custom", is_custom: true,
    semi_major_axis_au: 1, eccentricity: 0, orbital_period_days: 365.25, epoch_anomaly_deg: 0,
    parent_id: "sun", inclination_deg: 0, radius_km: null, tags: [], lore: "", stats: [],
    sector: view.value.active_sector, color: "#d4841c", color_note: "orange · vom GM festgelegt"
  };
  state.draft.bodies.push(body);
  ensureBodyOverride(body.id);
  state.selectedIds = new Set([...state.selectedIds, body.id]);
  state.activeBodyId = body.id;
  state.editorTab = "body";
  return body;
}
export function deleteBody(id) {
  const hasChildren = state.draft.bodies.some((body) => body.parent_id === id);
  if (hasChildren) throw new Error("Körper mit Monden kann nicht gelöscht werden.");
  state.draft.bodies = state.draft.bodies.filter((body) => body.id !== id);
  delete state.draft.body_overrides[id];
  if (state.draft.group.location_body_id === id) state.draft.group.location_body_id = null;
  if (state.draft.group.destination_body_id === id) state.draft.group.destination_body_id = null;
  state.activeBodyId = "sun";
}
export function saveView(name) {
  const label = String(name || "").trim();
  if (!label) throw new Error("Die Szene braucht einen Namen.");
  const doc = state.data;
  const record = {
    id: uid(), name: label, campaign_date: doc.campaign_date,
    selected_ids: [...state.selectedIds], sector: doc.active_sector,
    active_body_id: state.activeBodyId, camera: clone(state.camera), group: clone(doc.group)
  };
  doc.saved_views.push(record);
  doc.last_view_id = record.id;
  persist(doc);
  state.activeViewId = record.id;
  state.viewDirty = false;
  announce(`Szene „${label}“ gespeichert`);
  return record;
}
export function updateView(id) {
  const doc = state.data;
  const index = doc.saved_views.findIndex((item) => item.id === id);
  if (index < 0) return null;
  const current = doc.saved_views[index];
  const record = {
    id, name: current.name, campaign_date: doc.campaign_date,
    selected_ids: [...state.selectedIds], sector: doc.active_sector,
    active_body_id: state.activeBodyId, camera: clone(state.camera), group: clone(doc.group)
  };
  doc.saved_views.splice(index, 1, record);
  doc.last_view_id = id;
  state.activeViewId = id;
  state.viewDirty = false;
  persist(doc);
  announce(`Szene „${record.name}“ aktualisiert`);
  return record;
}
export function loadView(id) {
  const record = state.data?.saved_views.find((item) => item.id === id);
  return applyView(record, true);
}
export function deleteView(id) {
  const record = state.data?.saved_views.find((item) => item.id === id);
  if (!record) return;
  state.data.saved_views = state.data.saved_views.filter((item) => item.id !== id);
  if (state.data.last_view_id === id) state.data.last_view_id = null;
  if (state.activeViewId === id) { state.activeViewId = null; state.viewDirty = false; }
  persist(state.data);
  announce(`Szene „${record.name}“ gelöscht`);
}
