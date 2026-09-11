<script setup>
import { computed, ref, watch } from "vue";
import { activeBody, activeSector, markViewDirty, state, view, selectBody } from "../lib/state.js";
import { BELTS, RING_SYSTEMS } from "../lib/seed.js";
import { auDistanceLabel, distanceLabel, hohmannTransferPlan, hohmannTransferPoints, orbitTrack, positionsFor } from "../lib/orbit.js";
import { markerArt } from "../lib/marker.js";
import { presentBody } from "../lib/presentation.js";

const props = defineProps({ interactive: { type: Boolean, default: true } });

const W = 1840, H = 840, DETAIL_GUTTER = 430;
const MAP_CENTER_X = (W + DETAIL_GUTTER) / 2;
/* Der Zoom muss von der Systemübersicht bis zwischen die Monde reichen. Die
 * Obergrenze ist darum zweifach: ein Faktor auf den eingerahmten Ausschnitt und
 * eine absolute Auflösung, damit ein schon enger Rahmen nicht ins Sinnlose
 * skaliert. MAX_SCALE liegt bei rund 300 m je Pixel. */
const MIN_ZOOM = .05, MAX_ZOOM = 1e6, MAX_SCALE = 5e8;
const CLUSTER_RADIUS = 22;
const CLUSTER_RANK = { star: 0, planet: 1, dwarf_planet: 2, custom: 3, comet: 4, asteroid: 5, moon: 6 };
const BELT_BY_ID = new Map(BELTS.map((belt) => [belt.id, belt]));
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const zoom = computed({ get: () => state.camera.zoom ?? 1, set: (value) => { state.camera.zoom = value; markViewDirty(); } });
const panX = computed({ get: () => state.camera.panX ?? 0, set: (value) => { state.camera.panX = value; markViewDirty(); } });
const panY = computed({ get: () => state.camera.panY ?? 0, set: (value) => { state.camera.panY = value; markViewDirty(); } });
const isPanning = ref(false);
let lastPointer = null, pressOrigin = null, captured = false;
const solved = computed(() => positionsFor(view.value?.bodies ?? [], view.value?.reference_epoch, view.value?.campaign_date));
const groupIdsInSector = computed(() => {
  const ids = [view.value?.group?.location_body_id, view.value?.group?.destination_body_id].filter(Boolean);
  const byId = new Map((view.value?.bodies ?? []).map((body) => [body.id, body]));
  return new Set(ids.filter((id) => byId.get(id)?.sector === activeSector.value.id));
});

const visibleIds = computed(() => {
  const ids = new Set(state.selectedIds);
  groupIdsInSector.value.forEach((id) => ids.add(id));
  const byId = new Map((view.value?.bodies ?? []).map((body) => [body.id, body]));
  /* Ein Mond ohne seinen Primärkörper hinge in der Luft, darum kommen fehlende
   * Eltern mit. Ein abgewählter Stern nicht: er ist der Vorfahr von allem, und
   * wer ihn abwählt, meint genau das. */
  [...ids].forEach((id) => {
    let parent = byId.get(id)?.parent_id;
    while (parent && !ids.has(parent) && byId.get(parent)?.kind !== "star") {
      ids.add(parent);
      parent = byId.get(parent)?.parent_id;
    }
  });
  return ids;
});
const bodyById = computed(() => new Map((view.value?.bodies ?? []).map((body) => [body.id, body])));
const routeSource = computed(() => bodyById.value.get(view.value?.group?.location_body_id) ?? null);
const routeDestination = computed(() => bodyById.value.get(view.value?.group?.destination_body_id) ?? null);
const transferPlan = computed(() => view.value?.group?.show_transfer ? hohmannTransferPlan(
  routeSource.value,
  routeDestination.value,
  view.value?.reference_epoch,
  view.value?.campaign_date
) : null);
const transferWorld = computed(() => {
  const plan = transferPlan.value;
  if (!plan) return [];
  const parent = solved.value.positions.get(plan.parentId) ?? { x: 0, y: 0 };
  return hohmannTransferPoints(plan, parent);
});
/** Fit selected markers, not their full trajectories. The sector focus stays
 * in frame as local context, while remote ancestors do not pull moon systems
 * back out to heliocentric scale. */
