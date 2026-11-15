import { FONT, LEVEL_INDEX, themes } from "./theme.mjs";
import { escapeXml, formatNumber } from "./format.mjs";

const CELL = 11;
const GAP = 3;
const STEP = CELL + GAP;
const PAD_X = 18;
const PAD_TOP = 40;
const DURATION = 18;
const RADIUS = 7;

export function pacmanPath(radius, mouth) {
  const x = (radius * Math.cos(mouth)).toFixed(3);
  const y = (radius * Math.sin(mouth)).toFixed(3);
  return `M 0 0 L ${x} ${y} A ${radius} ${radius} 0 1 0 ${x} -${y} Z`;
}

export function gridFromCalendar(calendar) {
  const weeks = calendar?.weeks ?? [];
  return weeks.map((week) => {
    const column = Array(7).fill(null);
    for (const day of week.days ?? []) {
      const level = LEVEL_INDEX[day.level];
      column[day.weekday] = level == null ? 0 : level;
    }
    return column;
  });
}

export function routePoints(columns) {
  const points = [];
  for (let row = 0; row < 7; row += 1) {
    const cols = columns.map((_, index) => index);
    if (row % 2 === 1) cols.reverse();
    for (const col of cols) {
      const level = columns[col]?.[row];
      if (level == null) continue;
      points.push({
        col,
        row,
        level,
        x: PAD_X + col * STEP + CELL / 2,
        y: PAD_TOP + row * STEP + CELL / 2,
      });
    }
  }
  if (points.length === 1) points.push({ ...points[0] });
  return points;
}

function direction(from, to) {
  if (to.x > from.x + 0.5) return "right";
  if (to.x < from.x - 0.5) return "left";
  return null;
}

export function facingFrames(points) {
  if (points.length < 2) return [{ t: 0, facing: "right" }, { t: 1, facing: "right" }];
  const frames = [{ t: 0, facing: "right" }];
  let facing = "right";
  for (let index = 0; index < points.length - 1; index += 1) {
    const next = direction(points[index], points[index + 1]);
    if (next) facing = next;
    const t = index / (points.length - 1);
    if (frames[frames.length - 1].facing !== facing) frames.push({ t, facing });
  }
  frames.push({ t: 1, facing: frames[frames.length - 1].facing });
  return frames;
}

function monoTimes(frames) {
  const times = frames.map((frame, index) => {
    if (index === 0) return 0;
    if (index === frames.length - 1) return 1;
    return Math.min(0.998, Math.max(0.0001, Math.round(frame.t * 10000) / 10000));
  });
  for (let index = 1; index < times.length - 1; index += 1) {
    if (times[index] <= times[index - 1]) {
      times[index] = Math.min(0.998, Math.round((times[index - 1] + 0.0001) * 10000) / 10000);
    }
  }
  if (times.length > 1 && times[times.length - 1] <= times[times.length - 2]) {
    times[times.length - 2] = 0.999;
  }
  times[0] = 0;
  if (times.length > 0) times[times.length - 1] = 1;
  return times;
}

function opacityAnimation(frames, facing) {
  const times = monoTimes(frames);
  const values = frames.map((frame, index) => (index === frames.length - 1 ? frames[index - 1].facing : frame.facing) === facing ? "1" : "0");
  values[values.length - 1] = values[values.length - 2];
  return `<animate attributeName="opacity" calcMode="discrete" dur="${DURATION}s" repeatCount="indefinite" values="${values.join(";")}" keyTimes="${times.map((time) => time.toFixed(4)).join(";")}"/>`;
}

function eatAnimation(index, total) {
  const fraction = total <= 1 ? 0.5 : index / (total - 1);
  let first = Math.min(0.997, Math.max(0.001, Math.round(fraction * 10000) / 10000));
  let second = Math.min(0.998, Math.round((first + 0.0008) * 10000) / 10000);
  if (second <= first) second = Math.min(0.999, first + 0.0001);
  return `<animate attributeName="opacity" calcMode="discrete" dur="${DURATION}s" repeatCount="indefinite" values="1;1;0;0" keyTimes="0;${first.toFixed(4)};${second.toFixed(4)};1"/>`;
}

function motionPath(points) {
  return points
    .map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
    .join(" ");
}

function face(frames, facing, transform = "") {
  const open = pacmanPath(RADIUS, 0.62);
  const closed = pacmanPath(RADIUS, 0.05);
  return `<g ${transform ? `transform="${transform}"` : ""}>
    ${opacityAnimation(frames, facing)}
    <path fill="#ffe14a" stroke="#1c1917" stroke-width="0.65" d="${open}">
      <animate attributeName="d" dur="0.24s" repeatCount="indefinite" values="${open};${closed};${open}"/>
    </path>
    <circle cx="1.8" cy="-3.15" r="1.2" fill="#1c1917"/>
  </g>`;
}

export function renderPacmanSvg(calendar, theme) {
  const columns = gridFromCalendar(calendar);
  const points = routePoints(columns);
  const frames = facingFrames(points);
  const weekCount = Math.max(columns.length, 1);
  const gridWidth = weekCount * STEP - GAP;
  const title = `${formatNumber(calendar?.total ?? 0)} contributions in the last year`;
  const titleWidth = title.length * 13 * 0.6;
  const width = Math.ceil(Math.max(PAD_X * 2 + gridWidth, PAD_X * 2 + titleWidth));
  const legendY = PAD_TOP + 7 * STEP + 6;
  const height = Math.ceil(legendY + 28);
  const cells = points
    .map((point, index) => {
      const fill = theme.contrib[point.level] ?? theme.contrib[0];
      const anim = eatAnimation(index, points.length);
      if (point.level === 0) {
        return `<circle cx="${point.x.toFixed(2)}" cy="${point.y.toFixed(2)}" r="2.15" fill="${fill}">${anim}</circle>`;
      }
      const size = 10;
      return `<rect x="${(point.x - size / 2).toFixed(2)}" y="${(point.y - size / 2).toFixed(2)}" width="${size}" height="${size}" rx="2" fill="${fill}">${anim}</rect>`;
    })
    .join("");

  const swatches = theme.contrib
    .map((fill, index) => `<rect x="${118 + index * 16}" y="${legendY}" width="12" height="12" rx="2" fill="${fill}"/>`)
    .join("");

  const label = `Pac-Man eating the contribution graph, ${title}`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(label)}">
  <title>${escapeXml(label)}</title>
  <rect x="0.5" y="0.5" width="${width - 1}" height="${height - 1}" rx="16" fill="${theme.bg}" stroke="${theme.border}"/>
  <text x="${PAD_X}" y="24" font-family='${FONT}' font-size="13" fill="${theme.legend}">${escapeXml(title)}</text>
  ${cells}
  <g>
    <animateMotion dur="${DURATION}s" repeatCount="indefinite" calcMode="linear" path="${motionPath(points)}"/>
    ${face(frames, "right")}
    ${face(frames, "left", "scale(-1 1)")}
  </g>
  <text x="${PAD_X}" y="${legendY + 11}" font-family='${FONT}' font-size="12" fill="${theme.legend}">less</text>
  ${swatches}
  <text x="${204}" y="${legendY + 11}" font-family='${FONT}' font-size="12" fill="${theme.legend}">more</text>
</svg>
`;
}

export function renderPacman(calendar) {
  return {
    light: renderPacmanSvg(calendar, themes.light),
    dark: renderPacmanSvg(calendar, themes.dark),
  };
}
