#!/usr/bin/env node
/**
 * EduDash Pro — Playwright Dashboard Screen Recorder
 *
 * Records polished .webm videos of every major dashboard view.
 * Uses Playwright's built-in video capture (VP8/WebM by default).
 *
 * Usage:
 *   # Record public pages only (no login required):
 *   node scripts/record-dashboard-videos.mjs
 *
 *   # Record everything including authenticated dashboards:
 *   PARENT_EMAIL=parent@example.com PARENT_PASSWORD=pass123 \
 *   TEACHER_EMAIL=teacher@example.com TEACHER_PASSWORD=pass123 \
 *   PRINCIPAL_EMAIL=principal@example.com PRINCIPAL_PASSWORD=pass123 \
 *   ADMIN_EMAIL=admin@example.com ADMIN_PASSWORD=pass123 \
 *   node scripts/record-dashboard-videos.mjs
 *
 *   # Record only specific scenes:
 *   node scripts/record-dashboard-videos.mjs --scenes landing,teacher
 *
 *   # Override base URL (default: http://localhost:3000):
 *   BASE_URL=https://edudashpro.org.za node scripts/record-dashboard-videos.mjs
 *
 * Output: web/recordings/<scene>_<timestamp>.webm
 */

import { chromium } from "playwright";
import { existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { spawn } from "child_process";
import { createConnection } from "net";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, "..");
const OUTPUT_DIR = join(PROJECT_ROOT, "recordings");

// ── Config ────────────────────────────────────────────────
const BASE_URL = process.env.BASE_URL || "http://localhost:3000";
const VIEWPORT = { width: 1440, height: 900 };
const MOBILE_VIEWPORT = { width: 390, height: 844 };
const SLOW_MO = 80; // ms between actions (makes recordings smoother)
const SCROLL_STEP_PX = 300;
const SCROLL_PAUSE_MS = 600;
const PAGE_LOAD_WAIT = 2500;
const SECTION_PAUSE = 1200;

// Credentials from env vars
const CREDS = {
  parent: {
    email: process.env.PARENT_EMAIL,
    password: process.env.PARENT_PASSWORD,
  },
  teacher: {
    email: process.env.TEACHER_EMAIL,
    password: process.env.TEACHER_PASSWORD,
  },
  principal: {
    email: process.env.PRINCIPAL_EMAIL,
    password: process.env.PRINCIPAL_PASSWORD,
  },
  admin: {
    email: process.env.ADMIN_EMAIL,
    password: process.env.ADMIN_PASSWORD,
  },
};

// ── Helpers ───────────────────────────────────────────────
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Check if a TCP port is listening */
function isPortOpen(port, host = "127.0.0.1") {
  return new Promise((resolve) => {
    const sock = createConnection({ port, host });
    sock.once("connect", () => { sock.destroy(); resolve(true); });
    sock.once("error", () => { sock.destroy(); resolve(false); });
    sock.setTimeout(1000, () => { sock.destroy(); resolve(false); });
  });
}

/** Start the Next.js dev server and wait until it's ready */
async function ensureDevServer() {
  const url = new URL(BASE_URL);
  const port = parseInt(url.port || "3000", 10);

  if (await isPortOpen(port)) {
    console.log(`   ✓ Dev server already running on port ${port}`);
    return null; // no child process to clean up
  }

  console.log(`   ⏳ Starting dev server on port ${port}...`);
  const child = spawn("npm", ["run", "dev"], {
    cwd: PROJECT_ROOT,
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, PORT: String(port) },
    detached: false,
  });

  // Stream stderr/stdout so we can detect readiness
  let output = "";
  const onData = (chunk) => { output += chunk.toString(); };
  child.stdout.on("data", onData);
  child.stderr.on("data", onData);

  // Wait up to 60s for the port to become available
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (await isPortOpen(port)) {
      // Give Next.js an extra moment to finish compiling
      await sleep(3000);
      console.log(`   ✓ Dev server ready`);
      return child;
    }
    await sleep(1000);
  }

  child.kill("SIGTERM");
  throw new Error(`Dev server failed to start within 60 s.\nOutput:\n${output.slice(-500)}`);
}

