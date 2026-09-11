import { addCalendarStep, daysBetween } from "./date.js";

/** Flat, two-body orbital helpers.  Positions are deliberately 2D: stored
 * inclination is flavour only and never enters these calculations. */
const TAU = Math.PI * 2;

export const degrees = (rad) => rad * 180 / Math.PI;
export const radians = (deg) => deg * Math.PI / 180;
export const wrapDegrees = (deg) => ((Number(deg) % 360) + 360) % 360;

export function daysSince(epoch, date) {
  return daysBetween(epoch, date);
}

/** Newton iteration for M = E - e sin(E), in radians. */
export function solveKepler(meanAnomaly, eccentricity) {
  const e = Math.max(0, Math.min(0.9, Number(eccentricity) || 0));
  let E = meanAnomaly + e * Math.sin(meanAnomaly);
  for (let i = 0; i < 10; i += 1) {
    const delta = (E - e * Math.sin(E) - meanAnomaly) / (1 - e * Math.cos(E));
    E -= delta;
    if (Math.abs(delta) < 1e-10) break;
  }
  return E;
}

export function localPosition(body, elapsedDays) {
  const a = Math.max(0, Number(body.semi_major_axis_au) || 0);
  const e = Math.max(0, Math.min(0.9, Number(body.eccentricity) || 0));
  const period = Number(body.orbital_period_days) || 0;
  const M = radians(wrapDegrees((Number(body.epoch_anomaly_deg) || 0)
    + (period > 0 ? elapsedDays / period * 360 : 0)));
  const E = solveKepler(M, e);
  return {
    x: a * (Math.cos(E) - e),
    y: a * Math.sqrt(1 - e ** 2) * Math.sin(E),
    radius: a * (1 - e * Math.cos(E)),
    anomaly: degrees(M)
  };
}

/** Resolve all bodies parent-first. Invalid parents/cycles are reported and
 * drawn at the origin rather than crashing the GM screen. */
export function positionsFor(bodies, epoch, date) {
  const byId = new Map(bodies.map((body) => [body.id, body]));
  const positions = new Map();
  const resolving = new Set();
  const problems = [];
  const elapsed = daysSince(epoch, date);

  function resolve(id) {
    if (positions.has(id)) return positions.get(id);
    const body = byId.get(id);
    if (!body) return { x: 0, y: 0 };
    if (resolving.has(id)) {
      problems.push(`Zyklus bei ${body.name || id}`);
      return { x: 0, y: 0 };
    }
    resolving.add(id);
    const parent = body.parent_id ? resolve(body.parent_id) : { x: 0, y: 0 };
    if (body.parent_id && !byId.has(body.parent_id)) problems.push(`Elternkörper fehlt: ${body.name || id}`);
    const local = body.kind === "star" && !body.parent_id
      ? { x: 0, y: 0, radius: 0, anomaly: 0 }
      : localPosition(body, elapsed);
    const position = { ...local, x: parent.x + local.x, y: parent.y + local.y };
    positions.set(id, position);
    resolving.delete(id);
    return position;
  }

  bodies.forEach((body) => resolve(body.id));
  return { positions, problems };
}

const AU_KM = 149_597_870.7;
const DAY_SECONDS = 86_400;

/** A deliberately simple two-impulse transfer. Both bodies must orbit the same
 * primary and provide a semi-major axis and period. Their real eccentricities
 * are ignored: the result is a readable planning approximation, not a flight
 * dynamics solution. */
