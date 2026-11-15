const PLACEHOLDER_HANDLES = new Set([
  "",
  "your_handle",
  "your_x_handle",
  "yourxhandle",
  "todo",
  "change_me",
  "changeme",
  "placeholder",
]);

export function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export function formatNumber(value) {
  return Math.round(Number(value) || 0).toLocaleString("en-US");
}

function unit(count, word) {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

export function formatUptime(parts) {
  return `${unit(parts.years, "year")}, ${unit(parts.months, "month")}, ${unit(parts.days, "day")}`;
}

export function uptimeBetween(from, to) {
  const start = new Date(from);
  const end = new Date(to);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw new Error(`Invalid uptime date: ${from} -> ${to}`);
  }
  let years = end.getUTCFullYear() - start.getUTCFullYear();
  let months = end.getUTCMonth() - start.getUTCMonth();
  let days = end.getUTCDate() - start.getUTCDate();
  if (days < 0) {
    months -= 1;
    const daysInPrevMonth = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 0)).getUTCDate();
    days += daysInPrevMonth;
  }
  if (months < 0) {
    years -= 1;
    months += 12;
  }
  const parts = { years, months, days };
  return { ...parts, text: formatUptime(parts) };
}

export function isPlaceholderHandle(handle) {
  return PLACEHOLDER_HANDLES.has(String(handle ?? "").trim().toLowerCase());
}

export function resolveX(x = {}) {
  const handle = String(x.handle ?? "").trim().replace(/^@/, "");
  if (isPlaceholderHandle(handle)) return null;
  const href = String(x.url || x.href || `https://x.com/${handle}`).trim();
  if (!href) return null;
  return {
    label: String(x.label || "X").trim() || "X",
    text: String(x.text || `@${handle}`).trim(),
    href,
    handle,
  };
}

export function resolveToken(env = process.env) {
  const stats = String(env.STATS_TOKEN ?? "").trim();
  const fallback = String(env.GITHUB_TOKEN ?? env.GH_TOKEN ?? "").trim();
  const token = stats || fallback;
  if (!token) {
    throw new Error("Missing token. Set STATS_TOKEN or GITHUB_TOKEN.");
  }
  return { token, includePrivate: stats.length > 0 };
}

export function formatKv(key, value, width) {
  const left = `. ${key}: `;
  const right = ` ${value}`;
  const dots = width - left.length - right.length;
  if (dots < 2) {
    throw new Error(`Value for "${key}" does not fit in ${width} columns`);
  }
  return { left, dots: ".".repeat(dots), right, plain: `${left}${".".repeat(dots)}${right}` };
}

export function visibleCardLinks(config) {
  const links = (config.links ?? []).filter((link) => link.showInCard !== false && link.text && link.href);
  const x = resolveX(config.x);
  if (x) {
    links.push({ id: "x", label: x.label, text: x.text, href: x.href, showInCard: true, showButton: false });
  }
  return links;
}

export function buttonLinks(config) {
  return (config.links ?? []).filter((link) => link.showButton && link.href && link.label);
}
