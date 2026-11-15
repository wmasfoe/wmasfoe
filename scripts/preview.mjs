import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = process.argv[2] || "/opt/cursor/artifacts";

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

async function waitFor(url) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return response.json();
    } catch {
      await delay(100);
    }
  }
  throw new Error(`Chrome did not open ${url}`);
}

function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  const pending = new Map();
  const waits = [];
  let next = 0;
  return new Promise((resolve, reject) => {
    ws.addEventListener("open", () => {
      const send = (method, params = {}) => {
        const id = ++next;
        return new Promise((ok, fail) => {
          pending.set(id, { ok, fail });
          ws.send(JSON.stringify({ id, method, params }));
        });
      };
      const waitEvent = (name) =>
        new Promise((ok) => {
          waits.push({ name, ok });
        });
      resolve({ send, waitEvent, close: () => ws.close() });
    });
    ws.addEventListener("error", () => reject(new Error("Chrome DevTools socket failed")));
    ws.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (message.id && pending.has(message.id)) {
        const { ok, fail } = pending.get(message.id);
        pending.delete(message.id);
        if (message.error) fail(new Error(JSON.stringify(message.error)));
        else ok(message.result);
        return;
      }
      const index = waits.findIndex((wait) => wait.name === message.method);
      if (index >= 0) waits.splice(index, 1)[0].ok(message.params);
    });
  });
}

async function shoot(session, fileUrl, colorScheme) {
  await session.send("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-color-scheme", value: colorScheme }],
  });
  await session.send("Emulation.setDeviceMetricsOverride", {
    width: 1120,
    height: 900,
    deviceScaleFactor: 2,
    mobile: false,
  });
  const loaded = session.waitEvent("Page.loadEventFired");
  await session.send("Page.navigate", { url: fileUrl });
  await loaded;
  await delay(250);
  const height = await session.send("Runtime.evaluate", {
    expression: "Math.ceil(document.documentElement.scrollHeight)",
    returnByValue: true,
  });
  await session.send("Emulation.setDeviceMetricsOverride", {
    width: 1120,
    height: Math.max(900, height.result.value + 8),
    deviceScaleFactor: 2,
    mobile: false,
  });
  await delay(150);
  const shot = await session.send("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: true,
    fromSurface: true,
  });
  return Buffer.from(shot.data, "base64");
}

async function shootInline(session, fileUrl, seconds) {
  await session.send("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-color-scheme", value: "light" }],
  });
  const loaded = session.waitEvent("Page.loadEventFired");
  await session.send("Page.navigate", { url: fileUrl });
  await loaded;
  await session.send("Runtime.evaluate", {
    expression: `document.querySelector('svg').setCurrentTime(${seconds})`,
  });
  await delay(80);
  const shot = await session.send("Page.captureScreenshot", { format: "png", fromSurface: true });
  return Buffer.from(shot.data, "base64");
}

async function main() {
  await fs.mkdir(outDir, { recursive: true });
  const readme = await fs.readFile(path.join(root, "README.md"), "utf8");
  const previewDir = path.join(root, "preview");
  await fs.mkdir(previewDir, { recursive: true });
  const page = `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <base href="file://${root}/">
  <style>
    body { margin: 0; padding: 28px 32px 40px; background: #ffffff; font-family: sans-serif; }
    main { max-width: 1012px; }
    img { max-width: 100%; height: auto; }
    @media (prefers-color-scheme: dark) {
      body { background: #0d1117; }
    }
  </style>
</head>
<body><main>${readme}</main></body>
</html>`;
  const pagePath = path.join(previewDir, "readme.html");
  await fs.writeFile(pagePath, page);

  async function inlinePage(svgName) {
    const raw = await fs.readFile(path.join(root, "assets", svgName), "utf8");
    const svg = raw.replace(/<\?xml[^?]*\?>/, "");
    const file = path.join(previewDir, `${svgName}.html`);
    await fs.writeFile(
      file,
      `<!doctype html><html><body style="margin:0;background:#ffffff">${svg}</body></html>`,
    );
    return `file://${file}`;
  }

  const port = await freePort();
  const chrome = spawn(
    "google-chrome",
    [
      "--headless=new",
      "--disable-gpu",
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "--hide-scrollbars",
      "--force-device-scale-factor=1",
      `--remote-debugging-port=${port}`,
      "about:blank",
    ],
    { stdio: "ignore" },
  );
  try {
    await waitFor(`http://127.0.0.1:${port}/json/version`);
    const pages = await waitFor(`http://127.0.0.1:${port}/json/list`);
    const pageTarget = pages.find((target) => target.type === "page");
    if (!pageTarget?.webSocketDebuggerUrl) throw new Error("Chrome did not open a page target");
    const session = await connect(pageTarget.webSocketDebuggerUrl);
    await session.send("Page.enable");
    const pageUrl = `file://${pagePath}`;
    const light = await shoot(session, pageUrl, "light");
    const dark = await shoot(session, pageUrl, "dark");
    if (light.equals(dark)) throw new Error("Light and dark README screenshots are identical");
    await fs.writeFile(path.join(outDir, "readme-light.png"), light);
    await fs.writeFile(path.join(outDir, "readme-dark.png"), dark);

    const pacmanUrl = await inlinePage("pacman-light.svg");
    await session.send("Emulation.setDeviceMetricsOverride", {
      width: 980,
      height: 220,
      deviceScaleFactor: 2,
      mobile: false,
    });
    const start = await shootInline(session, pacmanUrl, 0);
    const mid = await shootInline(session, pacmanUrl, 7);
    await fs.writeFile(path.join(outDir, "pacman-start.png"), start);
    await fs.writeFile(path.join(outDir, "pacman-mid.png"), mid);
    session.close();
    console.log(`wrote previews to ${outDir}`);
  } finally {
    chrome.kill("SIGKILL");
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : error);
  process.exitCode = 1;
});
