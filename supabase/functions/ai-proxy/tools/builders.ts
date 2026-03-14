export function canonicalToolName(value: string): string {
  return String(value || '').trim().toLowerCase();
}

export function buildOpenAITools(
  enableTools: boolean,
  clientTools?: Array<{ name: string; description: string; input_schema: Record<string, unknown> }>
) {
  if (!enableTools) return undefined;
  const serverTools = [
    {
      type: 'function',
      function: {
        name: 'web_search',
        description: 'Search the web for up-to-date or external information.',
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Search query' },
            recency: { type: 'string', description: 'Optional recency filter like "day" or "week"' },
            domains: { type: 'array', items: { type: 'string' } },
          },
          required: ['query'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'search_caps_curriculum',
        description: 'Search South African CAPS curriculum documents by topic/keyword, optionally filtering by grade and subject.',
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Search query (topic, concept, or keyword)' },
            grade: { type: 'string', description: 'Optional grade (e.g., "R", "1", "4-6", "10-12")' },
            subject: { type: 'string', description: 'Optional subject (e.g., "Mathematics", "Life Skills")' },
            limit: { type: 'number', description: 'Max results (default: 10)' },
            document_type: { type: 'string', description: 'Optional type filter (curriculum, exam, exemplar, guideline)' },
          },
          required: ['query'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'get_caps_documents',
        description: 'Retrieve CAPS documents for a specific grade and subject.',
        parameters: {
          type: 'object',
          properties: {
            grade: { type: 'string', description: 'Grade (e.g., "R-3", "4-6", "7-9", "10-12")' },
            subject: { type: 'string', description: 'Subject (e.g., "Mathematics")' },
            limit: { type: 'number', description: 'Max results (default: 20)' },
            document_type: { type: 'string', description: 'Optional type filter (curriculum, exam, exemplar, guideline)' },
          },
          required: ['grade', 'subject'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'get_caps_subjects',
        description: 'List CAPS subjects available for a given grade range.',
        parameters: {
          type: 'object',
          properties: {
            grade: { type: 'string', description: 'Grade (e.g., "R-3", "4-6", "7-9", "10-12")' },
          },
          required: ['grade'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'caps_curriculum_query',
        description: '(Alias) Search CAPS curriculum. Prefer search_caps_curriculum.',
        parameters: {
          type: 'object',
          properties: {
            search_query: { type: 'string', description: 'Search query (topic, concept, or keyword)' },
            grade: { type: 'string', description: 'Optional grade (e.g., "R", "1", "4-6", "10-12")' },
            subject: { type: 'string', description: 'Optional subject (e.g., "Mathematics", "Life Skills")' },
            limit: { type: 'number', description: 'Max results (default: 10)' },
            document_type: { type: 'string', description: 'Optional type filter (curriculum, exam, exemplar, guideline)' },
          },
          required: [],
        },
      },
    },
  ];
  // Merge client-side tools into OpenAI format
  const seenToolNames = new Set(
    serverTools.map((tool) => canonicalToolName(String((tool as any)?.function?.name || ''))).filter(Boolean),
  );
  if (clientTools && clientTools.length > 0) {
    for (const ct of clientTools) {
      const toolName = String(ct?.name || '').trim();
      if (!toolName) continue;
      const canonicalName = canonicalToolName(toolName);
      if (seenToolNames.has(canonicalName)) {
        console.warn('[ai-proxy] Skipping duplicate OpenAI tool name from client_tools:', toolName);
        continue;
      }
      seenToolNames.add(canonicalName);
      serverTools.push({
        type: 'function',
        function: {
          name: toolName,
          description: ct.description,
          parameters: ct.input_schema as any,
        },
      });
    }
  }
  return serverTools;
}

export function buildAnthropicTools(
  enableTools: boolean,
  clientTools?: Array<{ name: string; description: string; input_schema: Record<string, unknown> }>
) {
  if (!enableTools) return undefined;
  const tools: Array<{ name: string; description: string; input_schema: Record<string, unknown> }> = [
    {
      name: 'web_search',
      description: 'Search the web for up-to-date or external information.',
      input_schema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query' },
          recency: { type: 'string', description: 'Optional recency filter like "day" or "week"' },
          domains: { type: 'array', items: { type: 'string' } },
        },
        required: ['query'],
      },
    },
    {
      name: 'search_caps_curriculum',
      description: 'Search South African CAPS curriculum documents by topic/keyword, optionally filtering by grade and subject.',
      input_schema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query (topic, concept, or keyword)' },
          grade: { type: 'string', description: 'Optional grade (e.g., "R", "1", "4-6", "10-12")' },
          subject: { type: 'string', description: 'Optional subject (e.g., "Mathematics", "Life Skills")' },
          limit: { type: 'number', description: 'Max results (default: 10)' },
          document_type: { type: 'string', description: 'Optional type filter (curriculum, exam, exemplar, guideline)' },
        },
        required: ['query'],
      },
    },
    {
      name: 'get_caps_documents',
      description: 'Retrieve CAPS documents for a specific grade and subject.',
      input_schema: {
        type: 'object',
        properties: {
          grade: { type: 'string', description: 'Grade (e.g., "R-3", "4-6", "7-9", "10-12")' },
          subject: { type: 'string', description: 'Subject (e.g., "Mathematics")' },
          limit: { type: 'number', description: 'Max results (default: 20)' },
          document_type: { type: 'string', description: 'Optional type filter (curriculum, exam, exemplar, guideline)' },
        },
        required: ['grade', 'subject'],
      },
    },
    {
      name: 'get_caps_subjects',
      description: 'List CAPS subjects available for a given grade range.',
      input_schema: {
        type: 'object',
        properties: {
          grade: { type: 'string', description: 'Grade (e.g., "R-3", "4-6", "7-9", "10-12")' },
        },
        required: ['grade'],
      },
    },
    {
      name: 'caps_curriculum_query',
      description: '(Alias) Search CAPS curriculum. Prefer search_caps_curriculum.',
      input_schema: {
        type: 'object',
        properties: {
          search_query: { type: 'string', description: 'Search query (topic, concept, or keyword)' },
          grade: { type: 'string', description: 'Optional grade (e.g., "R", "1", "4-6", "10-12")' },
          subject: { type: 'string', description: 'Optional subject (e.g., "Mathematics", "Life Skills")' },
          limit: { type: 'number', description: 'Max results (default: 10)' },
          document_type: { type: 'string', description: 'Optional type filter (curriculum, exam, exemplar, guideline)' },
        },
        required: [],
      },
    },
  ];
  // Merge client-side tools
  const seenToolNames = new Set(tools.map((tool) => canonicalToolName(String(tool?.name || ''))).filter(Boolean));
  if (clientTools && clientTools.length > 0) {
    for (const ct of clientTools) {
      const toolName = String(ct?.name || '').trim();
      if (!toolName) continue;
      const canonicalName = canonicalToolName(toolName);
      if (seenToolNames.has(canonicalName)) {
        console.warn('[ai-proxy] Skipping duplicate Anthropic tool name from client_tools:', toolName);
        continue;
      }
      seenToolNames.add(canonicalName);
      tools.push({
        name: toolName,
        description: ct.description,
        input_schema: ct.input_schema,
      });
    }
  }
  return tools;
}
