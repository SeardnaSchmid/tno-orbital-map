/* Wie ein Körper auf der Karte aussieht. Die Zahlen hier sind Bildsprache und
 * keine Messung — gemessen wird im Katalog, gezeichnet wird hier.
 *
 * Die Karte blickt von oben auf die Ekliptik. Das entscheidet mehr, als es
 * klingt: aus der Aufsicht ist jeder Körper exakt zur Hälfte beleuchtet und
 * die Trennlinie steht senkrecht zur Sonnenrichtung, Wolkenbänder laufen als
 * Breitenkreise um den Pol, und ein Ringsystem ist ein Kreisring statt des
 * schrägen Ovals, das jeder erwartet. */

const AU_KM = 149597870.7;

/* Größe nach Potenzgesetz statt logarithmisch: der Logarithmus drückt Merkur
 * und Erde auf denselben Punkt. So bleibt die Rangfolge über fünf
 * Größenordnungen lesbar, ohne dass Sol den Rahmen sprengt. */
const SIZE_FACTOR = .62, SIZE_EXPONENT = .28, SIZE_MIN = 2.6, SIZE_MAX = 28;

/* Bei tiefem Zoom hört der Marker auf, ein Symbol zu sein, und wird zum
 * Körper: sobald die echte Scheibe größer ausfällt als das Zeichen, gilt sie.
 * Die Deckelung hält die Rechnerei im Rahmen — breiter als das Bild muss
 * keine Scheibe werden. */
const DISC_CAP = 900;

/* Ab hier lohnt sich Aufwand. Darunter ist ein Körper ein Punkt und jedes
 * weitere Element kostet nur Rechenzeit. */
const LOD_PHASE = 3, LOD_RIM = 4.5, LOD_BANDS = 7, LOD_RINGS = 5;

/* Wer keinen gemessenen Radius hat, erbt die Ersatzgröße seiner Klasse: ein
 * unvermessener Kleinplanet soll nicht so groß erscheinen wie Ceres. */
export const FALLBACK_RADIUS_KM = {
  star: 695700, planet: 6000, dwarf_planet: 800, moon: 1000,
  asteroid: 260, comet: 90, custom: 400
};

/* Ein Gasriese ist hier keine Katalogklasse, sondern eine Größe — das trägt
 * auch einen selbst angelegten Riesen. */
const GIANT_RADIUS_KM = 20000;

const DEFAULT_COLOR = "#9fb3b7";
const HEX = /^#[0-9a-f]{6}$/i;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const channels = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const toHex = (values) => `#${values.map((v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, "0")).join("")}`;

export const bodyColor = (body) => HEX.test(body?.color ?? "") ? body.color : DEFAULT_COLOR;
export const lighten = (hex, amount) => toHex(channels(hex).map((v) => v + (255 - v) * amount));
export const darken = (hex, amount) => toHex(channels(hex).map((v) => v * (1 - amount)));

export const bodyRadiusKm = (body) => body?.radius_km > 0
  ? body.radius_km
  : FALLBACK_RADIUS_KM[body?.kind] ?? FALLBACK_RADIUS_KM.custom;

export const isGiant = (body) => bodyRadiusKm(body) >= GIANT_RADIUS_KM;

/** Die Zeichengröße: fest, unabhängig vom Zoom. */
export function symbolRadius(body) {
  return clamp(SIZE_FACTOR * bodyRadiusKm(body) ** SIZE_EXPONENT, SIZE_MIN, SIZE_MAX);
}

/** Die tatsächlich gezeichnete Größe — Zeichen oder echte Scheibe. */
export function drawnRadius(body, scale) {
  const disc = bodyRadiusKm(body) / AU_KM * (scale > 0 ? scale : 0);
  return Math.min(DISC_CAP, Math.max(symbolRadius(body), disc));
}

const arcPath = (x, y, r, centerRad, halfSpanRad) => {
  const at = (t) => `${(x + Math.cos(centerRad + t) * r).toFixed(2)} ${(y + Math.sin(centerRad + t) * r).toFixed(2)}`;
  return `M${at(-halfSpanRad)}A${r.toFixed(2)} ${r.toFixed(2)} 0 0 1 ${at(halfSpanRad)}`;
};

