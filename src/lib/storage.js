import { SEED, SECTORS } from "./seed.js";
import { normalizeCalendarDate } from "./date.js";

export const KEY = "navigationstisch.orbit.v1";
export const clone = (value) => JSON.parse(JSON.stringify(value));
export const uid = (prefix = "body") => `${prefix}-${globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)}`;
const bridge = () => globalThis.htmlAsScene ?? null;

const kinds = new Set(["star", "planet", "dwarf_planet", "moon", "asteroid", "comet", "belt", "custom"]);
const routeCalculations = new Set(["direct", "hohmann"]);
const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const date = normalizeCalendarDate;
const text = (value, fallback = "") => typeof value === "string" ? value : fallback;
const stats = (value) => Array.isArray(value)
  ? value.map((stat) => ({ label: text(stat?.label), value: text(stat?.value) })).filter((stat) => stat.label || stat.value)
  : [];

/* Der Radius ist Messung, keine Autorschaft: für Katalogkörper zählt immer
 * der Seed, auch in längst gespeicherten Dokumenten. So wächst das Feld ohne
 * Migration nach; nur ein selbst angelegter Körper trägt seinen eigenen. */
function radiusKm(body, seed) {
  const value = number(body?.is_custom ? body?.radius_km : seed?.radius_km ?? body?.radius_km, 0);
  return value > 0 ? value : null;
}

function bodyId(value, ids) {
  const id = value ? String(value) : null;
  return id && ids.has(id) ? id : null;
}

function normalizeMission(value, ids, index = 0) {
  const mission = value && typeof value === "object" ? value : {};
  const targets = Array.isArray(mission.target_ids)
    ? mission.target_ids.map((id) => bodyId(id, ids)).filter(Boolean)
    : [bodyId(mission.destination_body_id, ids)].filter(Boolean);
  return {
    id: text(mission.id).trim() || `mission-${index + 1}`,
    objective: text(mission.objective).trim(),
    target_ids: [...new Set(targets)]
  };
}

function normalizeRoute(value, ids) {
  const route = value && typeof value === "object" ? value : {};
  const source = bodyId(route.source_body_id ?? route.location_body_id, ids);
  const destination = bodyId(route.destination_body_id, ids);
  const legacyCalculation = route.show_transfer === true ? "hohmann" : "direct";
  return {
    source_body_id: source,
    destination_body_id: destination === source ? null : destination,
    calculation: routeCalculations.has(route.calculation) ? route.calculation : legacyCalculation
  };
}

function legacyRouteFromMissions(missions, activeId) {
  if (!Array.isArray(missions)) return null;
  const activeMissions = missions.slice(0, 3);
  return activeMissions.find((mission) => String(mission?.id) === String(activeId)) ?? activeMissions[0] ?? null;
}

function normalizeMissions(value, ids, legacyGroup = null) {
  const source = Array.isArray(value) ? value : legacyGroup && typeof legacyGroup === "object" ? [legacyGroup] : [];
  const used = new Set();
  return source.map((mission, index) => {
    const normalized = normalizeMission(mission, ids, index);
    if (used.has(normalized.id)) {
      const base = `mission-${index + 1}`;
      normalized.id = base;
      let suffix = 2;
      while (used.has(normalized.id)) normalized.id = `${base}-${suffix++}`;
    }
    used.add(normalized.id);
    return normalized;
  }).slice(0, 3);
}

function normalizeCamera(value, sector, ids) {
  const camera = value && typeof value === "object" ? value : {};
  const fallback = SECTORS.find((item) => item.id === sector)?.camera ?? SECTORS[0].camera;
  return {
    focus: bodyId(camera.focus, ids) ?? fallback.focus,
    auPerScreen: Math.max(.0005, number(camera.auPerScreen, fallback.auPerScreen)),
    zoom: Math.max(.25, Math.min(32, number(camera.zoom, 1))),
    panX: number(camera.panX),
    panY: number(camera.panY)
  };
}

