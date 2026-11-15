import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { buildCardModel, renderCardSvg } from "./lib/card.mjs";
import { loadConfig } from "./lib/config.mjs";
import { isPlaceholderHandle, resolveToken, resolveX, uptimeBetween } from "./lib/format.mjs";
import { commitRanges } from "./lib/github.mjs";
import { facingFrames, gridFromCalendar, renderPacmanSvg, routePoints } from "./lib/pacman.mjs";
import { renderReadme } from "./lib/readme.mjs";
import { themes } from "./lib/theme.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const config = loadConfig(path.join(root, "profile.config.json"));

const stats = {
  createdAt: "2020-03-09T09:49:30Z",
  repos: 55,
  contributed: 6,
  stars: 68,
  commits: 1233,
  followers: 22,
  additions: 5000,
  deletions: 1000,
  calendar: { total: 9, weeks: sampleWeeks() },
};

function sampleWeeks() {
  const levels = ["NONE", "FIRST_QUARTILE", "SECOND_QUARTILE", "THIRD_QUARTILE", "FOURTH_QUARTILE"];
  return Array.from({ length: 4 }, (_, week) => ({
    days: Array.from({ length: 7 }, (_, weekday) => ({
      count: weekday,
      level: levels[(week + weekday) % levels.length],
      weekday,
    })),
  }));
}

test("uptime counts from the account creation date", () => {
  const uptime = uptimeBetween("2020-03-09T09:49:30Z", "2026-11-15T12:00:00Z");
  assert.deepEqual(
    { years: uptime.years, months: uptime.months, days: uptime.days },
    { years: 6, months: 8, days: 6 },
  );
  assert.equal(uptime.text, "6 years, 8 months, 6 days");
});

test("token prefers STATS_TOKEN and falls back to GITHUB_TOKEN", () => {
  assert.deepEqual(resolveToken({ STATS_TOKEN: "stats-secret", GITHUB_TOKEN: "actions" }), {
    token: "stats-secret",
    includePrivate: true,
  });
  assert.deepEqual(resolveToken({ STATS_TOKEN: "   ", GITHUB_TOKEN: "actions" }), {
    token: "actions",
    includePrivate: false,
  });
  assert.deepEqual(resolveToken({ GH_TOKEN: "cli" }), { token: "cli", includePrivate: false });
  assert.throws(() => resolveToken({}), /Missing token/);
});

test("X line renders the real handle and hides a placeholder", () => {
  assert.equal(resolveX({ handle: "Jacky_liiii", label: "X" }).text, "@Jacky_liiii");
  assert.equal(resolveX({ handle: "Jacky_liiii" }).href, "https://x.com/Jacky_liiii");
  assert.equal(resolveX({ handle: "YOUR_X_HANDLE" }), null);
  assert.equal(resolveX({ handle: "" }), null);
  assert.equal(isPlaceholderHandle("todo"), true);
});

test("card includes the profile fields", () => {
  const now = new Date("2026-11-15T12:00:00Z");
  const model = buildCardModel(config, stats, now);
  const text = JSON.stringify(model.pieces);
  for (const value of [
    "Zed, VSCode",
    "TypeScript, Go, Python, Java",
    "Agents, MCP, Skills",
    "Next.js, Serverless, Gin",
    "Skiing, Hiking/Mountaineering",
    "macOS",
    "Singapore",
    "Full-stack engineer",
    "@Jacky_liiii",
    "jiaqi.im",
    "blog.jiaqi.im",
    "contact@jiaqi.im",
    "6 years, 8 months, 6 days",
    "4,000",
  ]) {
    assert.ok(text.includes(value), `missing ${value}`);
  }

  const hidden = structuredClone(config);
  hidden.x = { handle: "YOUR_X_HANDLE", label: "X" };
  const withoutX = JSON.stringify(buildCardModel(hidden, stats, now).pieces);
  assert.equal(withoutX.includes("YOUR_X_HANDLE"), false);
  assert.equal(withoutX.includes("@Jacky_liiii"), false);
});

test("card svg is well formed for both themes", () => {
  const model = buildCardModel(config, stats, new Date("2026-11-15T12:00:00Z"));
  const ascii = {
    lines: ["ab", "cd"],
    colors: [
      ["#112233", "#112233"],
      ["#445566", "#778899"],
    ],
  };
  for (const theme of [themes.light, themes.dark]) {
    const svg = renderCardSvg({ config, model, theme, ascii });
    assert.match(svg, /<svg xmlns="http:\/\/www\.w3.org\/2000\/svg"/);
    assert.match(svg, /wmasfoe@github|wmasfoe/);
    assert.match(svg, /Zed, VSCode/);
    assert.match(svg, /Jacky_liiii/);
    assert.match(svg, /4,000/);
    assert.equal((svg.match(/<svg/g) || []).length, 1);
  }
});

test("pacman route alternates direction and animation times increase", () => {
  const columns = gridFromCalendar(stats.calendar);
  const points = routePoints(columns);
  assert.equal(points.length, 28);
  const frames = facingFrames(points);
  assert.equal(frames[0].facing, "right");
  assert.ok(frames.some((frame) => frame.facing === "left"));
  for (const theme of [themes.light, themes.dark]) {
    const svg = renderPacmanSvg(stats.calendar, theme);
    assert.match(svg, /<animateMotion/);
    for (const animation of svg.matchAll(/values="([^"]+)" keyTimes="([^"]+)"/g)) {
      const values = animation[1].split(";");
      const times = animation[2].split(";").map(Number);
      assert.equal(values.length, times.length);
      assert.equal(times[0], 0);
      assert.equal(times[times.length - 1], 1);
      for (let index = 1; index < times.length; index += 1) {
        assert.ok(times[index] > times[index - 1], animation[0]);
      }
    }
  }
});

test("readme switches themes and links the three buttons", () => {
  const readme = renderReadme(config);
  assert.match(readme, /prefers-color-scheme: dark/);
  assert.match(readme, /assets\/card-dark\.svg/);
  assert.match(readme, /assets\/card-light\.svg/);
  assert.match(readme, /assets\/pacman-dark\.svg/);
  assert.match(readme, /assets\/pacman-light\.svg/);
  assert.match(readme, /href="https:\/\/jiaqi\.im"/);
  assert.match(readme, /href="https:\/\/blog\.jiaqi\.im"/);
  assert.match(readme, /href="mailto:contact@jiaqi\.im"/);
  assert.match(readme, /assets\/buttons\/homepage-dark\.svg/);
  assert.match(readme, /assets\/buttons\/blog-light\.svg/);
  assert.match(readme, /assets\/buttons\/email-dark\.svg/);
});

test("commit ranges cover the account without overlapping", () => {
  const ranges = commitRanges("2020-03-09T09:49:30Z", new Date("2026-11-15T12:00:00Z"));
  assert.ok(ranges.length >= 6);
  let previousEnd = 0;
  for (const range of ranges) {
    const from = Date.parse(range.from);
    const to = Date.parse(range.to);
    assert.ok(to > from);
    assert.ok(to - from <= 366 * 24 * 60 * 60 * 1000);
    assert.ok(from > previousEnd);
    previousEnd = to;
  }
  assert.ok(Date.parse(ranges[0].from) <= Date.parse("2020-03-09T09:49:30Z"));
  assert.ok(Date.parse(ranges.at(-1).to) <= Date.parse("2026-11-15T12:00:00Z"));
});