const autoFrame = computed(() => {
  const positions = solved.value.positions;
  const allBodies = view.value?.bodies ?? [];
  const byId = new Map(allBodies.map((body) => [body.id, body]));
  const groupIds = groupIdsInSector.value;
  const selected = allBodies.filter((body) => (state.selectedIds.has(body.id) || groupIds.has(body.id))
    && (body.id !== "sun" || state.camera.focus === "sun"));
  const bounds = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };
  const add = (x, y) => {
    bounds.minX = Math.min(bounds.minX, x); bounds.maxX = Math.max(bounds.maxX, x);
    bounds.minY = Math.min(bounds.minY, y); bounds.maxY = Math.max(bounds.maxY, y);
  };
  selected.forEach((body) => {
    if (body.kind === "belt") {
      const belt = BELT_BY_ID.get(body.id);
      const center = positions.get(body.parent_id) ?? { x: 0, y: 0 };
      if (belt) {
        add(center.x - belt.outer, center.y - belt.outer);
        add(center.x + belt.outer, center.y + belt.outer);
      }
      return;
    }
    const position = positions.get(body.id);
    if (position) add(position.x, position.y);
  });
  transferWorld.value.forEach((position) => add(position.x, position.y));
  /* Ein einzelner Körper spannt keinen Rahmen auf; sein Primärkörper gibt ihm
   * einen. Ein abgewählter Stern tut das nicht — er risse den Ausschnitt auf
   * heliozentrisches Maß auf, und dann bliebe vom Mondsystem ein Punkt. */
  if (selected.length === 1 && selected[0].id !== state.camera.focus) {
    const parent = byId.get(selected[0].parent_id ?? state.camera.focus);
    const anchored = parent && (parent.kind !== "star" || state.selectedIds.has(parent.id));
    const position = anchored ? positions.get(parent.id) : null;
    if (position) add(position.x, position.y);
  }
  if (!Number.isFinite(bounds.minX)) {
    const focusPoint = positions.get(state.camera.focus) ?? { x: 0, y: 0 };
    return { focus: focusPoint, scale: Math.min(W, H) / state.camera.auPerScreen };
  }
  const spanX = Math.max(1e-9, bounds.maxX - bounds.minX);
  const spanY = Math.max(1e-9, bounds.maxY - bounds.minY);
  if (Math.max(spanX, spanY) < 1e-8) {
    return { focus: { x: bounds.minX, y: bounds.minY }, scale: Math.min(W, H) / state.camera.auPerScreen };
  }
  const padding = 150;
  return {
    focus: { x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2 },
    scale: Math.min((W - DETAIL_GUTTER - padding * 2) / spanX, (H - padding * 2) / spanY)
  };
});
const manualFrame = ref(null);
const frame = computed(() => manualFrame.value ?? autoFrame.value);
watch(() => state.camera, () => { manualFrame.value = null; });
const focus = computed(() => frame.value.focus);
const scale = computed(() => frame.value.scale * zoom.value);
const offsetX = computed(() => MAP_CENTER_X - focus.value.x * scale.value + panX.value);
const offsetY = computed(() => H / 2 + focus.value.y * scale.value + panY.value);
const gridStep = computed(() => {
  const raw = 120 / scale.value;
  const power = 10 ** Math.floor(Math.log10(raw));
  const normalized = raw / power;
  return (normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10) * power;
});
const gridSize = computed(() => gridStep.value * scale.value);
const majorGridSize = computed(() => gridSize.value * 5);
const gridOriginX = computed(() => ((offsetX.value % gridSize.value) + gridSize.value) % gridSize.value);
const gridOriginY = computed(() => ((offsetY.value % gridSize.value) + gridSize.value) % gridSize.value);
const majorGridOriginX = computed(() => ((offsetX.value % majorGridSize.value) + majorGridSize.value) % majorGridSize.value);
const majorGridOriginY = computed(() => ((offsetY.value % majorGridSize.value) + majorGridSize.value) % majorGridSize.value);
/* Gegen den Ursprung gerechnet löschen sich bei tiefem Zoom die führenden
 * Stellen aus. Alles wird darum relativ zum Rahmenmittelpunkt projiziert. */