export function normalize(source) {
  const doc = source && typeof source === "object" ? clone(source) : clone(SEED);
  const sourceVersion = number(doc.version, 1);
  const storedBodies = Array.isArray(doc.bodies) ? doc.bodies : [];
  const legacyBodies = new Map(storedBodies.map((body) => [String(body?.id), {
    lore: text(body?.lore), stats: stats(body?.stats)
  }]));
  const seedBodies = new Map(SEED.bodies.map((body) => [body.id, body]));
  doc.version = 6;
  doc.reference_epoch = date(doc.reference_epoch, SEED.reference_epoch);
  doc.campaign_date = date(doc.campaign_date, SEED.campaign_date);
  doc.active_sector = SECTORS.some((sector) => sector.id === doc.active_sector)
    ? doc.active_sector : SEED.active_sector;
  /* Der astronomische Katalog ist Anwendungsbestand, kein Kampagnenzustand.
   * Ein alter LocalStorage-Stand oder Foundry-Snapshot darf ihn darum nicht
   * auf seine damalige Teilmenge zusammenschneiden. Gespeicherte Exemplare
   * behalten ihre Kampagnendaten; seitdem hinzugekommene Katalogkörper werden
   * aus dem aktuellen Seed ergänzt. Eigene Körper bleiben zusätzlich erhalten.
   * Gürtel folgen immer dem Seed, weil ihre Region und Elternschaft kuratiert
   * sind und nicht im Körpereditor verändert werden können. */
  const storedById = new Map(storedBodies.map((body) => [String(body?.id), body]));
  const seedBeltIds = new Set(SEED.bodies.filter((body) => body.kind === "belt").map((body) => body.id));
  doc.bodies = [
    ...SEED.bodies.map((seed) => seedBeltIds.has(seed.id) ? clone(seed) : clone(storedById.get(seed.id) ?? seed)),
    ...storedBodies.filter((body) => !seedBodies.has(String(body?.id))).map(clone)
  ];
  const ids = new Set();
  doc.bodies = doc.bodies.map((body, index) => {
    const id = String(body?.id || `body-${index}`);
    const fresh = sourceVersion < 4 && !body?.is_custom ? seedBodies.get(id) : null;
    ids.add(id);
    return {
      id, name: String(body?.name || "Unbenannter Körper"),
      kind: kinds.has(body?.kind) ? body.kind : "custom", is_custom: !!body?.is_custom,
      semi_major_axis_au: Math.max(0, number(body?.semi_major_axis_au)),
      eccentricity: Math.max(0, Math.min(.9, number(body?.eccentricity))),
      orbital_period_days: Math.max(0, number(body?.orbital_period_days)),
      epoch_anomaly_deg: number(body?.epoch_anomaly_deg),
      parent_id: body?.parent_id ? String(body.parent_id) : null,
      inclination_deg: number(body?.inclination_deg),
      radius_km: radiusKm(body, seedBodies.get(id)),
      tags: Array.isArray(body?.tags) ? body.tags.map(String).filter(Boolean) : [],
      description: text(fresh?.description ?? body?.description),
      lore: sourceVersion < 4 ? text(fresh?.lore) : text(body?.lore),
      stats: sourceVersion < 4 ? stats(fresh?.stats) : stats(body?.stats),
      sector: SECTORS.some((sector) => sector.id === body?.sector) ? body.sector : doc.active_sector,
      color: text(fresh?.color ?? body?.color) || null,
      color_note: text(fresh?.color_note ?? body?.color_note) || (body?.is_custom ? "orange · vom GM festgelegt" : "neutralgrau · schematische Darstellung"),
      source: text(fresh?.source ?? body?.source),
      source_url: text(fresh?.source_url ?? body?.source_url)
    };
  }).filter((body) => body.id !== body.parent_id && (!body.parent_id || ids.has(body.parent_id)));
  ids.clear();
  doc.bodies.forEach((body) => ids.add(body.id));
  const byId = new Map(doc.bodies.map((body) => [body.id, body]));
  doc.bodies.forEach((body) => {
    const seen = new Set([body.id]);
    let parent = body.parent_id;
    while (parent) {
      if (seen.has(parent)) { body.parent_id = null; break; }
      seen.add(parent);
      parent = byId.get(parent)?.parent_id ?? null;
    }
  });
  const sourceOverrides = doc.body_overrides && typeof doc.body_overrides === "object" ? doc.body_overrides : {};
  doc.body_overrides = {};
  for (const body of doc.bodies) {
    const raw = sourceOverrides[body.id] && typeof sourceOverrides[body.id] === "object" ? sourceOverrides[body.id] : {};
    const legacy = sourceVersion < 4 ? legacyBodies.get(body.id) : null;
    const override = {
      alias: text(raw.alias),
      tags: Array.isArray(raw.tags) ? raw.tags.map(String).map((tag) => tag.trim()).filter(Boolean) : [],
      lore: text(raw.lore, legacy?.lore ?? ""),
      stats: Array.isArray(raw.stats) ? stats(raw.stats) : stats(legacy?.stats),
      gm_notes: text(raw.gm_notes)
    };
    if (override.alias || override.tags.length || override.lore || override.stats.length || override.gm_notes) {
      doc.body_overrides[body.id] = override;
    }
  }
  const routeIds = new Set(doc.bodies.filter((body) => body.kind !== "belt").map((body) => body.id));
  const sourceMissions = doc.missions;
  const sourceRoute = doc.route ?? legacyRouteFromMissions(sourceMissions, doc.active_mission_id) ?? doc.group;
  doc.missions = normalizeMissions(doc.missions, routeIds, doc.group);
  doc.route = normalizeRoute(sourceRoute, routeIds);
  const activeMissionId = doc.active_mission_id == null ? null : String(doc.active_mission_id);
  doc.active_mission_id = doc.missions.some((mission) => mission.id === activeMissionId)
    ? activeMissionId : doc.missions[0]?.id ?? null;
  delete doc.group;
  doc.saved_views = Array.isArray(doc.saved_views) ? doc.saved_views.map((view, index) => {
    const sector = SECTORS.some((item) => item.id === view?.sector) ? view.sector : doc.active_sector;
    const ownsMissionState = Array.isArray(view?.missions) || !!(view?.group && typeof view.group === "object");
    const missions = normalizeMissions(view?.missions, routeIds, view?.group ?? null);
    const requestedMissionId = view?.active_mission_id == null ? null : String(view.active_mission_id);
    const route = normalizeRoute(view?.route ?? legacyRouteFromMissions(view?.missions, requestedMissionId) ?? view?.group ?? doc.route, routeIds);
    return {
      id: String(view?.id || `view-${index}`), name: String(view?.name || "Unbenannte Ansicht"),
      campaign_date: date(view?.campaign_date, doc.campaign_date),
      selected_ids: Array.isArray(view?.selected_ids) ? view.selected_ids.map(String).filter((id) => ids.has(id)) : [],
      sector,
      active_body_id: bodyId(view?.active_body_id, ids),
      camera: normalizeCamera(view?.camera, sector, ids),
      route,
      missions: ownsMissionState ? missions : clone(doc.missions),
      active_mission_id: ownsMissionState
        ? missions.some((mission) => mission.id === requestedMissionId) ? requestedMissionId : missions[0]?.id ?? null
        : doc.active_mission_id
    };
  }) : [];
  const lastViewId = doc.last_view_id == null ? null : String(doc.last_view_id);
  doc.last_view_id = doc.saved_views.some((view) => view.id === lastViewId) ? lastViewId : null;
  return doc;
}

export function load() {
  const foundry = bridge();
  if (foundry?.mode === "player") return normalize(foundry.snapshot);
  if (foundry) return normalize(foundry.storage.load());
  try { return normalize(JSON.parse(localStorage.getItem(KEY) || "null")); }
  catch { return clone(SEED); }
}
export function persist(doc) {
  const foundry = bridge();
  if (foundry) {
    void foundry.storage.save(doc).catch((error) => console.error("Navigationstisch: Foundry-Arbeitsstand konnte nicht gespeichert werden.", error));
    return;
  }
  localStorage.setItem(KEY, JSON.stringify(doc));
}
export async function forget() {
  const foundry = bridge();
  if (foundry) {
    await foundry.storage.clear();
    return;
  }
  localStorage.removeItem(KEY);
}

export const foundryMode = () => bridge()?.mode ?? null;
export const initialPublishedSnapshot = () => bridge()?.snapshot ?? null;
export const onPublishedSnapshot = (listener) => bridge()?.onSnapshot(listener) ?? (() => {});
export async function publishSnapshot(snapshot) {
  const foundry = bridge();
  if (!foundry) throw new Error("Die Spielerfreigabe ist nur innerhalb von Foundry verfügbar.");
  await foundry.publish(snapshot);
}