export function hohmannTransferPlan(source, destination, epoch, date) {
  if (!source || !destination || (source.parent_id ?? null) !== (destination.parent_id ?? null)) return null;
  const r1 = Number(source.semi_major_axis_au);
  const r2 = Number(destination.semi_major_axis_au);
  const p1 = Number(source.orbital_period_days);
  const p2 = Number(destination.orbital_period_days);
  if (!(r1 > 0) || !(r2 > 0) || !(p1 > 0) || !(p2 > 0) || Math.abs(r1 - r2) < 1e-12) return null;

  const keplerScale = ((p1 ** 2 / r1 ** 3) + (p2 ** 2 / r2 ** 3)) / 2;
  const transferAxis = (r1 + r2) / 2;
  const transferDays = .5 * Math.sqrt(keplerScale * transferAxis ** 3);
  const elapsed = daysSince(epoch, date);
  const rate1 = 360 / p1;
  const rate2 = 360 / p2;
  const sourceAngle = wrapDegrees((Number(source.epoch_anomaly_deg) || 0) + elapsed * rate1);
  const destinationAngle = wrapDegrees((Number(destination.epoch_anomaly_deg) || 0) + elapsed * rate2);
  const requiredPhase = wrapDegrees(180 - rate2 * transferDays);
  const currentPhase = wrapDegrees(destinationAngle - sourceAngle);
  const relativeRate = rate2 - rate1;
  if (Math.abs(relativeRate) < 1e-12) return null;
  const phaseToWindow = relativeRate > 0
    ? wrapDegrees(requiredPhase - currentPhase)
    : wrapDegrees(currentPhase - requiredPhase);
  const windowCycleDays = 360 / Math.abs(relativeRate);
  const waitDays = phaseToWindow / Math.abs(relativeRate);
  const windowProgress = Math.max(0, Math.min(1, 1 - waitDays / windowCycleDays));
  const launchAngle = radians(wrapDegrees(sourceAngle + rate1 * waitDays));
  const mu = 4 * Math.PI ** 2 / keplerScale;
  const circular1 = Math.sqrt(mu / r1);
  const circular2 = Math.sqrt(mu / r2);
  const transfer1 = Math.sqrt(mu * (2 / r1 - 1 / transferAxis));
  const transfer2 = Math.sqrt(mu * (2 / r2 - 1 / transferAxis));
  const deltaVKms = (Math.abs(transfer1 - circular1) + Math.abs(circular2 - transfer2)) * AU_KM / DAY_SECONDS;
  const launchOffsetDays = Math.round(waitDays);
  const flightDays = Math.round(transferDays);

  return {
    sourceId: source.id,
    destinationId: destination.id,
    parentId: source.parent_id ?? null,
    r1, r2,
    axis: transferAxis,
    eccentricity: Math.abs(r2 - r1) / (r1 + r2),
    launchAngle,
    waitDays,
    windowCycleDays,
    windowProgress,
    transferDays,
    launchDate: addCalendarStep(date, launchOffsetDays, "day"),
    arrivalDate: addCalendarStep(date, Math.round(waitDays + transferDays), "day"),
    launchOffsetDays,
    flightDays,
    deltaVKms
  };
}

export function hohmannTransferPoints(plan, parent = { x: 0, y: 0 }, segments = 64) {
  if (!plan) return [];
  const count = Math.max(8, Math.round(segments));
  const alongX = Math.cos(plan.launchAngle);
  const alongY = Math.sin(plan.launchAngle);
  const acrossX = -alongY;
  const acrossY = alongX;
  const center = (plan.r1 - plan.r2) / 2;
  const minor = plan.axis * Math.sqrt(1 - plan.eccentricity ** 2);
  return Array.from({ length: count + 1 }, (_, index) => {
    const angle = Math.PI * index / count;
    const along = center + plan.axis * Math.cos(angle);
    const across = minor * Math.sin(angle);
    return {
      x: parent.x + alongX * along + acrossX * across,
      y: parent.y + alongY * along + acrossY * across
    };
  });
}

/* Die Bahn steht als ganze Ellipse da, und der Körper zieht eine Spur hinter
 * sich her: hell am Marker, nach hinten bis auf die Grundhelligkeit des Rings
 * verlöschend. Ein SVG-Verlauf folgt keiner Kurve, darum zerfällt die Spur in
 * kurze Segmente mit je eigener Deckkraft — als Bogenbefehle, damit sie exakt
 * auf dem Ring liegen statt ihn als Vieleck abzuschneiden. */
const TRAIL_SPAN = Math.PI * 1.9;
const TRAIL_SEGMENTS = 28;
const TRAIL_PEAK = .45;
const TRAIL_FALLOFF = 1.25;
const TRAIL_CUTOFF = .012;

/** Eine Ellipse über dieser Pixelbreite überlebt nicht mehr als SVG-Bogen: die
 * Kurve ist um Größenordnungen größer als der Rahmen und der Rasterisierer
 * gibt sie auf. Jenseits der Grenze bleibt nur die Spur, und die wird auf das
 * Stück gekürzt, das durch das Bild läuft — mehr sieht ohnehin niemand. */
const ARC_LIMIT = 50_000;

/**
 * Ring und Spur einer Bahn.  Die Ellipse hat ihren Brennpunkt am Elternkörper;
 * der fehlende Periapsis-Winkel im Katalog ist Absicht, alle Ellipsen teilen
 * sich die waagerechte Achse.  `parent` und `at` sind Bildschirmpunkte — so
 * behält der Aufrufer die Genauigkeit seiner eigenen Projektion, statt bei
 * tiefem Zoom gegen einen riesigen Ursprung zu rechnen.
 */
