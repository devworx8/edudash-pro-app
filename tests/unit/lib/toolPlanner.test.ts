import { planToolCall } from '@/lib/ai/toolPlanner';

describe('tool planner deterministic PDF intent', () => {
  it('selects generate_pdf_from_prompt for explicit PDF requests', async () => {
    const result = await planToolCall({
      supabaseClient: null,
      role: 'parent',
      message: 'Please generate a printable PDF study guide about Grade 4 fractions.',
      tools: [
        {
          name: 'generate_pdf_from_prompt',
          description: 'Generate a PDF from a prompt',
          parameters: {},
        },
      ],
    });

    expect(result).toEqual({
      tool: 'generate_pdf_from_prompt',
      parameters: {
        prompt: 'Please generate a printable PDF study guide about Grade 4 fractions.',
        document_type: 'study_guide',
      },
      reason: 'deterministic_pdf_generation_intent',
      intent: 'tool',
      intent_confidence: 0.94,
    });
  });
});