const point = (position) => ({
  x: MAP_CENTER_X + panX.value + (position.x - focus.value.x) * scale.value,
  y: H / 2 + panY.value - (position.y - focus.value.y) * scale.value
});
const transferRoute = computed(() => {
  if (!transferPlan.value || !transferWorld.value.length) return null;
  const points = transferWorld.value.map(point);
  const labelPoint = points[Math.floor(points.length / 2)];
  const plan = transferPlan.value;
  return {
    ...plan,
    d: points.map((entry, index) => `${index ? "L" : "M"}${entry.x.toFixed(2)} ${entry.y.toFixed(2)}`).join(" "),
    launch: points[0],
    arrival: points.at(-1),
    labelPoint,
    waitLabel: plan.launchOffsetDays > 0 ? `NOCH ${plan.launchOffsetDays} T` : "START JETZT",
    deltaVLabel: new Intl.NumberFormat("de-DE", { maximumFractionDigits: 2 }).format(plan.deltaVKms),
    progressWidth: 280 * plan.windowProgress,
    progressX: -140 + 280 * plan.windowProgress,
    progressPercent: Math.round(plan.windowProgress * 100),
    windowState: plan.launchOffsetDays <= 0 ? "ready" : plan.launchOffsetDays <= 30 ? "imminent" : "pending"
  };
});
/* Das Licht kommt vom Zentralgestirn, auch für Monde. Steht die Sonne
 * außerhalb des Rahmens, zeigen die Terminatoren trotzdem auf sie — und sagen
 * damit, wo sie steht. */
const sunPoint = computed(() => point(solved.value.positions.get("sun") ?? { x: 0, y: 0 }));
const bodies = computed(() => (view.value?.bodies ?? []).filter((body) => body.kind !== "belt" && visibleIds.value.has(body.id)).map((body) => {
  const position = solved.value.positions.get(body.id) ?? { x: 0, y: 0, radius: 0 };
  const p = point(position);
  const active = body.id === activeBody.value?.id;
  const art = markerArt(body, {
    ...p, sun: sunPoint.value, scale: scale.value, distanceAu: position.radius,
    ringSystem: RING_SYSTEMS[body.id] ?? null, active
  });
  return { ...presentBody(view.value, body), position, ...p, active, art };
}));
const groupLocation = computed(() => bodies.value.find((body) => body.id === view.value?.group?.location_body_id) ?? null);
const groupDestination = computed(() => bodies.value.find((body) => body.id === view.value?.group?.destination_body_id) ?? null);
const groupRoute = computed(() => {
  if (!groupLocation.value || !groupDestination.value) return null;
  const from = groupLocation.value;
  const to = groupDestination.value;
  let angle = Math.atan2(to.y - from.y, to.x - from.x) * 180 / Math.PI;
  if (angle > 90 || angle < -90) angle += 180;
  const label = auDistanceLabel(Math.hypot(to.position.x - from.position.x, to.position.y - from.position.y));
  return {
    x1: from.x, y1: from.y, x2: to.x, y2: to.y,
    x: (from.x + to.x) / 2, y: (from.y + to.y) / 2,
    angle, label, labelWidth: Math.max(70, label.length * 7 + 22)
  };
});
/* Moon systems can be orders of magnitude tighter than their planet view: auf
 * Übersichtszoom fallen die Marker eines Systems auf denselben Punkt und mit
 * ihnen ihre Beschriftungen. Die Marker bleiben exakt stehen — nur die Texte
 * fasst ein Ring zu einer Sammelbeschriftung zusammen, die beim Hineinzoomen
 * wieder auseinanderfällt. Der Rang bestimmt, wer die Gruppe benennt. */
const clusterRank = (body) => (body.active ? -1 : CLUSTER_RANK[body.kind] ?? 7);
const cellKey = (x, y) => `${Math.floor(x / CLUSTER_RADIUS)}:${Math.floor(y / CLUSTER_RADIUS)}`;
function groupWithinReach(cells, x, y) {
  const gx = Math.floor(x / CLUSTER_RADIUS), gy = Math.floor(y / CLUSTER_RADIUS);
  for (let dx = -1; dx <= 1; dx += 1) {
    for (let dy = -1; dy <= 1; dy += 1) {
      for (const group of cells.get(`${gx + dx}:${gy + dy}`) ?? []) {
        if (Math.hypot(group.x - x, group.y - y) <= CLUSTER_RADIUS) return group;
      }
    }
  }
  return null;
}
/* Fallen Marker aufeinander, liegt der wichtigere oben und lässt sich als
 * erster anklicken — sonst verdeckt Deimos den Mars. */
