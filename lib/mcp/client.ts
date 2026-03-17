/**
 * MCP (Model Context Protocol) Client Foundation
 *
 * Provides the foundational types and utilities for integrating MCP servers
 * with the EduDash Pro platform. MCP servers expose tools that the Dash AI
 * agent can invoke to interact with external systems (GitHub, Supabase, etc.)
 *
 * Architecture:
 *   Client App → ai-proxy Edge Function → MCP Server Registry → External APIs
 *
 * The MCP integration allows superadmins to:
 * 1. Register and configure MCP server connections
 * 2. Monitor tool availability and health
 * 3. Control which tools are available to the AI agent
 * 4. View usage analytics for MCP tool calls
 */

// ── Types ──

export interface MCPServerConfig {
  id: string;
  name: string;
  description: string;
  transport: 'stdio' | 'sse' | 'streamable-http';
  endpoint?: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  status: 'connected' | 'disconnected' | 'error' | 'pending';
  tools: MCPTool[];
  created_at: string;
  updated_at: string;
  last_health_check?: string;
  error_message?: string;
}

export interface MCPTool {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
  enabled: boolean;
  call_count: number;
  avg_latency_ms: number;
  last_called?: string;
}

export interface MCPToolCallResult {
  tool_name: string;
  server_id: string;
  success: boolean;
  duration_ms: number;
  result?: unknown;
  error?: string;
  timestamp: string;
}

export interface MCPRegistryState {
  servers: MCPServerConfig[];
  totalTools: number;
  activeTools: number;
  totalCalls: number;
  healthStatus: 'healthy' | 'degraded' | 'down';
}

// ── Built-in Server Templates ──

export const MCP_SERVER_TEMPLATES: Omit<MCPServerConfig, 'id' | 'status' | 'tools' | 'created_at' | 'updated_at'>[] = [
  {
    name: 'GitHub',
    description: 'Repository management, issues, PRs, and code search',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-github'],
    env: { GITHUB_PERSONAL_ACCESS_TOKEN: '' },
  },
  {
    name: 'Supabase',
    description: 'Database queries, schema management, and RPC calls',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@supabase/mcp-server-supabase@latest', '--url', '', '--service-role-key', ''],
  },
  {
    name: 'Brave Search',
    description: 'Web search capabilities for the AI agent',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@anthropic/mcp-server-brave-search'],
    env: { BRAVE_API_KEY: '' },
  },
  {
    name: 'Filesystem',
    description: 'Read/write access to designated directories',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@anthropic/mcp-server-filesystem', '/tmp/edudash'],
  },
  {
    name: 'Memory',
    description: 'Persistent memory store for the AI agent',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@anthropic/mcp-server-memory'],
  },
  {
    name: 'Sentry',
    description: 'Error tracking and issue management',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@anthropic/mcp-server-sentry'],
    env: { SENTRY_AUTH_TOKEN: '' },
  },
];

// ── Status helpers ──

export const SERVER_STATUS_CONFIG: Record<string, { color: string; icon: string; label: string }> = {
  connected: { color: '#10b981', icon: 'checkmark-circle', label: 'Connected' },
  disconnected: { color: '#64748b', icon: 'close-circle', label: 'Disconnected' },
  error: { color: '#ef4444', icon: 'alert-circle', label: 'Error' },
  pending: { color: '#f59e0b', icon: 'hourglass', label: 'Connecting...' },
};

export function computeRegistryState(servers: MCPServerConfig[]): MCPRegistryState {
  const totalTools = servers.reduce((sum, s) => sum + s.tools.length, 0);
  const activeTools = servers.reduce(
    (sum, s) => sum + s.tools.filter((t) => t.enabled).length,
    0,
  );
  const totalCalls = servers.reduce(
    (sum, s) => sum + s.tools.reduce((ts, t) => ts + t.call_count, 0),
    0,
  );

  const connectedCount = servers.filter((s) => s.status === 'connected').length;
  const errorCount = servers.filter((s) => s.status === 'error').length;

  let healthStatus: 'healthy' | 'degraded' | 'down' = 'healthy';
  if (errorCount > 0 && connectedCount > 0) healthStatus = 'degraded';
  if (connectedCount === 0 && servers.length > 0) healthStatus = 'down';

  return { servers, totalTools, activeTools, totalCalls, healthStatus };
}

// ── Local config persistence ──

import AsyncStorage from '@react-native-async-storage/async-storage';

const MCP_STORAGE_KEY = 'edudash_mcp_servers';

export async function loadMCPServers(): Promise<MCPServerConfig[]> {
  try {
    const stored = await AsyncStorage.getItem(MCP_STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

export async function saveMCPServers(servers: MCPServerConfig[]): Promise<void> {
  await AsyncStorage.setItem(MCP_STORAGE_KEY, JSON.stringify(servers));
}

export async function addMCPServer(
  template: (typeof MCP_SERVER_TEMPLATES)[number],
): Promise<MCPServerConfig> {
  const servers = await loadMCPServers();
  const newServer: MCPServerConfig = {
    ...template,
    id: `mcp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    status: 'pending',
    tools: [],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  servers.push(newServer);
  await saveMCPServers(servers);
  return newServer;
}

export async function removeMCPServer(serverId: string): Promise<void> {
  const servers = await loadMCPServers();
  await saveMCPServers(servers.filter((s) => s.id !== serverId));
}

export async function updateMCPServerStatus(
  serverId: string,
  status: MCPServerConfig['status'],
  errorMessage?: string,
): Promise<void> {
  const servers = await loadMCPServers();
  const server = servers.find((s) => s.id === serverId);
  if (server) {
    server.status = status;
    server.error_message = errorMessage;
    server.last_health_check = new Date().toISOString();
    server.updated_at = new Date().toISOString();
    await saveMCPServers(servers);
  }
}
