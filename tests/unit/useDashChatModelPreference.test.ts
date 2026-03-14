import { renderHook, waitFor } from '@testing-library/react-native/pure';
import type { AIModelId, AIModelInfo, SubscriptionTier } from '@/lib/ai/models';
import { useDashChatModelPreference } from '@/hooks/useDashChatModelPreference';

const mockGetPreferredModel = jest.fn();
const mockSetPreferredModel = jest.fn();
const mockSetSelectedModel = jest.fn();

let selectedModel: AIModelId = 'claude-haiku-4-5-20251001';
let availableModels: AIModelInfo[] = [];
let tier: SubscriptionTier = 'free';
let isLoading = false;
let canSelectModel = (_modelId: AIModelId) => true;

jest.mock('@/hooks/useAIModelSelection', () => ({
  useAIModelSelection: () => ({
    availableModels,
    selectedModel,
    setSelectedModel: mockSetSelectedModel,
    canSelectModel: (modelId: AIModelId) => canSelectModel(modelId),
    tier,
    isLoading,
  }),
}));

jest.mock('@/lib/ai/preferences', () => ({
  getPreferredModel: (...args: unknown[]) => mockGetPreferredModel(...args),
  setPreferredModel: (...args: unknown[]) => mockSetPreferredModel(...args),
}));

describe('useDashChatModelPreference', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    selectedModel = 'claude-haiku-4-5-20251001';
    tier = 'starter';
    isLoading = false;
    canSelectModel = () => true;
    availableModels = [
      {
        id: 'claude-haiku-4-5-20251001',
        name: 'Claude Haiku 4.5',
        displayName: 'Dash Swift',
        provider: 'claude',
        relativeCost: 2,
        minTier: 'free',
        description: 'Fast daily tutoring',
      },
      {
        id: 'claude-3-7-sonnet-20250219',
        name: 'Claude 3.7 Sonnet',
        displayName: 'Dash Advanced',
        provider: 'claude',
        relativeCost: 6,
        minTier: 'starter',
        description: 'Accurate lesson planning',
      },
    ] as AIModelInfo[];
  });

  it('applies a stored preferred model when tier allows it', async () => {
    mockGetPreferredModel.mockResolvedValue('claude-3-7-sonnet-20250219');

    renderHook(() => useDashChatModelPreference());

    await waitFor(() => {
      expect(mockGetPreferredModel).toHaveBeenCalledWith('chat_message');
    });

    await waitFor(() => {
      expect(mockSetSelectedModel).toHaveBeenCalledWith('claude-3-7-sonnet-20250219');
    });
  });

  it('does not apply a stored model when it is locked for the tier', async () => {
    mockGetPreferredModel.mockResolvedValue('claude-sonnet-4-20250514');
    canSelectModel = (modelId: AIModelId) => modelId !== 'claude-sonnet-4-20250514';

    renderHook(() => useDashChatModelPreference());

    await waitFor(() => {
      expect(mockGetPreferredModel).toHaveBeenCalledWith('chat_message');
    });

    expect(mockSetSelectedModel).not.toHaveBeenCalledWith('claude-sonnet-4-20250514');
  });

  it('persists the selected chat model after initial preference load', async () => {
    mockGetPreferredModel.mockResolvedValue(null);

    renderHook(() => useDashChatModelPreference());

    await waitFor(() => {
      expect(mockSetPreferredModel).toHaveBeenCalledWith('claude-haiku-4-5-20251001', 'chat_message');
    });
  });

  it('waits for model availability before hydrating the stored preference', async () => {
    mockGetPreferredModel.mockResolvedValue('claude-3-7-sonnet-20250219');
    isLoading = true;

    const { rerender } = renderHook(() => useDashChatModelPreference());

    expect(mockGetPreferredModel).not.toHaveBeenCalled();

    isLoading = false;
    rerender({});

    await waitFor(() => {
      expect(mockGetPreferredModel).toHaveBeenCalledWith('chat_message');
    });

    await waitFor(() => {
      expect(mockSetSelectedModel).toHaveBeenCalledWith('claude-3-7-sonnet-20250219');
    });
  });
});