const markers = computed(() => [...bodies.value].sort((a, b) => clusterRank(b) - clusterRank(a)));
const clusters = computed(() => {
  const cells = new Map();
  const groups = [];
  [...bodies.value]
    .sort((a, b) => clusterRank(a) - clusterRank(b) || a.name.localeCompare(b.name, "de"))
    .forEach((body) => {
      const group = groupWithinReach(cells, body.x, body.y);
      if (group) {
        group.members.push(body);
        group.active = group.active || body.active;
        return;
      }
      const seed = { primary: body, x: body.x, y: body.y, members: [body], active: body.active };
      groups.push(seed);
      const key = cellKey(body.x, body.y);
      cells.set(key, [...(cells.get(key) ?? []), seed]);
    });
  return groups.map((group) => {
    const spread = Math.max(0, ...group.members.map((member) => Math.hypot(member.x - group.x, member.y - group.y)));
    const reach = Math.max(...group.members.map((member) => member.art.r));
    return { ...group, spread, reach, radius: group.members.length === 1 ? 0 : Math.max(13, spread, reach) + 9 };
  });
});
/* Keep the marker exact and only stagger the label until it no longer hides a
 * previously placed one. */
const labels = computed(() => {
  const placed = [];
  const shifts = [0, -28, 28, -56, 56, -84, 84, -112, 112];
  return clusters.value.map((cluster) => {
    const { primary } = cluster;
    const extra = cluster.members.length - 1;
    const name = extra ? `${primary.name} +${extra}` : primary.name;
    const reading = primary.kind === "star" ? "Referenz" : distanceLabel(primary.position.radius);
    const sub = extra ? `${cluster.members.length} Objekte · ${reading}` : reading;
    const side = cluster.x > W * .65 ? "end" : "start";
    const gap = 17 + Math.max(cluster.radius, primary.art.r + 7);
    const lx = cluster.x + (side === "start" ? gap : -gap);
    const width = Math.max(48, name.length * 7 + 12);
    let ly = cluster.y;
    for (const shift of shifts) {
      const candidate = { left: side === "start" ? lx : lx - width, right: side === "start" ? lx + width : lx, top: cluster.y + shift - 15, bottom: cluster.y + shift + 18 };
      if (!placed.some((box) => candidate.left < box.right && candidate.right > box.left && candidate.top < box.bottom && candidate.bottom > box.top)) {
        ly = cluster.y + shift; placed.push(candidate); break;
      }
    }
    return {
      id: primary.id, x: cluster.x, y: cluster.y, radius: cluster.radius, spread: cluster.spread, count: cluster.members.length,
      name, sub, lx, ly, anchor: side, active: cluster.active,
      hit: { x: side === "start" ? lx - 4 : lx - width - 4, y: ly - 15, width: width + 8, height: 33 },
      title: cluster.members.slice(0, 12).map((member) => member.name).join(" · ")
        + (cluster.members.length > 12 ? ` … +${cluster.members.length - 12}` : "")
    };
  });
});
// The sector focus is the local datum; its remote heliocentric trajectory is
// intentionally omitted from moon-system views.
const orbits = computed(() => bodies.value.filter((body) => state.selectedIds.has(body.id) && body.id !== state.camera.focus && body.kind !== "star" && body.semi_major_axis_au > 0)
  .map((body) => ({ id: body.id, ...orbitTrack(body, point(solved.value.positions.get(body.parent_id) ?? { x: 0, y: 0 }), scale.value, body, { w: W, h: H }) }))
  .filter((orbit) => orbit.ring || orbit.trail.length));
const beltParticles = (belt, center, count) => Array.from({ length: count }, (_, index) => {
  const angle = index * GOLDEN_ANGLE + (belt.id === "kuiper-belt" ? .7 : 0);
  const noise = ((index * 47) % 101) / 100;
  const radius = belt.inner + (belt.outer - belt.inner) * (.08 + noise * .84);
  return {
    x: center.x + Math.cos(angle) * radius * scale.value,
    y: center.y + Math.sin(angle) * radius * scale.value,
    r: .65 + (index % 5) * .16,
    opacity: .2 + (index % 7) * .055
  };
});
const belts = computed(() => BELTS.filter((belt) => state.selectedIds.has(belt.id)).map((belt) => {
  const center = point(solved.value.positions.get(belt.parent_id) ?? { x: 0, y: 0 });
  const inner = belt.inner * scale.value;
  const outer = belt.outer * scale.value;
  const mid = (inner + outer) / 2;
  return {
    ...belt, ...center, inner, outer, mid, width: outer - inner,
    active: activeBody.value?.id === belt.id,
    range: `${String(belt.inner).replace(".", ",")}–${String(belt.outer).replace(".", ",")} AE`,
    labelX: center.x + mid * .72,
    labelY: center.y - mid * .7,
    particles: beltParticles(belt, center, belt.id === "kuiper-belt" ? 190 : 150)
  };
}).filter((belt) => belt.outer < 3_000));
const markerClass = (body) => `marker marker--${body.kind}`;
const compact = (value, digits) => new Intl.NumberFormat("de-DE", { notation: value >= 1e5 ? "compact" : "standard", maximumFractionDigits: digits }).format(value);
const zoomLabel = computed(() => `${compact(zoom.value, zoom.value < 10 ? 1 : 0)}\u00d7`);
const scaleLabel = computed(() => compact(scale.value, scale.value < 100 ? 1 : 0));

