import sharp from "sharp";

const RAMP = "@%#*+=-:. ";

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function clampByte(value) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function hex(r, g, b) {
  return `#${[r, g, b].map((channel) => clampByte(channel).toString(16).padStart(2, "0")).join("")}`;
}

function quantize(value, step = 17) {
  return clampByte(Math.round(clampByte(value) / step) * step);
}

function saturate(r, g, b, amount) {
  const gray = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return [gray + (r - gray) * amount, gray + (g - gray) * amount, gray + (b - gray) * amount];
}

function luma(r, g, b) {
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

function adjustLight(r, g, b) {
  const lum = luma(r, g, b);
  const strength = lum > 0.9 ? 0.7 : 0.9;
  return [r * strength, g * strength, b * strength];
}

function adjustDark(r, g, b) {
  const lum = luma(r, g, b);
  const lift = lum < 0.45 ? (0.45 - lum) * 180 : 28;
  return [r + lift, g + lift, b + lift * 0.92];
}

function edgeStrength(levels, columns, rows, x, y) {
  const at = (cx, cy) => {
    if (cx < 0 || cy < 0 || cx >= columns || cy >= rows) return levels[y * columns + x];
    return levels[cy * columns + cx];
  };
  return Math.abs(at(x + 1, y) - at(x - 1, y)) + Math.abs(at(x, y + 1) - at(x, y - 1));
}

function equalize(levels) {
  const bins = 64;
  const hist = new Array(bins).fill(0);
  for (const level of levels) hist[Math.min(bins - 1, Math.floor(level * bins))] += 1;
  const cdf = [];
  let total = 0;
  for (const count of hist) {
    total += count;
    cdf.push(total);
  }
  const minimum = cdf.find((value) => value > 0) ?? 0;
  const span = Math.max(1, total - minimum);
  return levels.map((level) => {
    const index = Math.min(bins - 1, Math.floor(level * bins));
    return clamp01((cdf[index] - minimum) / span);
  });
}

export async function renderAscii(buffer, { columns, rows }) {
  if (!columns || !rows) throw new Error("ascii size is missing");
  const { data, info } = await sharp(buffer)
    .resize(columns, rows, { fit: "fill", kernel: "lanczos3" })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  if (info.channels < 3) throw new Error(`unexpected avatar channels: ${info.channels}`);

  const samples = [];
  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < columns; x += 1) {
      const index = (y * columns + x) * info.channels;
      const [r, g, b] = saturate(data[index], data[index + 1], data[index + 2], 1.18);
      samples.push({ r, g, b, lum: luma(r, g, b) });
    }
  }
  const equalized = equalize(samples.map((sample) => sample.lum));
  const light = { lines: [], colors: [] };
  const dark = { lines: [], colors: [] };

  for (let y = 0; y < rows; y += 1) {
    let lightLine = "";
    let darkLine = "";
    const lightColors = [];
    const darkColors = [];
    for (let x = 0; x < columns; x += 1) {
      const index = y * columns + x;
      const sample = samples[index];
      const tone = equalized[index];
      const edge = edgeStrength(equalized, columns, rows, x, y);
      const lightIndex = Math.max(0, Math.min(RAMP.length - 1, Math.floor(tone * RAMP.length) - (edge > 0.22 ? 2 : 0)));
      const darkIndex = Math.max(0, Math.min(RAMP.length - 1, lightIndex - 1));
      lightLine += RAMP[lightIndex];
      darkLine += RAMP[darkIndex];
      const [lr, lg, lb] = adjustLight(sample.r, sample.g, sample.b);
      const [dr, dg, db] = adjustDark(sample.r, sample.g, sample.b);
      lightColors.push(hex(quantize(lr, 12), quantize(lg, 12), quantize(lb, 12)));
      darkColors.push(hex(quantize(dr, 12), quantize(dg, 12), quantize(db, 12)));
    }
    light.lines.push(lightLine);
    light.colors.push(lightColors);
    dark.lines.push(darkLine);
    dark.colors.push(darkColors);
  }

  return { light, dark };
}

export function asciiText(portrait) {
  return `${portrait.lines.join("\n")}\n`;
}
