/* Der Sichtbarkeitsbaum: aus der flachen Körperliste wird Sektor → Gruppe →
 * Körper → Mond. Reine Funktion ohne Vue, damit sie geprüft werden kann —
 * die Auswahl selbst bleibt außen, hier entsteht nur die Ordnung. */

export const GRUPPEN = [
  { id: "star", name: "Stern", trifft: (k) => !k.is_custom && k.kind === "star" },
  { id: "planet", name: "Planeten", trifft: (k) => !k.is_custom && k.kind === "planet" },
  { id: "dwarf_planet", name: "Zwergplaneten", trifft: (k) => !k.is_custom && k.kind === "dwarf_planet" },
  { id: "belt", name: "Gürtelregionen", trifft: (k) => !k.is_custom && k.kind === "belt" },
  { id: "moon", name: "Monde", trifft: (k) => !k.is_custom && k.kind === "moon" },
  { id: "asteroid", name: "Kleinplaneten", trifft: (k) => !k.is_custom && k.kind === "asteroid" },
  { id: "comet", name: "Kometen", trifft: (k) => !k.is_custom && k.kind === "comet" },
  { id: "custom", name: "Eigene Orte", trifft: (k) => k.is_custom || k.kind === "custom" }
];

export function trifftSuche(koerper, begriff) {
  if (!begriff) return true;
  return String(koerper.name).toLowerCase().includes(begriff)
    || (koerper.tags ?? []).some((tag) => String(tag).toLowerCase().includes(begriff));
}

/* Ein Treffer zieht seine Primärkörper mit in den Baum — sonst hinge der Mond
 * in der Luft. Die Kette wird bis nach oben verfolgt, nicht nur eine Ebene. */
export function sichtbareIds(bodies, begriff) {
  if (!begriff) return null;
  const nachId = new Map(bodies.map((koerper) => [koerper.id, koerper]));
  const ids = new Set();
  for (const koerper of bodies) if (trifftSuche(koerper, begriff)) ids.add(koerper.id);
  for (const id of [...ids]) {
    let eltern = nachId.get(id)?.parent_id;
    while (eltern && !ids.has(eltern)) { ids.add(eltern); eltern = nachId.get(eltern)?.parent_id; }
  }
  return ids;
}

export function buildTree(bodies, sectors, begriff = "") {
  const suchbegriff = String(begriff).trim().toLowerCase();
  const gefiltert = sichtbareIds(bodies, suchbegriff);
  const nachAbstand = (a, b) => (a.semi_major_axis_au ?? 0) - (b.semi_major_axis_au ?? 0);

  const kinder = new Map();
  for (const koerper of bodies) {
    if (!koerper.parent_id) continue;
    if (!kinder.has(koerper.parent_id)) kinder.set(koerper.parent_id, []);
    kinder.get(koerper.parent_id).push(koerper);
  }

  const knoten = (koerper) => {
    const unten = (kinder.get(koerper.id) ?? [])
      .filter((kind) => !gefiltert || gefiltert.has(kind.id))
      .sort(nachAbstand).map(knoten);
    const kindIds = unten.flatMap((kind) => kind.ids);
    return {
      koerper, kinder: unten, pfad: koerper.id, kindIds,
      treffer: trifftSuche(koerper, suchbegriff),
      ids: [koerper.id, ...kindIds]
    };
  };

  return sectors.map((sektor) => {
    const imSektor = bodies.filter((koerper) =>
      koerper.sector === sektor.id && (!gefiltert || gefiltert.has(koerper.id)));
    const vorhanden = new Set(imSektor.map((koerper) => koerper.id));

    const gruppen = GRUPPEN.map((gruppe) => {
      /* Ein Mond erscheint unter seinem Primärkörper, nicht noch einmal als
       * eigener Eintrag — es sei denn, der Primärkörper steht in einem anderen
       * Sektor oder ist weggefiltert. Dann ist der Mond hier die Wurzel. */
      const wurzeln = imSektor
        .filter((koerper) => gruppe.trifft(koerper) && !(koerper.parent_id && vorhanden.has(koerper.parent_id)))
        .sort(nachAbstand).map(knoten);
      return { ...gruppe, pfad: `${sektor.id}/${gruppe.id}`, knoten: wurzeln, ids: wurzeln.flatMap((k) => k.ids) };
    }).filter((gruppe) => gruppe.knoten.length);

    return { ...sektor, pfad: sektor.id, gruppen, ids: gruppen.flatMap((gruppe) => gruppe.ids) };
  }).filter((sektor) => sektor.gruppen.length);
}