function resetViewport() {
  if (!props.interactive) return;
  manualFrame.value = null;
  zoom.value = 1;
  panX.value = 0;
  panY.value = 0;
}

function svgPoint(event) {
  const box = event.currentTarget.getBoundingClientRect();
  return { x: (event.clientX - box.left) / box.width * W, y: (event.clientY - box.top) / box.height * H };
}

const zoomCeiling = computed(() => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, MAX_SCALE / frame.value.scale)));
function setZoom(nextZoom, anchor = { x: MAP_CENTER_X, y: H / 2 }) {
  if (!props.interactive) return;
  const next = Math.max(MIN_ZOOM, Math.min(zoomCeiling.value, nextZoom));
  if (!(next > 0) || next === zoom.value) return;
  /* Der Ausschnitt kürzt sich heraus: der Punkt unter dem Anker bleibt stehen,
   * wenn der Abstand zur Mitte mit dem Zoomverhältnis wächst. */
  const ratio = next / zoom.value;
  panX.value = anchor.x - MAP_CENTER_X - (anchor.x - MAP_CENTER_X - panX.value) * ratio;
  panY.value = anchor.y - H / 2 - (anchor.y - H / 2 - panY.value) * ratio;
  zoom.value = next;
}

/* Die Tasten zoomen auf den aktiven Körper, solange er im Bild steht: sonst
 * schiebt schon ein halber Pixel Abstand zur Mitte ihn bei tiefem Zoom aus dem
 * Rahmen. Das Rad behält seinen eigenen Ankerpunkt unter dem Zeiger. */
function zoomBy(factor) {
  const target = bodies.value.find((body) => body.active);
  const onScreen = target && target.x >= 0 && target.x <= W && target.y >= 0 && target.y <= H;
  setZoom(zoom.value * factor, onScreen ? { x: target.x, y: target.y } : undefined);
}
function onWheel(event) {
  const speed = (event.deltaMode === 1 ? .06 : .0028) * (event.shiftKey ? 3 : 1);
  setZoom(zoom.value * Math.exp(-event.deltaY * speed), svgPoint(event));
}
/* Eine Sammelbeschriftung ist selbst der Weg hinein: der Klick nimmt ihren
 * Primärkörper auf und zoomt so weit, dass die Gruppe aufgeht — bei einem
 * Mondsystem, das auf einen Punkt fällt, in mehreren Schritten statt in einem
 * einzigen Sprung, der die Karte unter dem Finger wegzieht. */
function activateLabel(label) {
  if (!props.interactive) return;
  selectBody(label.id);
  if (label.count < 2) return;
  const needed = (CLUSTER_RADIUS + 8) / Math.max(.4, label.spread);
  setZoom(zoom.value * Math.min(25, Math.max(2.5, needed)), { x: label.x, y: label.y });
}
function startPan(event) {
  if (!props.interactive || event.button !== 0) return;
  event.preventDefault();
  globalThis.getSelection?.().removeAllRanges();
  isPanning.value = true;
  captured = false;
  lastPointer = { x: event.clientX, y: event.clientY };
  pressOrigin = lastPointer;
}
/* Der Zeiger wird erst nach ein paar Pixeln eingefangen. Fängt das SVG ihn
 * schon beim Druck ein, hängen sich die Mausereignisse an das SVG um und der
 * Klick erreicht weder Marker noch Beschriftung. */
function movePointer(event) {
  if (!isPanning.value || !lastPointer) return;
  if (!captured) {
    if (Math.hypot(event.clientX - pressOrigin.x, event.clientY - pressOrigin.y) <= 3) return;
    if (!manualFrame.value) manualFrame.value = { focus: { ...frame.value.focus }, scale: frame.value.scale };
    event.currentTarget.setPointerCapture(event.pointerId);
    captured = true;
  }
  const box = event.currentTarget.getBoundingClientRect();
  panX.value += (event.clientX - lastPointer.x) / box.width * W;
  panY.value += (event.clientY - lastPointer.y) / box.height * H;
  lastPointer = { x: event.clientX, y: event.clientY };
}
function stopPan(event) {
  if (!isPanning.value) return;
  isPanning.value = false;
  lastPointer = null;
  pressOrigin = null;
  captured = false;
  if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
}

