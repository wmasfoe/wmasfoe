import { CHAR_RATIO, FONT, themes } from "./theme.mjs";
import {
  escapeXml,
  formatKv,
  formatNumber,
  uptimeBetween,
  visibleCardLinks,
} from "./format.mjs";

export const INFO_FONT = 14;
export const INFO_LINE = 20;
export const ASCII_FONT = 11;
const PAD = 26;
const COLUMN_GAP = 22;
const MIN_DOTS = 3;

function infoValue(row, config, uptimeText) {
  if (row.blank) return null;
  if (row.source === "account-created") return uptimeText;
  if (row.from === "location") return config.location;
  return String(row.value);
}

function locParts(stats) {
  return {
    net: formatNumber(stats.additions - stats.deletions),
    additions: formatNumber(stats.additions),
    deletions: formatNumber(stats.deletions),
  };
}

function locPlain(parts) {
  return `${parts.net} ( ${parts.additions} ++, ${parts.deletions} -- )`;
}

function pieceWidth(piece) {
  if (piece.type === "kv") return `. ${piece.label}: `.length + MIN_DOTS + 1 + piece.value.length;
  if (piece.type === "loc") return `. ${piece.label}: `.length + MIN_DOTS + 1 + piece.value.length;
  if (piece.type === "section") return `[ ${piece.label} ]`.length + 4;
  if (piece.type === "text") return piece.text.length;
  return 0;
}

export function buildCardModel(config, stats, now = new Date()) {
  const uptime = uptimeBetween(stats.createdAt, now);
  const pieces = [
    { type: "header" },
    { type: "text", role: "name", text: config.name },
  ];
  if (String(config.tagline ?? "").trim()) {
    pieces.push({ type: "text", role: "tagline", text: `# ${config.tagline.trim()}` });
  }
  pieces.push({ type: "rule" });

  for (const row of config.info) {
    if (row.blank) {
      pieces.push({ type: "blank" });
      continue;
    }
    pieces.push({ type: "kv", label: row.label, value: infoValue(row, config, uptime.text) });
  }

  pieces.push({ type: "blank" });
  pieces.push({ type: "section", label: "contact" });
  for (const link of visibleCardLinks(config)) {
    pieces.push({ type: "kv", label: link.label, value: link.text });
  }

  pieces.push({ type: "blank" });
  pieces.push({ type: "section", label: "stats" });
  pieces.push({
    type: "kv",
    label: "Repos",
    value: `${formatNumber(stats.repos)} { Contributed: ${formatNumber(stats.contributed)} } | Stars: ${formatNumber(stats.stars)}`,
  });
  pieces.push({
    type: "kv",
    label: "Commits",
    value: `${formatNumber(stats.commits)} | Followers: ${formatNumber(stats.followers)}`,
  });
  const linesOfCode = locParts(stats);
  pieces.push({
    type: "loc",
    label: "Lines of Code",
    value: locPlain(linesOfCode),
    ...linesOfCode,
  });
  pieces.push({ type: "prompt" });

  const width = Math.max(...pieces.map(pieceWidth), `${config.login}@${config.promptHost}`.length);
  return { pieces, width, uptime: uptime.text, lineCount: pieces.length };
}

export function asciiSizeFor(model) {
  const infoHeight = model.lineCount * INFO_LINE;
  const rows = Math.max(36, Math.min(48, Math.round(infoHeight / ASCII_FONT)));
  const columns = Math.max(32, Math.round(rows / CHAR_RATIO));
  return { rows, columns, fontSize: ASCII_FONT };
}

function groupSpans(text, colors) {
  const spans = [];
  let start = 0;
  for (let index = 1; index <= text.length; index += 1) {
    if (index === text.length || colors[index] !== colors[start]) {
      spans.push({ text: text.slice(start, index), fill: colors[start] });
      start = index;
    }
  }
  return spans;
}

function renderSpans(spans) {
  return spans
    .filter((span) => span.text)
    .map((span) => `<tspan fill="${span.fill}">${escapeXml(span.text)}</tspan>`)
    .join("");
}