/** Gracefully stop a child process */
function stopServer(child) {
  if (!child || child.killed) return;
  console.log("\n   🛑 Stopping dev server...");
  child.kill("SIGTERM");
  // Force-kill after 5s
  setTimeout(() => { if (!child.killed) child.kill("SIGKILL"); }, 5000);
}

async function smoothScroll(page, options = {}) {
  const { step = SCROLL_STEP_PX, pause = SCROLL_PAUSE_MS, direction = "down" } = options;
  const scrollHeight = await page.evaluate(() => document.body.scrollHeight);
  const viewportHeight = VIEWPORT.height;
  const totalScrolls = Math.ceil((scrollHeight - viewportHeight) / step);

  for (let i = 0; i < totalScrolls; i++) {
    await page.evaluate(
      ([s, dir]) => {
        window.scrollBy({ top: dir === "down" ? s : -s, behavior: "smooth" });
      },
      [step, direction]
    );
    await sleep(pause);
  }
}

async function scrollToSection(page, sectionId) {
  try {
    await page.evaluate((id) => {
      const el = document.getElementById(id) || document.querySelector(`[data-section="${id}"]`);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    }, sectionId);
    await sleep(SECTION_PAUSE);
  } catch {
    // Section may not exist — continue
  }
}

async function signIn(page, email, password) {
  await page.goto(`${BASE_URL}/sign-in`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await sleep(1500);

  // Fill email
  const emailInput = page.locator('input[type="email"], input[name="email"]').first();
  await emailInput.click();
  await emailInput.fill(email);
  await sleep(300);

  // Fill password
  const passwordInput = page.locator('input[type="password"], input[name="password"]').first();
  await passwordInput.click();
  await passwordInput.fill(password);
  await sleep(300);

  // Click sign in button
  const signInBtn = page.locator('button:has-text("Sign In"), button:has-text("Log In"), button[type="submit"]').first();
  await signInBtn.click();

  // Wait for navigation
  await page.waitForURL((url) => !url.pathname.includes("sign-in"), { timeout: 15000 }).catch(() => {});
  await sleep(PAGE_LOAD_WAIT);
}

async function hoverCards(page, selector) {
  const cards = page.locator(selector);
  const count = await cards.count();
  for (let i = 0; i < Math.min(count, 6); i++) {
    try {
      await cards.nth(i).hover({ timeout: 2000 });
      await sleep(500);
    } catch {
      // Card off-screen or not hoverable
    }
  }
}

async function navigateSidebar(page, items) {
  for (const item of items) {
    try {
      // Try clicking sidebar link
      const link = page.locator(`nav a:has-text("${item}"), aside a:has-text("${item}"), [class*="sidebar"] a:has-text("${item}")`).first();
      if (await link.isVisible({ timeout: 2000 })) {
        await link.click();
        await sleep(PAGE_LOAD_WAIT);
        // Wait for content to settle
        await page.waitForLoadState("domcontentloaded").catch(() => {});
        await sleep(1000);
      }
    } catch {
      // Link may not exist — skip
    }
  }
}

// ── Scene Definitions ─────────────────────────────────────
const SCENES = {
  /** 1. Landing page — full smooth scroll */
  landing: {
    label: "Landing Page Tour",
    requiresAuth: false,
    viewport: VIEWPORT,
    async run(page) {
      await page.goto(BASE_URL, { waitUntil: "domcontentloaded", timeout: 60000 });
      await sleep(PAGE_LOAD_WAIT);

      // Pause on hero
      await sleep(2000);

      // Hover over nav items
      for (const label of ["Features", "Dash AI", "For Schools", "Programs", "Pricing", "FAQ"]) {
        try {
          const navLink = page.locator(`nav a:has-text("${label}"), header a:has-text("${label}")`).first();
          if (await navLink.isVisible({ timeout: 1000 })) {
            await navLink.hover();
            await sleep(400);
          }
        } catch { /* skip */ }
      }

      // Smooth scroll through entire page
      await smoothScroll(page, { step: 250, pause: 700 });

      // Scroll sections individually for emphasis
      for (const section of ["features", "dash-ai", "roles", "programs", "pricing", "faq"]) {
        await scrollToSection(page, section);
      }

      // Hover feature cards
      await hoverCards(page, '[class*="featureCard"]');
      await sleep(500);

      // Hover role cards
      await hoverCards(page, '[class*="roleCard"]');
      await sleep(500);

      // Scroll back to top
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: "smooth" }));
      await sleep(2000);
    },
  },

  /** 2. Landing page on mobile */
  landing_mobile: {
    label: "Landing Page (Mobile)",
    requiresAuth: false,
    viewport: MOBILE_VIEWPORT,
    async run(page) {
      await page.goto(BASE_URL, { waitUntil: "domcontentloaded", timeout: 60000 });
      await sleep(PAGE_LOAD_WAIT);

      // Pause on hero
      await sleep(2000);

      // Open mobile menu if hamburger exists
      try {
        const hamburger = page.locator('[class*="hamburger"], [class*="menuToggle"], button[aria-label*="menu"]').first();
        if (await hamburger.isVisible({ timeout: 2000 })) {
          await hamburger.click();
          await sleep(1200);
          await hamburger.click();
          await sleep(600);
        }
      } catch { /* no hamburger */ }

      // Smooth scroll through
      await smoothScroll(page, { step: 200, pause: 500 });

      // Back to top
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: "smooth" }));
      await sleep(1500);
    },
  },

  /** 3. Sign-in page */
  signin: {
    label: "Sign In Page",
    requiresAuth: false,
    viewport: VIEWPORT,
    async run(page) {
      await page.goto(`${BASE_URL}/sign-in`, { waitUntil: "domcontentloaded", timeout: 60000 });
      await sleep(PAGE_LOAD_WAIT);

      // Hover the form fields
      try {
        const emailInput = page.locator('input[type="email"]').first();
        await emailInput.click();
        await emailInput.type("demo@school.co.za", { delay: 60 });
        await sleep(600);

        const passInput = page.locator('input[type="password"]').first();
        await passInput.click();
        await passInput.type("••••••••", { delay: 80 });
        await sleep(800);

        // Hover Google OAuth button
        const googleBtn = page.locator('button:has-text("Google")').first();
        if (await googleBtn.isVisible({ timeout: 1500 })) {
          await googleBtn.hover();
          await sleep(800);
        }
      } catch { /* Continue */ }

      await sleep(1500);
    },
  },

  /** 4. Sign-up pages */
  signup: {
    label: "Registration Pages",
    requiresAuth: false,
    viewport: VIEWPORT,
    async run(page) {
      for (const role of ["parent", "teacher", "principal"]) {
        await page.goto(`${BASE_URL}/sign-up/${role}`, { waitUntil: "domcontentloaded", timeout: 60000 });
        await sleep(PAGE_LOAD_WAIT);
        await smoothScroll(page, { step: 200, pause: 400 });
        await page.evaluate(() => window.scrollTo({ top: 0, behavior: "smooth" }));
        await sleep(1000);
      }
    },
  },

  /** 5. Pricing page */
  pricing: {
    label: "Pricing Page",
    requiresAuth: false,
    viewport: VIEWPORT,
    async run(page) {
      await page.goto(`${BASE_URL}/pricing`, { waitUntil: "domcontentloaded", timeout: 60000 });
      await sleep(PAGE_LOAD_WAIT);
      await smoothScroll(page, { step: 250, pause: 600 });
      await hoverCards(page, '[class*="card"], [class*="tier"], [class*="plan"]');
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: "smooth" }));
      await sleep(1500);
    },
  },

  /** 6. Parent Dashboard */
  parent: {
    label: "Parent Dashboard",
    requiresAuth: true,
    role: "parent",
    viewport: VIEWPORT,
    async run(page) {
      await navigateSidebar(page, [
        "Dashboard",
        "Homework",
        "Attendance",
        "Messages",
        "My Children",
        "Payments",
        "Dash AI",
        "Dashboard",
      ]);

      // Scroll dashboard content
      await smoothScroll(page, { step: 250, pause: 500 });
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: "smooth" }));
      await sleep(1500);
    },
  },

  /** 7. Teacher Dashboard */
  teacher: {
    label: "Teacher Dashboard",
    requiresAuth: true,
    role: "teacher",
    viewport: VIEWPORT,
    async run(page) {
      await navigateSidebar(page, [
        "Dashboard",
        "Lesson Plans",
        "Assignments",
        "My Classes",
        "Attendance",
        "Messages",
        "Student Reports",
        "AI Assistant",
        "Dashboard",
      ]);

      await smoothScroll(page, { step: 250, pause: 500 });
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: "smooth" }));
      await sleep(1500);
    },
  },

  /** 8. Principal Dashboard */
  principal: {
    label: "Principal Dashboard",
    requiresAuth: true,
    role: "principal",
    viewport: VIEWPORT,
    async run(page) {
      await navigateSidebar(page, [
        "Dashboard",
        "Students",
        "Teachers",
        "Financials",
        "Registrations",
        "Calendar",
        "Reports",
        "Settings",
        "Dashboard",
      ]);

      await smoothScroll(page, { step: 250, pause: 500 });
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: "smooth" }));
      await sleep(1500);
    },
  },

  /** 9. Super Admin Dashboard */
  admin: {
    label: "Super Admin Dashboard",
    requiresAuth: true,
    role: "admin",
    viewport: VIEWPORT,
    async run(page) {
      // Admin routes are under /admin
      await navigateSidebar(page, [
        "Dashboard",
        "User Management",
        "Registrations",
        "Promotions",
        "AI Configuration",
        "Dashboard",
      ]);

      await smoothScroll(page, { step: 250, pause: 500 });
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: "smooth" }));
      await sleep(1500);
    },
  },

  /** 10. Aftercare page */
  aftercare: {
    label: "Aftercare Page",
    requiresAuth: false,
    viewport: VIEWPORT,
    async run(page) {
      await page.goto(`${BASE_URL}/aftercare`, { waitUntil: "domcontentloaded", timeout: 60000 });
      await sleep(PAGE_LOAD_WAIT);
      await smoothScroll(page, { step: 250, pause: 600 });
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: "smooth" }));
      await sleep(1500);
    },
  },
};

