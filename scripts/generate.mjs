import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { asciiText, renderAscii } from "./lib/ascii.mjs";
import { renderButtons } from "./lib/buttons.mjs";
import { asciiSizeFor, buildCardModel, renderCards } from "./lib/card.mjs";
import { loadConfig } from "./lib/config.mjs";
import { resolveToken } from "./lib/format.mjs";
import { fetchStats } from "./lib/github.mjs";
import { renderPacman } from "./lib/pacman.mjs";
import { renderReadme } from "./lib/readme.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function writeFile(file, contents) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, contents);
}

async function main() {
  const config = loadConfig(path.join(root, "profile.config.json"));
  const { token, includePrivate } = resolveToken();
  const stats = await fetchStats({
    token,
    includePrivate,
    login: config.login,
    publicCachePath: path.join(root, "cache", "loc.json"),
    privateCachePath: path.join(root, "cache", "loc-private.json"),
  });
  const model = buildCardModel(config, stats);
  const size = asciiSizeFor(model);
  console.log(`rendering ascii ${size.columns}x${size.rows}`);
  const avatarResponse = await fetch(config.avatarUrl, {
    headers: { "User-Agent": "wmasfoe-profile-card" },
    signal: AbortSignal.timeout(30_000),
  });
  if (!avatarResponse.ok) throw new Error(`Avatar download failed (${avatarResponse.status})`);
  const avatar = Buffer.from(await avatarResponse.arrayBuffer());
  const portraits = await renderAscii(avatar, size);
  await writeFile(path.join(root, "assets", "ascii", "portrait-light.txt"), asciiText(portraits.light));
  await writeFile(path.join(root, "assets", "ascii", "portrait-dark.txt"), asciiText(portraits.dark));

  const cards = renderCards({ config, model, portraits });
  await writeFile(path.join(root, "assets", "card-light.svg"), cards.light);
  await writeFile(path.join(root, "assets", "card-dark.svg"), cards.dark);

  const buttonDir = path.join(root, "assets", "buttons");
  await fs.mkdir(buttonDir, { recursive: true });
  const buttons = renderButtons(config);
  const keep = new Set(Object.keys(buttons));
  for (const existing of await fs.readdir(buttonDir)) {
    if (!keep.has(existing)) await fs.unlink(path.join(buttonDir, existing));
  }
  for (const [name, svg] of Object.entries(buttons)) {
    await writeFile(path.join(buttonDir, name), svg);
  }

  const pacman = renderPacman(stats.calendar);
  await writeFile(path.join(root, "assets", "pacman-light.svg"), pacman.light);
  await writeFile(path.join(root, "assets", "pacman-dark.svg"), pacman.dark);
  await writeFile(path.join(root, "README.md"), renderReadme(config));
  console.log(
    `profile card ready: ${stats.repos} repos, ${stats.commits} commits, net ${stats.additions - stats.deletions} lines`,
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