/* Ein Schweif entsteht in Sonnennähe und zeigt von der Sonne weg. Jenseits
 * der Gürtelgrenze bleibt der Kern ein kalter Punkt — sonst zöge Halley auch
 * im Aphel eine Fahne hinter sich her. */
const ACTIVITY_AU = 3.2, ACTIVITY_SPAN = 2.6;

function tailPath(x, y, r, lightRad, distanceAu) {
  const activity = clamp((ACTIVITY_AU - distanceAu) / ACTIVITY_SPAN, 0, 1);
  if (!(activity > 0)) return null;
  const away = lightRad + Math.PI;
  const length = activity * (26 + r * 4);
  const tipX = x + Math.cos(away) * length, tipY = y + Math.sin(away) * length;
  const wide = Math.max(2.5, r * 1.6);
  const nx = -Math.sin(away) * wide, ny = Math.cos(away) * wide;
  const bend = (sign) => `${((x + tipX) / 2 + nx * sign * .5).toFixed(2)} ${((y + tipY) / 2 + ny * sign * .5).toFixed(2)}`;
  return `M${(x + nx).toFixed(2)} ${(y + ny).toFixed(2)}`
    + `Q${bend(1)} ${tipX.toFixed(2)} ${tipY.toFixed(2)}`
    + `Q${bend(-1)} ${(x - nx).toFixed(2)} ${(y - ny).toFixed(2)}Z`;
}

/* Von oben stehen die Wolkenbänder als Breitenkreise um den Pol. */
const bandsFor = (r, color) => [.74, .5, .28].map((fraction, index) => ({
  r: Number((r * fraction).toFixed(2)),
  width: Number(Math.max(.8, r * .13).toFixed(2)),
  color: index % 2 ? lighten(color, .3) : darken(color, .3)
}));

function ringsFor(r, color, system) {
  if (!system) return null;
  const { inner, outer, division, opacity = 1 } = system;
  return {
    mid: Number((r * (inner + outer) / 2).toFixed(2)),
    width: Number((r * (outer - inner)).toFixed(2)),
    division: division ? Number((r * division).toFixed(2)) : 0,
    color: lighten(color, .35),
    opacity
  };
}

const bracketsFor = (x, y, reach, arm) => [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sy]) =>
  `M${(x + sx * reach).toFixed(1)} ${(y + sy * reach - sy * arm).toFixed(1)}`
  + `V${(y + sy * reach).toFixed(1)}H${(x + sx * reach - sx * arm).toFixed(1)}`);

/**
 * Der vollständige Zeichenbefehl für einen Körper an seinem Bildschirmpunkt.
 * `sun` ist der Bildschirmpunkt des Zentralgestirns — auch für Monde, denn
 * beleuchtet werden sie von der Sonne und nicht von ihrem Planeten.
 */
export function markerArt(body, { x, y, sun, scale, distanceAu = 0, ringSystem = null, active = false }) {
  const r = drawnRadius(body, scale);
  const color = bodyColor(body);
  const star = body?.kind === "star";
  const lightRad = Math.atan2((sun?.y ?? 0) - y, (sun?.x ?? 0) - x);
  const ring = Number((r + 7).toFixed(2));
  const lit = !star && r >= LOD_PHASE;
  return {
    r: Number(r.toFixed(2)),
    fill: star ? lighten(color, .55) : color,
    glow: star ? Number((r * 2.6).toFixed(1)) : 0,
    lit,
    lightDeg: Number((lightRad * 180 / Math.PI).toFixed(1)),
    rim: !star && r >= LOD_RIM ? arcPath(x, y, r - .5, lightRad, 1.15) : null,
    rimColor: lighten(color, .75),
    bands: !star && r >= LOD_BANDS && isGiant(body) ? bandsFor(r, color) : [],
    rings: !star && r >= LOD_RINGS ? ringsFor(r, color, ringSystem) : null,
    tail: body?.kind === "comet" ? tailPath(x, y, r, lightRad, distanceAu) : null,
    ring,
    brackets: active ? bracketsFor(x, y, ring + 11, 6) : []
  };
}
