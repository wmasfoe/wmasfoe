import { FONT, themes } from "./theme.mjs";
import { buttonLinks, escapeXml } from "./format.mjs";

const WIDTH = 348;
const HEIGHT = 68;

const ICONS = {
  homepage: `
    <path d="M4 11.5 12 4.5 20 11.5"/>
    <path d="M6.5 10.2V19.5h4.2v-4.6h2.6v4.6h4.2V10.2"/>`,
  blog: `
    <path d="M6 3.5h8l4.5 4.5V20.5H6z"/>
    <path d="M14 3.5V8h4.5"/>
    <path d="M8.5 12.2h7"/>
    <path d="M8.5 15.5h7"/>
    <path d="M8.5 18.8H13"/>`,
  email: `
    <rect x="3.5" y="6" width="17" height="12" rx="1.6"/>
    <path d="m4.2 7.2 7.8 5.6 7.8-5.6"/>`,
};

function icon(id) {
  return ICONS[id] ?? `<circle cx="12" cy="12" r="6"/>`;
}

function buttonSvg(link, theme) {
  const label = escapeXml(link.label);
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" role="img" aria-label="${label}">
  <title>${label}</title>
  <rect x="8.5" y="6.5" width="${WIDTH - 17}" height="${HEIGHT - 13}" rx="12" fill="${theme.buttonBg}" stroke="${theme.buttonBorder}" stroke-width="1.5"/>
  <g transform="translate(28 22)" fill="none" stroke="${theme.buttonIcon}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
    ${icon(link.id)}
  </g>
  <text x="66" y="41" font-family='${FONT}' font-size="20" fill="${theme.buttonText}">${label}</text>
</svg>
`;
}

export function renderButtons(config) {
  const links = buttonLinks(config);
  const files = {};
  for (const link of links) {
    files[`${link.id}-light.svg`] = buttonSvg(link, themes.light);
    files[`${link.id}-dark.svg`] = buttonSvg(link, themes.dark);
  }
  return files;
}
