#!/usr/bin/env node
/**
 * EduDash Pro — Puppeteer Tutorial Video Recorder
 *
 * Records tutorial-style videos of the app using Puppeteer + puppeteer-screen-recorder.
 * Use these for onboarding, help docs, or marketing.
 *
 * Usage:
 *   cd web && npm run record:tutorials
 *   cd web && npm run record:tutorials -- --scenes=landing,teacher_dashboard
 *   cd web && npm run record:tutorials -- --list
 *
 *   # With auth (for teacher/parent/principal flows):
 *   TEACHER_EMAIL=... TEACHER_PASSWORD=... npm run record:tutorials -- --scenes=teacher_dashboard
 *
 * Output: web/recordings/tutorials/<scene>_<timestamp>.mp4
 *
 * Requires: ffmpeg on PATH (used by puppeteer-screen-recorder for MP4 encoding).
 */

import { existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { spawn } from "child_process";
import { createConnection } from "net";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, "..");
const OUTPUT_DIR = join(PROJECT_ROOT, "recordings", "tutorials");

const BASE_URL = process.env.BASE_URL || "http://localhost:3000";
const VIEWPORT = { width: 1440, height: 900 };
const MOBILE_VIEWPORT = { width: 390, height: 844 };
const SLOW_MO_MS = 80;
const PAGE_LOAD_WAIT = 2500;
const STEP_PAUSE = 1200;

const CREDS = {
  teacher: {
    email: process.env.TEACHER_EMAIL,
    password: process.env.TEACHER_PASSWORD,
  },
  parent: {
    email: process.env.PARENT_EMAIL,
    password: process.env.PARENT_PASSWORD,
  },
  principal: {
    email: process.env.PRINCIPAL_EMAIL,
    password: process.env.PRINCIPAL_PASSWORD,
  },
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function isPortOpen(port, host = "127.0.0.1") {
  return new Promise((resolve) => {
    const sock = createConnection({ port, host });
    sock.once("connect", () => {
      sock.destroy();
      resolve(true);
    });
    sock.once("error", () => {
      sock.destroy();
      resolve(false);
    });
    sock.setTimeout(1000, () => {
      sock.destroy();
      resolve(false);
    });
  });
}

async function ensureDevServer() {
  const url = new URL(BASE_URL);
  const port = parseInt(url.port || "3000", 10);
  if (await isPortOpen(port)) {
    console.log(`   ✓ Dev server already running on port ${port}`);
    return null;
  }
  console.log(`   ⏳ Starting dev server on port ${port}...`);
  const child = spawn("npm", ["run", "dev"], {
    cwd: PROJECT_ROOT,
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, PORT: String(port) },
    detached: false,
  });
  let output = "";
  const onData = (chunk) => {
    output += chunk.toString();
  };
  child.stdout.on("data", onData);
  child.stderr.on("data", onData);
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (await isPortOpen(port)) {
      await sleep(3000);
      console.log(`   ✓ Dev server ready`);
      return child;
    }
    await sleep(1000);
  }
  child.kill("SIGTERM");
  throw new Error(`Dev server failed to start within 60s.\n${output.slice(-500)}`);
}

function stopServer(child) {
  if (!child || child.killed) return;
  console.log("\n   🛑 Stopping dev server...");
  child.kill("SIGTERM");
  setTimeout(() => {
    if (!child.killed) child.kill("SIGKILL");
  }, 5000);
}

async function signIn(page, email, password) {
  await page.goto(`${BASE_URL}/sign-in`, {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });
  await sleep(1500);
  await page.click('input[type="email"], input[name="email"]').catch(() => {});
  await page.type('input[type="email"], input[name="email"]', email, {
    delay: 50,
  });
  await sleep(300);
  await page.click('input[type="password"], input[name="password"]').catch(() => {});
  await page.type('input[type="password"], input[name="password"]', password, {
    delay: 50,
  });
  await sleep(300);
  await page.click('button[type="submit"]').catch(() => {
    return page.evaluate(() => {
      const btn = [...document.querySelectorAll("button")].find(
        (b) => /Sign In|Log In/i.test(b.textContent || "")
      );
      if (btn) btn.click();
    });
  });
  await page.waitForNavigation({ timeout: 15000 }).catch(() => {});
  await sleep(PAGE_LOAD_WAIT);
}

