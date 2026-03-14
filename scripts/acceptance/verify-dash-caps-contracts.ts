#!/usr/bin/env tsx

import fs from 'node:fs';
import path from 'node:path';

type Pattern = string | RegExp;

const ROOT = process.cwd();
const failures: string[] = [];

function abs(relPath: string): string {
  return path.join(ROOT, relPath);
}

function read(relPath: string): string {
  const full = abs(relPath);
  if (!fs.existsSync(full)) {
    throw new Error(`Missing file: ${relPath}`);
  }
  return fs.readFileSync(full, 'utf8');
}

function count(content: string, pattern: Pattern): number {
  if (typeof pattern === 'string') {
    if (!pattern) return 0;
    return content.split(pattern).length - 1;
  }
  const flags = pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`;
  const matches = content.match(new RegExp(pattern.source, flags));
  return matches ? matches.length : 0;
}

function expectContains(relPath: string, pattern: Pattern, label?: string) {
  const content = read(relPath);
  if (count(content, pattern) < 1) {
    failures.push(`${relPath}: expected to contain ${label || String(pattern)}`);
  }
}

function expectNotContains(relPath: string, pattern: Pattern, label?: string) {
  const content = read(relPath);
  if (count(content, pattern) > 0) {
    failures.push(`${relPath}: expected not to contain ${label || String(pattern)}`);
  }
}

function expectCountAtLeast(relPath: string, pattern: Pattern, min: number, label?: string) {
  const content = read(relPath);
  const found = count(content, pattern);
  if (found < min) {
    failures.push(
      `${relPath}: expected at least ${min} occurrences of ${label || String(pattern)}, found ${found}`
    );
  }
}

function dirExists(relDir: string): boolean {
  try {
    const stat = fs.statSync(abs(relDir));
    return stat.isDirectory();
  } catch {
    return false;
  }
}

function walkFiles(relDir: string, exts = new Set(['.ts', '.tsx', '.js', '.jsx'])): string[] {
  const start = abs(relDir);
  if (!fs.existsSync(start) || !fs.statSync(start).isDirectory()) {
    return [];
  }
  const out: string[] = [];
  const stack = [start];

  while (stack.length > 0) {
    const current = stack.pop()!;
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === 'node_modules' || entry.name === '.next' || entry.name === 'dist') continue;
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
      } else if (exts.has(path.extname(entry.name))) {
        out.push(path.relative(ROOT, full));
      }
    }
  }

  return out;
}

function findInTree(relDir: string, pattern: Pattern): Array<{ file: string; hits: number }> {
  const files = walkFiles(relDir);
  const hits: Array<{ file: string; hits: number }> = [];
  for (const file of files) {
    const content = read(file);
    const found = count(content, pattern);
    if (found > 0) {
      hits.push({ file, hits: found });
    }
  }
  return hits;
}

function checkNoLegacyEndpoint() {
  if (!dirExists('web/src')) return;
  const offenders = findInTree('web/src', '/api/ai/chat');
  if (offenders.length > 0) {
    const detail = offenders.map((o) => `${o.file}(${o.hits})`).join(', ');
    failures.push(`Legacy /api/ai/chat references remain in web callers: ${detail}`);
  }
}

function checkUseChatLogicContract() {
  if (!fs.existsSync(abs('web/src/hooks/useChatLogic.ts'))) return;
  const file = 'web/src/hooks/useChatLogic.ts';
  expectContains(file, "scope: 'parent' | 'teacher' | 'principal';", 'explicit scope union');
  expectContains(file, 'export function useChatLogic({ scope,', 'scope required in hook args');
  expectContains(file, 'scope,', 'request uses scope');
  expectContains(file, 'role: scope,', 'metadata role uses scope');
  expectNotContains(file, "role: 'parent'", 'parent-hardcoded metadata role');
}

function checkAskAIWidgetContract() {
  if (!fs.existsSync(abs('web/src/components/dashboard/AskAIWidget.tsx'))) return;
  const file = 'web/src/components/dashboard/AskAIWidget.tsx';
  expectContains(
    file,
    "scope: 'parent' | 'teacher' | 'principal' | 'student' | 'guest';",
    'explicit widget scope union'
  );
  expectContains(file, 'scope,', 'request scope forwarded');
  expectContains(file, 'role: scope,', 'metadata role uses scope');
  expectNotContains(file, "scope = 'parent'", 'parent default scope');
}

function checkChatInterfaceContract() {
  if (!fs.existsSync(abs('web/src/components/dash-chat/ChatInterface.tsx'))) return;
  const file = 'web/src/components/dash-chat/ChatInterface.tsx';
  expectContains(file, "scope: 'parent' | 'teacher' | 'principal';", 'scope required in props');
  expectContains(file, 'useChatLogic({', 'hook invocation exists');
  expectContains(file, 'scope,', 'scope passed to hook');
}

function checkDashChatCallsites() {
  if (!dirExists('web/src/app/dashboard')) return;
  expectContains('web/src/app/dashboard/parent/dash-chat/page.tsx', 'scope="parent"');
  expectContains('web/src/app/dashboard/teacher/dash-chat/page.tsx', 'scope="teacher"');
  expectContains('web/src/app/dashboard/principal/dash-chat/page.tsx', 'scope="principal"');
  expectContains('web/src/app/dashboard/teacher/dash-chat/page.tsx', 'userId={userId}', 'teacher userId pass-through');
}

function checkAskAIWidgetCallsites() {
  if (!dirExists('web/src')) return;
  expectContains('web/src/components/dashboard/principal/PrincipalSidebar.tsx', '<AskAIWidget scope="principal"');
  expectContains(
    'web/src/components/dashboard/principal/DashAIFullscreenModal.tsx',
    '<AskAIWidget scope="principal"'
  );
  expectContains('web/src/app/dashboard/parent/standalone/page.tsx', 'scope="parent"');
  expectContains('web/src/app/exam-prep/page.tsx', 'scope="student"');
}

function checkWebAiProxyCallers() {
  if (!dirExists('web/src/app/dashboard')) return;
  const files = [
    'web/src/app/dashboard/parent/messages/page.tsx',
    'web/src/app/dashboard/teacher/messages/page.tsx',
    'web/src/app/dashboard/principal/messages/page.tsx',
    'web/src/app/dashboard/principal/ai-year-planner/page.tsx',
  ];

  for (const file of files) {
    if (!fs.existsSync(abs(file))) continue;
    expectContains(file, '/api/ai-proxy', 'canonical web AI endpoint');
    expectNotContains(file, '/api/ai/chat', 'legacy web AI endpoint');
  }
}

function checkClientToolsMetadataBoundary() {
  if (!dirExists('web/src')) return;
  const offenders = findInTree('web/src', /client_tools\s*:/);
  if (offenders.length > 0) {
    const detail = offenders.map((o) => `${o.file}(${o.hits})`).join(', ');
    failures.push(`Unexpected client_tools metadata in web callers: ${detail}`);
  }
}

function checkAiProxyToolsAndExecution() {
  // ai-proxy was modularised — checks now target the specific module files.
  // config.ts owns the server-tool allow-list and CAPS tool name constants.
  const config = 'supabase/functions/ai-proxy/config.ts';
  expectContains(config, 'const SERVER_TOOL_NAMES = new Set([', 'server tool allow-list');
  expectContains(config, "'search_caps_curriculum'");
  expectContains(config, "'get_caps_documents'");
  expectContains(config, "'get_caps_subjects'");
  expectContains(config, "'caps_curriculum_query'");

  // tools/builders.ts owns the OpenAI + Anthropic tool-schema definitions.
  const builders = 'supabase/functions/ai-proxy/tools/builders.ts';
  expectCountAtLeast(builders, "name: 'search_caps_curriculum'", 2, 'OpenAI + Anthropic tool definitions');
  expectCountAtLeast(builders, "name: 'get_caps_documents'", 2, 'OpenAI + Anthropic tool definitions');
  expectCountAtLeast(builders, "name: 'get_caps_subjects'", 2, 'OpenAI + Anthropic tool definitions');
  expectCountAtLeast(builders, "name: 'caps_curriculum_query'", 2, 'OpenAI + Anthropic alias definitions');

  // tools/caps.ts owns CAPS search execution; dispatch for get_caps_documents
  // and get_caps_subjects is spread across providers and streaming modules.
  const capsTools = 'supabase/functions/ai-proxy/tools/caps.ts';
  expectContains(capsTools, 'search_caps_curriculum', 'server execution for CAPS search/alias');

  // Verify get_caps_documents and get_caps_subjects are dispatched in at least
  // one provider or streaming file (counts across the whole ai-proxy tree).
  const proxyFiles = walkFiles('supabase/functions/ai-proxy');
  const docsHits = proxyFiles.reduce((sum, f) => sum + count(read(f), 'get_caps_documents'), 0);
  const subsHits = proxyFiles.reduce((sum, f) => sum + count(read(f), 'get_caps_subjects'), 0);
  if (docsHits < 3) failures.push('ai-proxy: expected at least 3 occurrences of get_caps_documents across modules');
  if (subsHits < 3) failures.push('ai-proxy: expected at least 3 occurrences of get_caps_subjects across modules');

  // providers/openai.ts defers unknown tools to pending.
  const openai = 'supabase/functions/ai-proxy/providers/openai.ts';
  expectContains(openai, 'if (!SERVER_TOOL_NAMES.has(toolName)) {', 'unknown tools deferred to pending');

  // providers/anthropic.ts separates server vs client tool uses.
  const anthropic = 'supabase/functions/ai-proxy/providers/anthropic.ts';
  expectContains(
    anthropic,
    'const serverToolUses = toolUses.filter((tu) => SERVER_TOOL_NAMES.has(String(tu.name || \'\')));',
    'Anthropic server tool separation'
  );
  expectContains(
    anthropic,
    'const clientToolUses = toolUses.filter((tu) => !SERVER_TOOL_NAMES.has(String(tu.name || \'\')));',
    'Anthropic client tool separation'
  );

  // streaming/anthropic.ts separates server vs client pending tools.
  const streamingAnthropic = 'supabase/functions/ai-proxy/streaming/anthropic.ts';
  expectContains(
    streamingAnthropic,
    'const serverTools = pendingToolCalls.filter((t) => SERVER_TOOL_NAMES.has(String(t.name || \'\')));',
    'streaming server tool separation'
  );
  expectContains(
    streamingAnthropic,
    'const clientPendingTools = pendingToolCalls.filter((t) => !SERVER_TOOL_NAMES.has(String(t.name || \'\')));',
    'streaming pending-tool separation'
  );
}

function main() {
  checkNoLegacyEndpoint();
  checkUseChatLogicContract();
  checkAskAIWidgetContract();
  checkChatInterfaceContract();
  checkDashChatCallsites();
  checkAskAIWidgetCallsites();
  checkWebAiProxyCallers();
  checkClientToolsMetadataBoundary();
  checkAiProxyToolsAndExecution();

  if (failures.length > 0) {
    console.error('Dash + CAPS contract verification failed.');
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exit(1);
  }

  console.log('Dash + CAPS contract verification passed.');
}

main();
