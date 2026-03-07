import type { DisplayData } from '@/lib/display/types';

const REMINDER_THRESHOLDS = [15, 10, 5] as const;

type OfflinePackSource = 'routine' | 'lesson';

export type OfflinePackScheduleItem = {
  id: string;
  title: string;
  source: OfflinePackSource;
  startTime: string;
  endTime: string;
  durationMinutes: number;
};

export type OfflineTvPackPayload = {
  version: 1;
  generatedAt: string;
  orgId: string | null;
  classId: string | null;
  dayName: string;
  dateLabel: string;
  routineTitle: string | null;
  routineSummary: string | null;
  schedule: OfflinePackScheduleItem[];
  data: DisplayData;
};

function clampMinute(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(24 * 60 - 1, Math.floor(value)));
}

function parseClockToMinutes(clock: string | null | undefined): number | null {
  const raw = String(clock || '').trim();
  const m = raw.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(mm) || h < 0 || h > 23 || mm < 0 || mm > 59) return null;
  return h * 60 + mm;
}

function formatMinutesAsClock(totalMinutes: number): string {
  const minute = clampMinute(totalMinutes);
  const h = Math.floor(minute / 60);
  const m = minute % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function isoToClock(value: string): string | null {
  const d = new Date(value);
  const ms = d.getTime();
  if (!Number.isFinite(ms)) return null;
  const hh = d.getHours();
  const mm = d.getMinutes();
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

function buildSchedule(data: DisplayData): OfflinePackScheduleItem[] {
  const schedule: OfflinePackScheduleItem[] = [];

  (data.routine?.blocks || []).forEach((block) => {
    const startTime = block.startTime || null;
    const endTime = block.endTime || null;
    if (!startTime || !endTime) return;
    const startMin = parseClockToMinutes(startTime);
    const endMin = parseClockToMinutes(endTime);
    if (startMin == null || endMin == null || endMin <= startMin) return;
    schedule.push({
      id: `routine:${block.id}`,
      title: block.title || 'Routine block',
      source: 'routine',
      startTime: formatMinutesAsClock(startMin),
      endTime: formatMinutesAsClock(endMin),
      durationMinutes: Math.max(1, endMin - startMin),
    });
  });

  (data.lessons || []).forEach((lesson) => {
    const start = isoToClock(lesson.scheduled_at);
    if (!start) return;
    const startMin = parseClockToMinutes(start);
    if (startMin == null) return;
    const duration = Number(lesson.duration_minutes) || 30;
    const endMin = startMin + duration;
    schedule.push({
      id: `lesson:${lesson.id}`,
      title: lesson.title || 'Lesson',
      source: 'lesson',
      startTime: formatMinutesAsClock(startMin),
      endTime: formatMinutesAsClock(endMin),
      durationMinutes: Math.max(1, duration),
    });
  });

  return schedule.sort((a, b) => {
    const aMin = parseClockToMinutes(a.startTime) ?? 0;
    const bMin = parseClockToMinutes(b.startTime) ?? 0;
    return aMin - bMin;
  });
}

function triggerDownload(filename: string, content: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1200);
}

function triggerDataUrlDownload(filename: string, dataUrl: string): void {
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function chunkArray<T>(items: T[], size: number): T[][] {
  if (!items.length) return [];
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function normalizeSlideLine(value: string, maxChars = 78): string {
  const normalized = String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!normalized) return '';
  if (normalized.length <= maxChars) return normalized;
  return `${normalized.slice(0, Math.max(0, maxChars - 1)).trim()}…`;
}

function wrapLine(value: string, maxChars = 78): string[] {
  const line = normalizeSlideLine(value, maxChars * 3);
  if (!line) return [];
  const words = line.split(' ');
  const out: string[] = [];
  let current = '';
  words.forEach((word) => {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= maxChars) {
      current = candidate;
      return;
    }
    if (current) out.push(current);
    current = word.length <= maxChars ? word : `${word.slice(0, maxChars - 1)}…`;
  });
  if (current) out.push(current);
  return out.slice(0, 2);
}

type ClassicSlide = {
  title: string;
  subtitle?: string;
  lines: string[];
};

function buildClassicSlides(payload: OfflineTvPackPayload): ClassicSlide[] {
  const { data } = payload;
  const menuItems =
    (data.menuToday?.breakfast?.length || 0) +
    (data.menuToday?.lunch?.length || 0) +
    (data.menuToday?.snack?.length || 0);

  const slides: ClassicSlide[] = [
    {
      title: 'EduDash Pro Daily Room Display',
      subtitle: `${payload.dayName}, ${payload.dateLabel}`,
      lines: [
        payload.routineTitle ? `Theme: ${payload.routineTitle}` : 'Theme: Not published',
        `Routine blocks: ${data.routine?.blocks?.length || 0}`,
        `Lessons: ${data.lessons?.length || 0}`,
        `Menu items: ${menuItems}`,
        `Announcements: ${data.announcements?.length || 0}`,
        'For standard TVs, use slideshow mode (10-20 sec interval, loop on).',
      ],
    },
  ];

  const routineLines = (data.routine?.blocks || []).map((block) =>
    `${block.startTime || '--:--'}-${block.endTime || '--:--'}  ${block.title || 'Routine block'}`
  );
  if (routineLines.length) {
    chunkArray(routineLines, 10).forEach((chunk, idx) => {
      slides.push({
        title: idx === 0 ? "Today's routine" : "Today's routine (cont.)",
        lines: chunk,
      });
    });
  } else {
    slides.push({
      title: "Today's routine",
      lines: ['No routine blocks found for today.'],
    });
  }

  const lessonLines = (data.lessons || []).map((lesson) => {
    const d = new Date(lesson.scheduled_at);
    const time = Number.isNaN(d.getTime())
      ? '--:--'
      : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const duration = Number(lesson.duration_minutes) || 0;
    const durationText = duration > 0 ? ` (${duration} min)` : '';
    return `${time}  ${lesson.title || 'Lesson'}${durationText}`;
  });
  if (lessonLines.length) {
    chunkArray(lessonLines, 10).forEach((chunk, idx) => {
      slides.push({
        title: idx === 0 ? "Today's lessons" : "Today's lessons (cont.)",
        lines: chunk,
      });
    });
  } else {
    slides.push({
      title: "Today's lessons",
      lines: ['No scheduled lessons for today.'],
    });
  }

  const menuLines: string[] = [];
  if (data.menuToday?.breakfast?.length) {
    menuLines.push(`Breakfast: ${data.menuToday.breakfast.join(', ')}`);
  }
  if (data.menuToday?.lunch?.length) {
    menuLines.push(`Lunch: ${data.menuToday.lunch.join(', ')}`);
  }
  if (data.menuToday?.snack?.length) {
    menuLines.push(`Snack: ${data.menuToday.snack.join(', ')}`);
  }
  slides.push({
    title: "Today's menu",
    lines: menuLines.length ? menuLines : ['Menu is not published for today.'],
  });

  const announcementLines = (data.announcements || []).map((item) => {
    const body = normalizeSlideLine(item.body_preview || '', 60);
    return body ? `${item.title}: ${body}` : item.title;
  });
  slides.push({
    title: 'Announcements',
    lines: announcementLines.length ? announcementLines : ['No announcements queued.'],
  });

  slides.push({
    title: 'Reminder cadence',
    lines: [
      '15 minutes before next block: prepare transition.',
      '10 minutes before: start wrap-up instructions.',
      '5 minutes before: final transition cue.',
      'Tip: keep the TV slideshow in loop mode.',
    ],
  });

  return slides;
}

function renderClassicSlide(
  payload: OfflineTvPackPayload,
  slide: ClassicSlide,
  index: number,
  total: number,
): HTMLCanvasElement {
  const width = 1920;
  const height = 1080;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  const bg = ctx.createLinearGradient(0, 0, width, height);
  bg.addColorStop(0, '#060915');
  bg.addColorStop(0.55, '#0a1020');
  bg.addColorStop(1, '#070c17');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  const glow = ctx.createRadialGradient(width * 0.85, -40, 80, width * 0.85, -40, 560);
  glow.addColorStop(0, 'rgba(124,58,237,0.34)');
  glow.addColorStop(1, 'rgba(124,58,237,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = 'rgba(10,20,42,0.78)';
  ctx.fillRect(80, 84, width - 160, height - 168);

  ctx.fillStyle = '#c4b5fd';
  ctx.font = '700 26px "Segoe UI", Arial, sans-serif';
  ctx.fillText('EduDash Pro • Offline TV Pack', 120, 138);

  ctx.fillStyle = '#f8fafc';
  ctx.font = '800 62px "Segoe UI", Arial, sans-serif';
  ctx.fillText(slide.title, 120, 232);

  if (slide.subtitle) {
    ctx.fillStyle = '#cbd5e1';
    ctx.font = '500 34px "Segoe UI", Arial, sans-serif';
    ctx.fillText(slide.subtitle, 120, 284);
  }

  let y = 360;
  const lineGap = 56;
  slide.lines.forEach((rawLine) => {
    const wrapped = wrapLine(rawLine, 82);
    wrapped.forEach((line, lineIndex) => {
      if (y > height - 160) return;
      if (lineIndex === 0) {
        ctx.fillStyle = '#8b5cf6';
        ctx.beginPath();
        ctx.arc(130, y - 12, 6, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = '#e2e8f0';
      ctx.font = lineIndex === 0
        ? '600 36px "Segoe UI", Arial, sans-serif'
        : '500 31px "Segoe UI", Arial, sans-serif';
      ctx.fillText(line, lineIndex === 0 ? 150 : 178, y);
      y += lineIndex === 0 ? lineGap : 46;
    });
  });

  ctx.fillStyle = '#94a3b8';
  ctx.font = '500 26px "Segoe UI", Arial, sans-serif';
  ctx.fillText(`Generated ${new Date(payload.generatedAt).toLocaleString()}`, 120, height - 78);
  ctx.fillText(`Slide ${index + 1}/${total}`, width - 260, height - 78);

  return canvas;
}

function buildReadme(payload: OfflineTvPackPayload): string {
  return [
    'EduDash Pro - Offline TV Pack',
    '',
    `Generated: ${payload.generatedAt}`,
    `Day: ${payload.dayName}, ${payload.dateLabel}`,
    '',
    'FILES',
    '- edudash-room-display-offline-<date>.html: Self-running offline display page with reminders/chimes.',
    '- edudash-room-display-offline-<date>.json: Raw routine/lesson payload.',
    '- edudash-room-display-offline-<date>-slide-##.png: Standard-TV-safe slideshow images.',
    '- edudash-room-display-offline-<date>-README.txt: This guide.',
    '',
    'USB USE - SMART TV / BROWSER TV',
    '1. Copy the HTML file to your USB.',
    '2. Insert USB into a device/TV browser that can open local HTML files.',
    '3. Open the HTML file and set TV to fullscreen mode.',
    '4. Sound is enabled by default for 15/10/5-minute reminder chimes.',
    '',
    'USB USE - NORMAL TV (NO BROWSER)',
    '1. Copy the slide PNG files to USB.',
    '2. Open the TV photo viewer and start slideshow mode.',
    '3. Set interval to 10-20 seconds and turn loop/repeat on.',
    '4. Keep TV in landscape fullscreen for all-day display.',
    '',
    'IMPORTANT',
    '- Normal TVs cannot execute HTML/JS from USB; use the PNG slide files on those TVs.',
    '- For live reminders/chimes, use a browser-capable TV or HDMI mini-PC.',
  ].join('\n');
}

function buildOfflineHtml(payload: OfflineTvPackPayload): string {
  const serialized = JSON.stringify(payload).replace(/</g, '\\u003c');
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>EduDash Offline Room Display</title>
  <style>
    :root{
      --bg:#060915;
      --panel:#0f172abf;
      --line:rgba(148,163,184,.28);
      --text:#f8fafc;
      --muted:#cbd5e1;
      --primary:#7c3aed;
      --cyan:#22d3ee;
      --pink:#ec4899;
      --ok:#22c55e;
      --warn:#f59e0b;
    }
    *{box-sizing:border-box;margin:0;padding:0}
    body{
      min-height:100vh;
      color:var(--text);
      font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial;
      background:
        radial-gradient(1100px 650px at 8% -10%, rgba(124,58,237,.34), transparent 60%),
        radial-gradient(900px 560px at 92% 0%, rgba(34,211,238,.22), transparent 64%),
        radial-gradient(700px 480px at 60% 100%, rgba(236,72,153,.18), transparent 70%),
        linear-gradient(170deg, #03050f 0%, #070b1d 58%, #05070f 100%);
      padding:22px;
    }
    .shell{
      max-width:1400px;
      margin:0 auto;
      border:1px solid rgba(255,255,255,.08);
      background:rgba(2,6,23,.62);
      border-radius:24px;
      backdrop-filter:blur(12px);
      box-shadow:0 30px 90px -44px rgba(0,0,0,.9);
      padding:18px;
    }
    .top{
      display:grid;
      grid-template-columns:1.2fr 1fr auto;
      gap:12px;
      align-items:stretch;
      margin-bottom:14px;
    }
    .hero,.status,.controls,.panel{
      border:1px solid var(--line);
      border-radius:16px;
      background:linear-gradient(130deg, rgba(15,23,42,.92), rgba(17,24,39,.7));
    }
    .hero{padding:14px 16px}
    .hero h1{font-size:38px;line-height:1.02;font-weight:900;letter-spacing:-.02em}
    .hero p{margin-top:7px;color:var(--muted);font-size:15px}
    .status{
      padding:14px 16px;
      display:grid;
      grid-template-columns:1fr 1fr;
      gap:10px;
      align-content:center;
    }
    .chip{
      border:1px solid rgba(148,163,184,.34);
      border-radius:12px;
      padding:8px 10px;
      background:rgba(15,23,42,.6);
    }
    .chip b{display:block;font-size:19px;line-height:1.1}
    .chip span{font-size:12px;color:var(--muted);text-transform:uppercase;letter-spacing:.08em}
    .controls{
      padding:12px;
      display:grid;
      gap:8px;
      min-width:180px;
      align-content:center;
    }
    button{
      border:0;
      border-radius:11px;
      color:white;
      background:linear-gradient(135deg,var(--primary),var(--pink));
      padding:10px 12px;
      font-weight:700;
      font-size:13px;
      cursor:pointer;
    }
    button.secondary{
      background:rgba(15,23,42,.9);
      border:1px solid rgba(148,163,184,.38);
    }
    .alert{
      margin-bottom:12px;
      border:1px solid rgba(251,191,36,.42);
      background:rgba(245,158,11,.16);
      border-radius:14px;
      padding:11px 13px;
      display:none;
    }
    .grid{
      display:grid;
      grid-template-columns:1.08fr 1fr;
      gap:12px;
    }
    .panel{padding:14px}
    .panel h2{font-size:17px;font-weight:800;margin-bottom:10px}
    .currentTitle{font-size:26px;font-weight:900;line-height:1.05}
    .meta{margin-top:7px;color:var(--muted);font-size:14px}
    .bar{
      margin-top:10px;
      height:8px;
      border-radius:999px;
      overflow:hidden;
      background:rgba(15,23,42,.95);
      border:1px solid rgba(148,163,184,.3);
    }
    .bar > i{
      display:block;
      width:0%;
      height:100%;
      background:linear-gradient(90deg,var(--cyan),#38bdf8,var(--ok));
      transition:width .25s linear;
    }
    .timeline{display:grid;gap:8px;max-height:58vh;overflow:auto;padding-right:4px}
    .item{
      border:1px solid rgba(148,163,184,.28);
      border-radius:12px;
      padding:10px 12px;
      background:rgba(15,23,42,.56);
    }
    .item.now{
      border-color:rgba(34,211,238,.6);
      background:linear-gradient(120deg, rgba(34,211,238,.16), rgba(124,58,237,.14));
      box-shadow:0 18px 38px -30px rgba(34,211,238,.9);
    }
    .item .line1{
      display:flex;
      justify-content:space-between;
      gap:8px;
      align-items:center;
      margin-bottom:4px;
    }
    .item .line1 b{font-size:14px}
    .badge{
      border-radius:999px;
      border:1px solid rgba(148,163,184,.45);
      padding:2px 8px;
      font-size:11px;
      text-transform:uppercase;
      letter-spacing:.08em;
      color:var(--muted);
    }
    .time{font-size:12px;color:var(--muted)}
    .foot{
      margin-top:10px;
      color:var(--muted);
      font-size:12px;
      text-align:center;
    }
    @media (max-width:1024px){
      .top{grid-template-columns:1fr}
      .grid{grid-template-columns:1fr}
      .hero h1{font-size:28px}
    }
  </style>
</head>
<body>
  <div class="shell">
    <section class="top">
      <div class="hero">
        <h1>EduDash Pro Room Display</h1>
        <p id="dateLine">Offline mode</p>
      </div>
      <div class="status">
        <div class="chip"><span>Current Time</span><b id="clock">--:--</b></div>
        <div class="chip"><span>Next Reminder</span><b id="nextReminder">None</b></div>
        <div class="chip"><span>Blocks Today</span><b id="blockCount">0</b></div>
        <div class="chip"><span>Sound</span><b id="soundLabel">On</b></div>
      </div>
      <div class="controls">
        <button id="soundToggle" class="secondary">Sound: On</button>
        <button id="refreshBtn" class="secondary">Refresh Now</button>
      </div>
    </section>

    <section id="alertBox" class="alert"></section>

    <section class="grid">
      <article class="panel">
        <h2>Current Block Now</h2>
        <div class="currentTitle" id="currentTitle">No active block right now</div>
        <p class="meta" id="currentMeta">Waiting for the next scheduled activity.</p>
        <div class="bar"><i id="progressFill"></i></div>
      </article>
      <article class="panel">
        <h2>Upcoming (15/10/5)</h2>
        <div class="timeline" id="upcomingList"></div>
      </article>
    </section>

    <section class="panel" style="margin-top:12px;">
      <h2>Full Day Timeline</h2>
      <div class="timeline" id="timeline"></div>
    </section>

    <p class="foot">Generated offline pack from EduDash Pro. Keep this file on USB for local playback.</p>
  </div>

  <script>
    const PACK = ${serialized};
    const THRESHOLDS = ${JSON.stringify(REMINDER_THRESHOLDS)};
    const state = { sound: true, fired: new Set() };

    const byId = (id) => document.getElementById(id);
    const dateLine = byId('dateLine');
    const clockNode = byId('clock');
    const nextReminderNode = byId('nextReminder');
    const blockCountNode = byId('blockCount');
    const soundLabel = byId('soundLabel');
    const soundToggle = byId('soundToggle');
    const alertBox = byId('alertBox');
    const currentTitle = byId('currentTitle');
    const currentMeta = byId('currentMeta');
    const progressFill = byId('progressFill');
    const upcomingList = byId('upcomingList');
    const timeline = byId('timeline');

    function parseClock(clock) {
      const m = String(clock || '').trim().match(/^(\\d{1,2}):(\\d{2})$/);
      if (!m) return null;
      const h = Number(m[1]); const mm = Number(m[2]);
      if (!Number.isFinite(h) || !Number.isFinite(mm) || h < 0 || h > 23 || mm < 0 || mm > 59) return null;
      return h * 60 + mm;
    }
    function fmtClock(minute) {
      const x = Math.max(0, Math.min(1439, Math.floor(minute)));
      const h = Math.floor(x / 60); const m = x % 60;
      return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
    }
    function minuteNow() {
      const d = new Date();
      return d.getHours() * 60 + d.getMinutes();
    }
    function playChime(threshold) {
      try {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return;
        const ctx = new Ctx();
        const gain = ctx.createGain();
        gain.gain.value = threshold === 5 ? 0.3 : threshold === 10 ? 0.24 : 0.2;
        gain.connect(ctx.destination);
        const signature = {
          15: [523, 659],
          10: [659, 784, 659],
          5: [880, 988, 1174, 988],
        };
        const tones = signature[threshold] || [660, 880];
        let cursor = ctx.currentTime;
        tones.forEach((freq) => {
          const osc = ctx.createOscillator();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(freq, cursor);
          osc.connect(gain);
          osc.start(cursor);
          osc.stop(cursor + 0.25);
          cursor += 0.34;
        });
        setTimeout(() => ctx.close(), 2200);
      } catch {}
    }
    function normalizeItems() {
      return (PACK.schedule || [])
        .map((item) => {
          const start = parseClock(item.startTime);
          const end = parseClock(item.endTime);
          if (start == null || end == null || end <= start) return null;
          return { ...item, start, end };
        })
        .filter(Boolean)
        .sort((a, b) => a.start - b.start);
    }
    function render() {
      const nowDate = new Date();
      const nowMin = minuteNow();
      clockNode.textContent = nowDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      dateLine.textContent = PACK.dayName + ', ' + PACK.dateLabel + ' • Offline USB mode';
      soundLabel.textContent = state.sound ? 'On' : 'Off';
      soundToggle.textContent = 'Sound: ' + (state.sound ? 'On' : 'Off');

      const items = normalizeItems();
      blockCountNode.textContent = String(items.length);
      const current = items.find((x) => nowMin >= x.start && nowMin < x.end) || null;
      const upcoming = items.filter((x) => x.start > nowMin);
      const next = upcoming[0] || null;
      nextReminderNode.textContent = next ? ('in ' + (next.start - nowMin) + ' min') : 'None';

      if (current) {
        const pct = Math.max(0, Math.min(100, ((nowMin - current.start) / (current.end - current.start)) * 100));
        currentTitle.textContent = current.title;
        currentMeta.textContent = fmtClock(current.start) + ' - ' + fmtClock(current.end) + ' • ' + Math.max(0, current.end - nowMin) + ' min left';
        progressFill.style.width = pct.toFixed(1) + '%';
      } else {
        currentTitle.textContent = next ? ('Up next: ' + next.title) : 'No active block right now';
        currentMeta.textContent = next ? ('Starts at ' + fmtClock(next.start) + ' • in ' + (next.start - nowMin) + ' min') : 'Schedule complete for now.';
        progressFill.style.width = '0%';
      }

      upcomingList.innerHTML = '';
      (upcoming.slice(0, 4)).forEach((item) => {
        const card = document.createElement('div');
        card.className = 'item';
        card.innerHTML = '<div class="line1"><b>' + item.title + '</b><span class="badge">' + item.source + '</span></div>' +
          '<div class="time">' + fmtClock(item.start) + ' - ' + fmtClock(item.end) + ' • in ' + (item.start - nowMin) + ' min</div>';
        upcomingList.appendChild(card);
      });
      if (!upcoming.length) {
        const empty = document.createElement('div');
        empty.className = 'item';
        empty.innerHTML = '<div class="time">No upcoming schedule items found.</div>';
        upcomingList.appendChild(empty);
      }

      timeline.innerHTML = '';
      items.forEach((item) => {
        const card = document.createElement('div');
        const active = nowMin >= item.start && nowMin < item.end;
        card.className = 'item' + (active ? ' now' : '');
        card.innerHTML = '<div class="line1"><b>' + item.title + '</b><span class="badge">' + item.source + '</span></div>' +
          '<div class="time">' + fmtClock(item.start) + ' - ' + fmtClock(item.end) + ' • ' + item.durationMinutes + ' min</div>';
        timeline.appendChild(card);
      });

      alertBox.style.display = 'none';
      if (next) {
        const remain = next.start - nowMin;
        const threshold = THRESHOLDS.find((t) => remain <= t && remain > t - 1);
        if (threshold != null) {
          const key = next.id + ':' + threshold;
          if (!state.fired.has(key)) {
            state.fired.add(key);
            if (state.sound) playChime(threshold);
            alertBox.style.display = 'block';
            alertBox.textContent = threshold + '-minute reminder • ' + next.title;
          }
        }
      }
    }

    soundToggle.addEventListener('click', () => {
      state.sound = !state.sound;
      render();
    });
    byId('refreshBtn').addEventListener('click', render);

    render();
    setInterval(render, 30000);
  </script>
</body>
</html>`;
}

export function buildOfflineTvPackPayload(
  data: DisplayData,
  options: { orgId: string | null; classId: string | null },
): OfflineTvPackPayload {
  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    orgId: options.orgId,
    classId: options.classId,
    dayName: data.dayName,
    dateLabel: data.dateLabel,
    routineTitle: data.routine?.title || data.themeLabel || null,
    routineSummary: data.routine?.summary || null,
    schedule: buildSchedule(data),
    data,
  };
}

export function exportOfflineTvPack(payload: OfflineTvPackPayload): void {
  const safeDate = String(payload.dateLabel || '').replace(/[^0-9-]/g, '') || 'today';
  const base = `edudash-room-display-offline-${safeDate}`;
  triggerDownload(`${base}.html`, buildOfflineHtml(payload), 'text/html;charset=utf-8');
  window.setTimeout(() => {
    triggerDownload(`${base}.json`, JSON.stringify(payload, null, 2), 'application/json;charset=utf-8');
  }, 120);
  window.setTimeout(() => {
    triggerDownload(`${base}-README.txt`, buildReadme(payload), 'text/plain;charset=utf-8');
  }, 240);

  const slides = buildClassicSlides(payload);
  slides.forEach((slide, index) => {
    window.setTimeout(() => {
      const canvas = renderClassicSlide(payload, slide, index, slides.length);
      const filename = `${base}-slide-${String(index + 1).padStart(2, '0')}.png`;
      triggerDataUrlDownload(filename, canvas.toDataURL('image/png'));
    }, 360 + index * 140);
  });
}
