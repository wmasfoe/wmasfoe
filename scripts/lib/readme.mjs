import { buttonLinks, escapeXml } from "./format.mjs";

export function renderReadme(config) {
  const home = config.links.find((link) => link.id === "homepage") ?? config.links[0];
  const alt = `${config.name} (@${config.login}) — ${config.tagline}`;
  const buttons = buttonLinks(config)
    .map(
      (link) =>
        `<a href="${escapeXml(link.href)}"><picture><source media="(prefers-color-scheme: dark)" srcset="assets/buttons/${link.id}-dark.svg"><img alt="${escapeXml(link.label)}" width="32%" src="assets/buttons/${link.id}-light.svg"></picture></a>`,
    )
    .join("");
  const card = `<picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/card-dark.svg">
    <img alt="${escapeXml(alt)}" src="assets/card-light.svg">
  </picture>`;
  const wrapped = home ? `<a href="${escapeXml(home.href)}">\n  ${card}\n</a>` : card;
  return `<!-- Generated from profile.config.json. Edit that file, then run \`npm run generate\`. -->

${wrapped}

<p align="left">${buttons}</p>

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="assets/pacman-dark.svg">
  <img alt="Pac-Man eating the contribution graph" src="assets/pacman-light.svg">
</picture>
`;
}