export function orbitTrack(body, parent, scale, at, viewport) {
  const empty = { ring: "", trail: [] };
  const a = Math.max(0, Number(body.semi_major_axis_au) || 0) * scale;
  if (!(a > 0) || !Number.isFinite(a) || !at || !viewport) return empty;
  const e = Math.max(0, Math.min(0.9, Number(body.eccentricity) || 0));
  const b = a * Math.sqrt(1 - e ** 2);
  const cx = parent.x - a * e;
  const cy = parent.y;
  const ring = a > ARC_LIMIT ? "" : `M${(cx - a).toFixed(2)} ${cy.toFixed(2)}`
    + `a${a.toFixed(2)} ${b.toFixed(2)} 0 1 0 ${(2 * a).toFixed(2)} 0`
    + `a${a.toFixed(2)} ${b.toFixed(2)} 0 1 0 ${(-2 * a).toFixed(2)} 0`;
  /* Der Bahnwinkel wächst mit der Zeit, auf dem Schirm gegen den Uhrzeigersinn:
   * die Spur läuft also rückwärts vom Körper weg, und der Bogen dreht in
   * SVG-Zählrichtung negativ. Passt sie nicht mehr in den Rahmen, wird nur ihr
   * sichtbares Stück abgetastet — die Deckkraft bleibt am vollen Spannwinkel
   * gemessen, sonst verblasste eine weite Bahn schon innerhalb des Bildes. */
  const head = Math.atan2((cy - at.y) / b, (at.x - cx) / a);
  const span = Math.min(TRAIL_SPAN, Math.hypot(viewport.w, viewport.h) / Math.max(1, Math.min(a, b)));
  const pointAt = (angle) => `${(cx + a * Math.cos(angle)).toFixed(2)} ${(cy - b * Math.sin(angle)).toFixed(2)}`;
  const arc = `A${a.toFixed(2)} ${b.toFixed(2)} 0 0 0 `;
  const trail = [];
  let previous = pointAt(head - span);
  for (let step = 1; step <= TRAIL_SEGMENTS; step += 1) {
    const angle = head - span + span * step / TRAIL_SEGMENTS;
    const current = pointAt(angle);
    const age = (head - angle + span / TRAIL_SEGMENTS / 2) / TRAIL_SPAN;
    const opacity = Number((TRAIL_PEAK * Math.max(0, 1 - age) ** TRAIL_FALLOFF).toFixed(3));
    if (opacity >= TRAIL_CUTOFF) trail.push({ d: `M${previous}${arc}${current}`, o: opacity });
    previous = current;
  }
  return { ring, trail };
}

const decimal = (value, digits) => new Intl.NumberFormat("de-DE", { maximumFractionDigits: digits }).format(value);

export function auDistanceLabel(au) {
  return `${decimal(Number(au) || 0, 8)} AE`;
}

/** Under a hundredth of an AU the unit stops saying anything: moon orbits and
 * grid steps at deep zoom read as kilometres, and below a kilometre as metres. */
export function distanceLabel(au) {
  const value = Number(au) || 0;
  const magnitude = Math.abs(value);
  if (magnitude === 0) return "0 AE";
  if (magnitude >= 0.01) return `${decimal(value, magnitude < 1 ? 3 : 2)} AE`;
  const km = value * AU_KM;
  const kilometres = Math.abs(km);
  if (kilometres < 1) return `${decimal(km * 1_000, 0)} m`;
  if (kilometres < 10) return `${decimal(km, 2)} km`;
  if (kilometres < 1e6) return `${decimal(km, 0)} km`;
  return `${new Intl.NumberFormat("de-DE", { notation: "compact", maximumFractionDigits: 2 }).format(km)} km`;
}

export function lightDelayLabel(au) {
  const seconds = Math.abs(Number(au) || 0) * 499.004783836;
  const format = (value, digits = 1) => new Intl.NumberFormat("de-DE", { maximumFractionDigits: digits }).format(value);
  if (seconds < 120) return `${format(seconds, 0)} s`;
  if (seconds < 7_200) return `${format(seconds / 60)} min`;
  if (seconds < 172_800) return `${format(seconds / 3_600)} h`;
  return `${format(seconds / 86_400)} d`;
}
