import { isCreditOrBillingError, normalizeAnthropicModel } from './modelPolicy.ts';

type RepairParams = {
  anthropicApiKey: string;
  openAiApiKey: string;
  openAiExamModel: string;
  examSystemPrompt: string;
  fallbackAnthropicModel: string;
  modelUsed: string;
  grade: string;
  subject: string;
  language: string;
  issues: string[];
  customPrompt?: string;
  normalizedExam: unknown;
};

export async function attemptExamQualityRepair(params: RepairParams): Promise<string | null> {
  const issueList = params.issues.map((issue, idx) => `${idx + 1}. ${issue}`).join('\n');
  const promptLines = [
    `The previous exam JSON draft failed quality checks for ${params.grade} ${params.subject}.`,
    'Repair the draft and return a corrected full exam JSON only (no markdown).',
    `Quality issues to fix:\n${issueList}`,
    `Learner language must be strictly ${params.language}.`,
    'If uploaded study material exists, keep questions strictly grounded in that material.',
    'Do not include OCR labels/file names/translation annotations in learner-facing content.',
    'For mathematics explanations, use plain symbols (× ÷ =) and avoid escaped dollar delimiters.',
    'Keep CAPS alignment and preserve realistic mark distribution.',
    `Previous draft JSON:\n${JSON.stringify(params.normalizedExam)}`,
  ];
  if (params.customPrompt) {
    promptLines.push(`Original additional instructions:\n${params.customPrompt}`);
  }
  const repairPrompt = promptLines.join('\n\n');

  if (params.modelUsed.startsWith('openai:') && params.openAiApiKey) {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${params.openAiApiKey}`,
      },
      body: JSON.stringify({
        model: params.openAiExamModel,
        temperature: 0.1,
        max_tokens: 8192,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: params.examSystemPrompt },
          { role: 'user', content: repairPrompt },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      const billing = isCreditOrBillingError(response.status, errorText);
      console.warn(
        '[generate-exam] quality repair OpenAI failed',
        response.status,
        billing ? 'billing/quota' : errorText,
      );
      return null;
    }

    const data = await response.json();
    return String(data?.choices?.[0]?.message?.content || '').trim() || null;
  }

  if (!params.anthropicApiKey) return null;

  const repairModel = params.modelUsed.startsWith('openai:')
    ? normalizeAnthropicModel(params.fallbackAnthropicModel)
    : normalizeAnthropicModel(params.modelUsed);

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': params.anthropicApiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: repairModel,
      max_tokens: 8192,
      system: params.examSystemPrompt,
      messages: [{ role: 'user', content: repairPrompt }],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.warn('[generate-exam] quality repair Anthropic failed', response.status, errorText);
    return null;
  }

  const data = await response.json();
  return String(data?.content?.[0]?.text || '').trim() || null;
}