</script>

<template>
  <section :class="['map-frame', { 'is-panning': isPanning, 'is-readonly': !interactive }]">
    <div class="map-meta map-meta--left"><span>ORB / SOLUTION</span><strong>{{ activeSector.name }}</strong></div>
    <div class="map-meta map-meta--right"><span>GRID {{ distanceLabel(gridStep) }}</span><strong>{{ scaleLabel }} PX/AE</strong></div>
    <div v-if="interactive" class="map-zoom"><button title="Herauszoomen (Rad, mit Umschalt schneller)" aria-label="Herauszoomen" :disabled="zoom <= MIN_ZOOM" @click="zoomBy(.5)">−</button><output :title="`Zoomfaktor auf den eingerahmten Ausschnitt`">{{ zoomLabel }}</output><button title="Hineinzoomen (Rad, mit Umschalt schneller)" aria-label="Hineinzoomen" :disabled="zoom >= zoomCeiling" @click="zoomBy(2)">+</button><button class="map-zoom__auto" :class="{ active: manualFrame }" :title="manualFrame ? 'Manuelle Ansicht lösen und automatisch einpassen' : 'Ansicht automatisch einpassen'" @click="resetViewport">Auto</button></div>
    <aside class="mission-objective" aria-label="Aktuelle Aufgabe">
      <span>AKTUELLE AUFGABE</span>
      <p>{{ view.group.objective || 'Noch keine Aufgabe eingetragen.' }}</p>
    </aside>
    <svg :viewBox="`0 0 ${W} ${H}`" role="img" aria-label="2D-Karte des Sonnensystems" draggable="false" @mousedown.prevent @dragstart.prevent @selectstart.prevent @wheel.prevent="onWheel" @pointerdown="startPan" @pointermove="movePointer" @pointerup="stopPan" @pointercancel="stopPan" @lostpointercapture="stopPan">
      <defs>
        <pattern id="minorGrid" :x="gridOriginX" :y="gridOriginY" :width="gridSize" :height="gridSize" patternUnits="userSpaceOnUse"><path class="minor-grid-line" :d="`M${gridSize} 0H0V${gridSize}`" /></pattern>
        <pattern id="majorGrid" :x="majorGridOriginX" :y="majorGridOriginY" :width="majorGridSize" :height="majorGridSize" patternUnits="userSpaceOnUse"><path class="major-grid-line" :d="`M${majorGridSize} 0H0V${majorGridSize}`" /></pattern>
        <radialGradient id="sunGlow"><stop offset="0" stop-color="#fff4c8" stop-opacity=".96"/><stop offset=".16" stop-color="#e4aa4f" stop-opacity=".4"/><stop offset="1" stop-color="#e4aa4f" stop-opacity="0"/></radialGradient>
        <!-- Der Tag-Nacht-Verlauf liegt quer über der Scheibe und wird auf die Sonne gedreht. -->
        <linearGradient id="phase" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stop-color="#fff" stop-opacity=".34"/><stop offset=".3" stop-color="#fff" stop-opacity=".06"/>
          <stop offset=".5" stop-color="#000" stop-opacity="0"/><stop offset=".72" stop-color="#050c10" stop-opacity=".42"/>
          <stop offset="1" stop-color="#050c10" stop-opacity=".84"/>
        </linearGradient>
        <linearGradient id="cometTail" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#bfe6ea" stop-opacity=".5"/><stop offset="1" stop-color="#bfe6ea" stop-opacity="0"/></linearGradient>
      </defs>
      <rect width="100%" height="100%" class="map-bg" />
      <rect width="100%" height="100%" fill="url(#minorGrid)" class="map-grid map-grid--minor" />
      <rect width="100%" height="100%" fill="url(#majorGrid)" class="map-grid map-grid--major" />
      <g class="datum" aria-hidden="true">
        <line v-if="offsetX >= 0 && offsetX <= W" :x1="offsetX" y1="0" :x2="offsetX" :y2="H" />
        <line v-if="offsetY >= 0 && offsetY <= H" x1="0" :y1="offsetY" :x2="W" :y2="offsetY" />
      </g>
      <g v-for="belt in belts" :key="belt.id" :class="['belt', { 'is-active': belt.active }]" :style="{ '--belt-color': belt.color }"
         :tabindex="interactive ? 0 : -1" role="button" :aria-disabled="!interactive" :aria-label="`${belt.name}, ${belt.range}`"
         @click="interactive && selectBody(belt.id)" @keydown.enter="interactive && selectBody(belt.id)">
        <title>{{ belt.name }} · {{ belt.range }}</title>
        <circle class="belt-zone" :cx="belt.x" :cy="belt.y" :r="belt.mid" :stroke-width="belt.width" />
        <circle v-for="(particle, index) in belt.particles" :key="index" class="belt-particle" :cx="particle.x" :cy="particle.y" :r="particle.r" :opacity="particle.opacity" />
        <circle class="belt-edge" :cx="belt.x" :cy="belt.y" :r="belt.inner" />
        <circle class="belt-edge" :cx="belt.x" :cy="belt.y" :r="belt.outer" />
        <text class="belt-label" :x="belt.labelX" :y="belt.labelY">{{ belt.name.toUpperCase() }}</text>
        <text class="belt-range" :x="belt.labelX" :y="belt.labelY + 14">{{ belt.range }}</text>
      </g>
      <g v-for="orbit in orbits" :key="orbit.id" class="orbit">
        <path v-if="orbit.ring" class="orbit-ring" :d="orbit.ring" />
        <path v-for="(segment, index) in orbit.trail" :key="index" class="orbit-trail" :d="segment.d" :stroke-opacity="segment.o" />
      </g>
      <g v-if="transferRoute" class="transfer-route" aria-hidden="true">
        <path :d="transferRoute.d" />
        <circle class="transfer-route__launch" :cx="transferRoute.launch.x" :cy="transferRoute.launch.y" r="6" />
        <circle class="transfer-route__arrival" :cx="transferRoute.arrival.x" :cy="transferRoute.arrival.y" r="7" />
        <g :class="['transfer-route__label', `is-${transferRoute.windowState}`]" :transform="`translate(${transferRoute.labelPoint.x} ${transferRoute.labelPoint.y})`">
          <rect x="-164" y="-54" width="328" height="108" rx="3" />
          <text class="transfer-route__title" y="-33" text-anchor="middle">HOHMANN · {{ transferRoute.flightDays }} T · ΔV {{ transferRoute.deltaVLabel }} KM/S</text>
          <text class="transfer-route__meta" y="-13" text-anchor="middle">ANKUNFT {{ transferRoute.arrivalDate }}</text>
          <text class="transfer-route__axis-label" x="-140" y="9">HEUTE</text>
          <text class="transfer-route__axis-label" x="140" y="9" text-anchor="end">STARTFENSTER</text>
          <rect class="transfer-route__window" x="-140" y="18" width="280" height="8" rx="4" />
          <rect class="transfer-route__window-progress" x="-140" y="18" :width="transferRoute.progressWidth" height="8" rx="4" />
          <line v-for="tick in [-70, 0, 70]" :key="tick" class="transfer-route__window-tick" :x1="tick" y1="17" :x2="tick" y2="27" />
          <line class="transfer-route__window-marker" :x1="transferRoute.progressX" y1="14" :x2="transferRoute.progressX" y2="31" />
          <circle class="transfer-route__window-dot" :cx="transferRoute.progressX" cy="22" r="4" />
          <text class="transfer-route__countdown" y="44" text-anchor="middle">{{ transferRoute.waitLabel }} · {{ transferRoute.progressPercent }} % ZYKLUS</text>
        </g>
      </g>
      <g v-if="groupRoute" class="group-route" aria-hidden="true">
        <line :x1="groupRoute.x1" :y1="groupRoute.y1" :x2="groupRoute.x2" :y2="groupRoute.y2" />
        <g :transform="`translate(${groupRoute.x} ${groupRoute.y}) rotate(${groupRoute.angle})`">
          <rect :x="-groupRoute.labelWidth / 2" y="-11" :width="groupRoute.labelWidth" height="22" rx="3" />
          <text y="4" text-anchor="middle">{{ groupRoute.label }}</text>
        </g>
      </g>
      <g v-for="body in markers" :key="body.id" :class="[markerClass(body), { 'is-active': body.active }]"
         :tabindex="interactive ? 0 : -1" role="button" :aria-disabled="!interactive" :aria-label="body.name" @click="interactive && selectBody(body.id)" @keydown.enter="interactive && selectBody(body.id)">
        <circle v-if="body.art.glow" class="star-glow" :cx="body.x" :cy="body.y" :r="body.art.glow" fill="url(#sunGlow)" />
        <path v-if="body.art.tail" class="comet-tail" :d="body.art.tail" />
        <template v-if="body.art.rings">
          <circle class="marker-rings" :cx="body.x" :cy="body.y" :r="body.art.rings.mid" :stroke="body.art.rings.color" :stroke-width="body.art.rings.width" :stroke-opacity="body.art.rings.opacity" />
          <circle v-if="body.art.rings.division" class="ring-division" :cx="body.x" :cy="body.y" :r="body.art.rings.division" :stroke-opacity="body.art.rings.opacity" />
        </template>
        <circle class="marker-dot" :cx="body.x" :cy="body.y" :r="body.art.r" :fill="body.art.fill" />
        <circle v-for="(band, index) in body.art.bands" :key="`band-${index}`" class="marker-band" :cx="body.x" :cy="body.y" :r="band.r" :stroke="band.color" :stroke-width="band.width" />
        <circle v-if="body.art.lit" class="marker-phase" :cx="body.x" :cy="body.y" :r="body.art.r" fill="url(#phase)" :transform="`rotate(${body.art.lightDeg} ${body.x} ${body.y})`" />
        <path v-if="body.art.rim" class="marker-rim" :d="body.art.rim" :stroke="body.art.rimColor" />
        <circle class="marker-ring" :cx="body.x" :cy="body.y" :r="body.art.ring" />
        <path v-for="(bracket, index) in body.art.brackets" :key="`bracket-${index}`" class="marker-bracket" :d="bracket" />
      </g>
      <g v-for="label in labels" :key="`label-${label.id}`" :class="['label', { 'is-active': label.active, 'label--cluster': label.count > 1 }]"
         :tabindex="interactive ? 0 : -1" role="button" :aria-disabled="!interactive" :aria-label="label.count > 1 ? `${label.count} Objekte: ${label.title}` : label.name"
         @click="activateLabel(label)" @keydown.enter="activateLabel(label)">
        <title v-if="label.count > 1">{{ label.title }}</title>
        <circle v-if="label.radius" class="cluster-ring" :cx="label.x" :cy="label.y" :r="label.radius" />
        <rect class="label-hit" :x="label.hit.x" :y="label.hit.y" :width="label.hit.width" :height="label.hit.height" />
        <text class="body-name" :x="label.lx" :y="label.ly - 3" :text-anchor="label.anchor">{{ label.name.toUpperCase() }}</text>
        <text class="body-distance" :x="label.lx" :y="label.ly + 13" :text-anchor="label.anchor">{{ label.sub }}</text>
      </g>
      <g v-if="groupLocation" class="group-position" role="button" :tabindex="interactive ? 0 : -1" :aria-disabled="!interactive" :aria-label="`${view.group.name} bei ${groupLocation.name}`" @click="interactive && selectBody(groupLocation.id)" @keydown.enter="interactive && selectBody(groupLocation.id)">
        <circle class="group-position__pulse" :cx="groupLocation.x" :cy="groupLocation.y" r="19" />
        <path :d="`M${groupLocation.x - 15} ${groupLocation.y}h30M${groupLocation.x} ${groupLocation.y - 15}v30`" />
        <text :x="groupLocation.x + 24" :y="groupLocation.y + 34">{{ view.group.name.toUpperCase() }}</text>
        <text class="group-position__status" :x="groupLocation.x + 24" :y="groupLocation.y + 48">POSITION · {{ groupLocation.name.toUpperCase() }}</text>
      </g>
    </svg>
    <div class="scale-readout"><span :style="{ width: `${gridSize}px` }"></span><b>{{ distanceLabel(gridStep) }}</b></div>
    <div class="map-readout" style="left:450px"><span>UTC {{ view?.campaign_date }}</span><span>SEL {{ state.selectedIds.size.toString().padStart(2, '0') }}</span><span v-if="groupLocation">POS {{ groupLocation.name }}</span><span v-if="manualFrame" class="map-readout__locked">ANSICHT FIX</span></div>
    <div v-if="solved.problems.length" class="map-warning">{{ solved.problems.join(" · ") }}</div>
    <i class="corner corner--tl"></i><i class="corner corner--tr"></i><i class="corner corner--bl"></i><i class="corner corner--br"></i>
  </section>
</template>
