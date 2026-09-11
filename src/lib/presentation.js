const EMPTY_OVERRIDE = Object.freeze({ alias: "", tags: [], lore: "", stats: [], gm_notes: "" });

export function bodyOverride(doc, bodyId) {
  return doc?.body_overrides?.[bodyId] ?? EMPTY_OVERRIDE;
}

export function bodyDisplayName(doc, body) {
  if (!body) return "";
  return bodyOverride(doc, body.id).alias?.trim() || body.name;
}

export function bodyPlayerTags(doc, body) {
  if (!body) return [];
  return [...new Set([...(body.tags ?? []), ...(bodyOverride(doc, body.id).tags ?? [])])];
}

export function bodyPlayerLore(doc, body) {
  if (!body) return "";
  return bodyOverride(doc, body.id).lore || body.lore || "";
}

export function bodyScienceDescription(body) {
  return body?.description?.trim() || "";
}

export function bodyPlayerStats(doc, body) {
  if (!body) return [];
  const authored = bodyOverride(doc, body.id).stats ?? [];
  const labels = new Set(authored.map((item) => item.label.trim().toLocaleLowerCase("de-DE")).filter(Boolean));
  return [...authored, ...(body.stats ?? []).filter((item) => !labels.has(item.label.trim().toLocaleLowerCase("de-DE")))];
}

export function presentBody(doc, body) {
  if (!body) return null;
  return { ...body, name: bodyDisplayName(doc, body), tags: bodyPlayerTags(doc, body) };
}