async function smoothScroll(page, step = 280, pause = 600) {
  const scrollHeight = await page.evaluate(() => document.body.scrollHeight);
  const viewportHeight = VIEWPORT.height;
  const totalScrolls = Math.ceil((scrollHeight - viewportHeight) / step);
  for (let i = 0; i < totalScrolls; i++) {
    await page.evaluate((s) => {
      window.scrollBy({ top: s, behavior: "smooth" });
    }, step);
    await sleep(pause);
  }
}

// ── Tutorial scene definitions ─────────────────────────────
const TUTORIAL_SCENES = {
  landing: {
    label: "App overview – Landing page",
    requiresAuth: false,
    viewport: VIEWPORT,
    async run(page) {
      await page.goto(BASE_URL, { waitUntil: "domcontentloaded", timeout: 60000 });
      await sleep(PAGE_LOAD_WAIT);
      await sleep(2000);
      await smoothScroll(page, 250, 700);
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: "smooth" }));
      await sleep(1500);
    },
  },

  landing_mobile: {
    label: "App overview – Landing (mobile)",
    requiresAuth: false,
    viewport: MOBILE_VIEWPORT,
    async run(page) {
      await page.goto(BASE_URL, { waitUntil: "domcontentloaded", timeout: 60000 });
      await sleep(PAGE_LOAD_WAIT);
      await sleep(1500);
      await smoothScroll(page, 200, 500);
      await sleep(1000);
    },
  },

  signin: {
    label: "How to sign in",
    requiresAuth: false,
    viewport: VIEWPORT,
    async run(page) {
      await page.goto(`${BASE_URL}/sign-in`, {
        waitUntil: "domcontentloaded",
        timeout: 60000,
      });
      await sleep(PAGE_LOAD_WAIT);
      await page.click('input[type="email"]');
      await page.type('input[type="email"]', "demo@school.co.za", { delay: 80 });
      await sleep(500);
      await page.click('input[type="password"]');
      await page.type('input[type="password"]', "••••••••", { delay: 80 });
      await sleep(1500);
    },
  },

  teacher_dashboard: {
    label: "Teacher – Dashboard tour",
    requiresAuth: true,
    role: "teacher",
    viewport: VIEWPORT,
    async run(page) {
      await page.goto(`${BASE_URL}/dashboard/teacher`, {
        waitUntil: "domcontentloaded",
        timeout: 60000,
      });
      await sleep(PAGE_LOAD_WAIT);
      await sleep(STEP_PAUSE);
      await smoothScroll(page, 250, 500);
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: "smooth" }));
      await sleep(1000);
    },
  },

  teacher_lessons: {
    label: "Teacher – Browsing lessons",
    requiresAuth: true,
    role: "teacher",
    viewport: VIEWPORT,
    async run(page) {
      await page.goto(`${BASE_URL}/dashboard/teacher/lessons`, {
        waitUntil: "domcontentloaded",
        timeout: 60000,
      });
      await sleep(PAGE_LOAD_WAIT);
      await smoothScroll(page, 250, 500);
      await sleep(1000);
    },
  },

  parent_dashboard: {
    label: "Parent – Dashboard tour",
    requiresAuth: true,
    role: "parent",
    viewport: VIEWPORT,
    async run(page) {
      await page.goto(`${BASE_URL}/dashboard/parent`, {
        waitUntil: "domcontentloaded",
        timeout: 60000,
      });
      await sleep(PAGE_LOAD_WAIT);
      await smoothScroll(page, 250, 500);
      await sleep(1000);
    },
  },

  pricing: {
    label: "Pricing and plans",
    requiresAuth: false,
    viewport: VIEWPORT,
    async run(page) {
      await page.goto(`${BASE_URL}/pricing`, {
        waitUntil: "domcontentloaded",
        timeout: 60000,
      });
      await sleep(PAGE_LOAD_WAIT);
      await smoothScroll(page, 250, 600);
      await sleep(1500);
    },
  },
};

