import fs from "node:fs";

export function loadConfig(file) {
  const raw = JSON.parse(fs.readFileSync(file, "utf8"));
  return normalizeConfig(raw);
}

export function normalizeConfig(raw) {
  if (!raw || typeof raw !== "object") throw new Error("profile config must be an object");
  for (const key of ["login", "name", "promptHost", "location", "avatarUrl"]) {
    if (!String(raw[key] ?? "").trim()) throw new Error(`profile config missing ${key}`);
  }
  if (!Array.isArray(raw.info) || raw.info.length === 0) {
    throw new Error("profile config info must be a non-empty array");
  }
  for (const row of raw.info) {
    if (row.blank) continue;
    if (!String(row.label ?? "").trim()) throw new Error("info row is missing a label");
    const hasValue = row.value != null || row.source || row.from;
    if (!hasValue) throw new Error(`info row "${row.label}" needs a value, source, or from`);
  }
  if (!Array.isArray(raw.links) || raw.links.length === 0) {
    throw new Error("profile config links must be a non-empty array");
  }
  for (const link of raw.links) {
    if (!link.id || !/^[a-z0-9-]+$/.test(link.id)) {
      throw new Error(`link id "${link.id ?? ""}" must be lowercase letters, numbers, or hyphens`);
    }
    if (!link.label || !link.href) throw new Error(`link "${link.id}" needs label and href`);
  }
  return raw;
}