// ── Main Runner ───────────────────────────────────────────
async function main() {
  // Parse --scenes flag
  const scenesArg = process.argv.find((a) => a.startsWith("--scenes="));
  const requestedScenes = scenesArg
    ? scenesArg.split("=")[1].split(",").map((s) => s.trim())
    : null;

  // Create output directory
  if (!existsSync(OUTPUT_DIR)) mkdirSync(OUTPUT_DIR, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const results = [];

  console.log("\n🎬 EduDash Pro — Dashboard Video Recorder");
  console.log(`   Base URL:   ${BASE_URL}`);
  console.log(`   Output:     ${OUTPUT_DIR}`);
  console.log(`   Timestamp:  ${timestamp}\n`);

  // Ensure the dev server is running (auto-starts if needed)
  let serverProcess = null;
  try {
    serverProcess = await ensureDevServer();
  } catch (err) {
    console.error(`\n❌ ${err.message}`);
    process.exit(1);
  }

  const scenesToRun = Object.entries(SCENES).filter(([key]) => {
    if (requestedScenes) return requestedScenes.includes(key);
    return true;
  });

  for (const [sceneName, scene] of scenesToRun) {
    // Check if auth is required and credentials are available
    if (scene.requiresAuth) {
      const cred = CREDS[scene.role];
      if (!cred?.email || !cred?.password) {
        console.log(`⏭  Skipping "${scene.label}" — no ${scene.role.toUpperCase()}_EMAIL / ${scene.role.toUpperCase()}_PASSWORD env vars`);
        results.push({ scene: sceneName, label: scene.label, status: "skipped", reason: "no credentials" });
        continue;
      }
    }

    const videoDir = join(OUTPUT_DIR, `${sceneName}_${timestamp}`);
    mkdirSync(videoDir, { recursive: true });

    console.log(`🔴 Recording: ${scene.label}...`);

    const browser = await chromium.launch({
      headless: true,
      slowMo: SLOW_MO,
    });

    try {
      const context = await browser.newContext({
        viewport: scene.viewport,
        recordVideo: {
          dir: videoDir,
          size: scene.viewport,
        },
        colorScheme: "dark",
        locale: "en-ZA",
        timezoneId: "Africa/Johannesburg",
        deviceScaleFactor: 2, // Retina-quality recording
      });

      const page = await context.newPage();

      // If auth required, sign in first
      if (scene.requiresAuth) {
        const cred = CREDS[scene.role];
        console.log(`   🔐 Signing in as ${scene.role}...`);
        await signIn(page, cred.email, cred.password);
      }

      // Run the scene
      await scene.run(page);

      // Close context to finalize video
      await context.close();

      // Find the generated video file
      const { readdirSync, renameSync } = await import("fs");
      const files = readdirSync(videoDir).filter((f) => f.endsWith(".webm"));
      if (files.length > 0) {
        const srcPath = join(videoDir, files[0]);
        const destPath = join(OUTPUT_DIR, `${sceneName}_${timestamp}.webm`);
        renameSync(srcPath, destPath);
        // Clean up temp dir
        const { rmSync } = await import("fs");
        rmSync(videoDir, { recursive: true, force: true });

        console.log(`   ✅ Saved: ${destPath}`);
        results.push({ scene: sceneName, label: scene.label, status: "success", file: destPath });
      } else {
        console.log(`   ⚠️  No video file generated`);
        results.push({ scene: sceneName, label: scene.label, status: "no-video" });
      }
    } catch (err) {
      console.log(`   ❌ Error: ${err.message}`);
      results.push({ scene: sceneName, label: scene.label, status: "error", error: err.message });
    } finally {
      await browser.close();
    }
  }

  // ── Summary ─────────────────────────────────────────────
  console.log("\n" + "─".repeat(60));
  console.log("📊 Recording Summary\n");

  const successful = results.filter((r) => r.status === "success");
  const skipped = results.filter((r) => r.status === "skipped");
  const failed = results.filter((r) => r.status === "error" || r.status === "no-video");

  if (successful.length > 0) {
    console.log(`✅ Recorded ${successful.length} video(s):`);
    for (const r of successful) console.log(`   • ${r.label}: ${r.file}`);
  }

  if (skipped.length > 0) {
    console.log(`\n⏭  Skipped ${skipped.length} scene(s) (set env vars to record them):`);
    for (const r of skipped) console.log(`   • ${r.label} (${r.reason})`);
  }

  if (failed.length > 0) {
    console.log(`\n❌ Failed ${failed.length} scene(s):`);
    for (const r of failed) console.log(`   • ${r.label}: ${r.error || "no video generated"}`);
  }

  console.log("\n💡 To convert .webm to .mp4:");
  console.log("   ffmpeg -i recording.webm -c:v libx264 -crf 20 -preset slow output.mp4\n");

  console.log("💡 To record authenticated dashboards:");
  console.log("   PARENT_EMAIL=... PARENT_PASSWORD=... node scripts/record-dashboard-videos.mjs\n");

  // Stop the dev server if we started it
  stopServer(serverProcess);
}

main().catch(console.error);