async function main() {
  const listOnly = process.argv.includes("--list");
  const scenesArg = process.argv.find((a) => a.startsWith("--scenes="));
  const requestedScenes = scenesArg
    ? scenesArg.split("=")[1].split(",").map((s) => s.trim())
    : null;

  if (listOnly) {
    console.log("\n📋 Available tutorial scenes (Puppeteer):\n");
    for (const [key, scene] of Object.entries(TUTORIAL_SCENES)) {
      const auth = scene.requiresAuth ? ` [auth: ${scene.role}]` : "";
      console.log(`   ${key.padEnd(22)} ${scene.label}${auth}`);
    }
    console.log("\nUsage: npm run record:tutorials -- --scenes=landing,signin,teacher_dashboard\n");
    return;
  }

  const { createRequire } = await import("module");
  const require = createRequire(import.meta.url);
  const puppeteer = require("puppeteer");
  const { PuppeteerScreenRecorder } = require("puppeteer-screen-recorder");

  if (!existsSync(OUTPUT_DIR)) mkdirSync(OUTPUT_DIR, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const results = [];

  console.log("\n🎬 EduDash Pro — Puppeteer Tutorial Video Recorder");
  console.log(`   Base URL:   ${BASE_URL}`);
  console.log(`   Output:     ${OUTPUT_DIR}`);
  console.log(`   Timestamp:  ${timestamp}\n`);

  let serverProcess = null;
  try {
    serverProcess = await ensureDevServer();
  } catch (err) {
    console.error("\n❌", err.message);
    process.exit(1);
  }

  const scenesToRun = Object.entries(TUTORIAL_SCENES).filter(([key]) => {
    if (requestedScenes) return requestedScenes.includes(key);
    return true;
  });

  const recorderConfig = {
    followNewTab: false,
    fps: 25,
    videoFrame: VIEWPORT,
    videoCrf: 28,
    videoCodec: "libx264",
    videoPreset: "ultrafast",
    videoBitrate: 1000,
  };

  for (const [sceneName, scene] of scenesToRun) {
    if (scene.requiresAuth) {
      const cred = CREDS[scene.role];
      if (!cred?.email || !cred?.password) {
        console.log(
          `⏭  Skipping "${scene.label}" — set ${scene.role.toUpperCase()}_EMAIL and ${scene.role.toUpperCase()}_PASSWORD`
        );
        results.push({
          scene: sceneName,
          label: scene.label,
          status: "skipped",
          reason: "no credentials",
        });
        continue;
      }
    }

    const outFile = join(OUTPUT_DIR, `${sceneName}_${timestamp}.mp4`);
    console.log(`🔴 Recording: ${scene.label}...`);

    const browser = await puppeteer.launch({
      headless: "new",
      slowMo: SLOW_MO_MS,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    try {
      const page = await browser.newPage();
      await page.setViewport({
        ...scene.viewport,
        deviceScaleFactor: 2,
      });
      await page.setExtraHTTPHeaders({
        "Accept-Language": "en-ZA,en;q=0.9",
      });

      const recorder = new PuppeteerScreenRecorder(page, {
        ...recorderConfig,
        videoFrame: scene.viewport,
      });
      await recorder.start(outFile);

      if (scene.requiresAuth) {
        const cred = CREDS[scene.role];
        console.log(`   🔐 Signing in as ${scene.role}...`);
        await signIn(page, cred.email, cred.password);
      }

      await scene.run(page);
      await recorder.stop();

      console.log(`   ✅ Saved: ${outFile}`);
      results.push({ scene: sceneName, label: scene.label, status: "success", file: outFile });
    } catch (err) {
      console.log(`   ❌ Error: ${err.message}`);
      results.push({ scene: sceneName, label: scene.label, status: "error", error: err.message });
    } finally {
      await browser.close();
    }
  }

  console.log("\n" + "─".repeat(60));
  console.log("📊 Tutorial recording summary\n");
  const successful = results.filter((r) => r.status === "success");
  const skipped = results.filter((r) => r.status === "skipped");
  const failed = results.filter((r) => r.status === "error");
  if (successful.length > 0) {
    console.log(`✅ Recorded ${successful.length} video(s):`);
    successful.forEach((r) => console.log(`   • ${r.label}: ${r.file}`));
  }
  if (skipped.length > 0) {
    console.log(`\n⏭  Skipped ${skipped.length} (set env vars to record):`);
    skipped.forEach((r) => console.log(`   • ${r.label}`));
  }
  if (failed.length > 0) {
    console.log(`\n❌ Failed ${failed.length}:`);
    failed.forEach((r) => console.log(`   • ${r.label}: ${r.error}`));
  }
  console.log("\n💡 List scenes: npm run record:tutorials:list\n");
  stopServer(serverProcess);
}

main().catch(console.error);