function themedPieces(model, theme, config) {
  const lines = [];
  for (const piece of model.pieces) {
    if (piece.type === "blank") {
      lines.push({ spans: [{ text: " ", fill: theme.muted }] });
      continue;
    }
    if (piece.type === "header") {
      lines.push({
        spans: [
          { text: config.login, fill: theme.title },
          { text: "@", fill: theme.muted },
          { text: config.promptHost, fill: theme.title },
        ],
      });
      continue;
    }
    if (piece.type === "text") {
      const fill = piece.role === "name" ? theme.name : theme.muted;
      lines.push({ spans: [{ text: piece.text, fill }] });
      continue;
    }
    if (piece.type === "rule") {
      lines.push({ spans: [{ text: "-".repeat(model.width), fill: theme.dot }] });
      continue;
    }
    if (piece.type === "section") {
      const label = `[ ${piece.label} ]`;
      lines.push({
        spans: [
          { text: label, fill: theme.section },
          { text: "-".repeat(Math.max(0, model.width - label.length)), fill: theme.dot },
        ],
      });
      continue;
    }
    if (piece.type === "prompt") {
      lines.push({ prompt: true, spans: [{ text: ">", fill: theme.key }] });
      continue;
    }
    const formatted = formatKv(piece.label, piece.value, model.width);
    if (piece.type === "loc") {
      const spans = [
        { text: formatted.left, fill: theme.key },
        { text: formatted.dots, fill: theme.dot },
        { text: ` ${piece.net}`, fill: theme.value },
        { text: " (", fill: theme.muted },
        { text: ` ${piece.additions} ++`, fill: theme.add },
        { text: ",", fill: theme.muted },
        { text: ` ${piece.deletions} --`, fill: theme.del },
        { text: " )", fill: theme.muted },
      ];
      assertWidth(piece.label, spans, model.width);
      lines.push({ spans });
      continue;
    }
    const spans = [
      { text: formatted.left, fill: theme.key },
      { text: formatted.dots, fill: theme.dot },
      { text: formatted.right, fill: theme.value },
    ];
    assertWidth(piece.label, spans, model.width);
    lines.push({ spans });
  }
  return lines;
}

function assertWidth(label, spans, width) {
  const total = spans.reduce((sum, span) => sum + span.text.length, 0);
  if (total !== width) {
    throw new Error(`"${label}" renders ${total} columns, expected ${width}`);
  }
}

function num(value) {
  return (Math.round(value * 10) / 10).toString();
}

export function renderCardSvg({ config, model, theme, ascii }) {
  const columns = ascii.lines[0]?.length ?? 0;
  const rows = ascii.lines.length;
  if (!columns || rows !== ascii.colors.length) throw new Error("ascii portrait is empty");
  const charW = ASCII_FONT * CHAR_RATIO;
  const infoCharW = INFO_FONT * CHAR_RATIO;
  const asciiW = columns * charW;
  const asciiH = rows * ASCII_FONT;
  const infoW = model.width * infoCharW + 6;
  const infoH = model.lineCount * INFO_LINE;
  const contentH = Math.max(asciiH, infoH);
  const width = Math.ceil(PAD + asciiW + COLUMN_GAP + 1 + COLUMN_GAP + infoW + PAD);
  const height = Math.ceil(PAD + contentH + PAD);
  const asciiTop = PAD + (contentH - asciiH) / 2;
  const infoTop = PAD + (contentH - infoH) / 2;
  const infoX = PAD + asciiW + COLUMN_GAP + 1 + COLUMN_GAP;
  const sepX = PAD + asciiW + COLUMN_GAP;
  const label = `${config.name} (@${config.login}) — ${config.tagline}`;

  const portrait = ascii.lines
    .map((line, row) => {
      const y = asciiTop + row * ASCII_FONT + ASCII_FONT * 0.8;
      return `<text x="${num(PAD)}" y="${num(y)}" font-family='${FONT}' font-size="${ASCII_FONT}" xml:space="preserve">${renderSpans(groupSpans(line, ascii.colors[row]))}</text>`;
    })
    .join("");

  const info = themedPieces(model, theme, config)
    .map((line, index) => {
      const y = infoTop + index * INFO_LINE + INFO_FONT * 0.8;
      const text = `<text x="${num(infoX)}" y="${num(y)}" font-family='${FONT}' font-size="${INFO_FONT}" xml:space="preserve">${renderSpans(line.spans)}</text>`;
      if (!line.prompt) return text;
      const cursorX = infoX + infoCharW * 1.7;
      const cursorY = y - INFO_FONT * 0.76;
      const cursor = `<rect x="${num(cursorX)}" y="${num(cursorY)}" width="${num(infoCharW * 0.72)}" height="${num(INFO_FONT * 0.86)}" fill="${theme.cursor}"><animate attributeName="opacity" values="1;1;0;0" keyTimes="0;0.45;0.55;1" dur="1.15s" repeatCount="indefinite"/></rect>`;
      return text + cursor;
    })
    .join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(label)}">
  <title>${escapeXml(label)}</title>
  <style>text { white-space: pre; }</style>
  <rect x="0.5" y="0.5" width="${width - 1}" height="${height - 1}" rx="18" fill="${theme.bg}" stroke="${theme.border}"/>
  ${portrait}
  <line x1="${num(sepX)}" y1="${PAD}" x2="${num(sepX)}" y2="${height - PAD}" stroke="${theme.separator}" stroke-width="1"/>
  ${info}
</svg>
`;
}

export function renderCards({ config, model, portraits }) {
  return {
    light: renderCardSvg({ config, model, theme: themes.light, ascii: portraits.light }),
    dark: renderCardSvg({ config, model, theme: themes.dark, ascii: portraits.dark }),
  };
}
