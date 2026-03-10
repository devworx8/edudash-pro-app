import { renderHook, waitFor } from '@testing-library/react-native/pure';
import type { AIModelId, AIModelInfo, SubscriptionTier } from '@/lib/ai/models';
import { useDashChatModelPreference } from '@/hooks/useDashChatModelPreference';

const mockGetPreferredModel = jest.fn();
const mockSetPreferredModel = jest.fn();
const mockSetSelectedModel = jest.fn();

let selectedModel: AIModelId = 'claude-3-haiku-20240307';
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
    selectedModel = 'claude-3-haiku-20240307';
    tier = 'starter';
    isLoading = false;
    canSelectModel = () => true;
    availableModels = [
      {
        id: 'claude-3-haiku-20240307',
        name: 'Claude 3 Haiku',
        displayName: 'Dash Quick',
        provider: 'claude',
        relativeCost: 1,
        minTier: 'free',
        description: 'Fastest',
      },
      {
        id: 'claude-3-5-sonnet-20241022',
        name: 'Claude 3.5 Sonnet',
        displayName: 'Dash Smart',
        provider: 'claude',
        relativeCost: 5,
        minTier: 'starter',
        description: 'Balanced',
      },
    ] as AIModelInfo[];
  });

  it('applies a stored preferred model when tier allows it', async () => {
    mockGetPreferredModel.mockResolvedValue('claude-3-5-sonnet-20241022');

    renderHook(() => useDashChatModelPreference());

    await waitFor(() => {
      expect(mockGetPreferredModel).toHaveBeenCalledWith('chat_message');
    });

    await waitFor(() => {
      expect(mockSetSelectedModel).toHaveBeenCalledWith('claude-3-5-sonnet-20241022');
    });
  });

  it('does not apply a stored model when it is locked for the tier', async () => {
    mockGetPreferredModel.mockResolvedValue('claude-3-7-sonnet-20250219');
    canSelectModel = (modelId: AIModelId) => modelId !== 'claude-3-7-sonnet-20250219';

    renderHook(() => useDashChatModelPreference());

    await waitFor(() => {
      expect(mockGetPreferredModel).toHaveBeenCalledWith('chat_message');
    });

    expect(mockSetSelectedModel).not.toHaveBeenCalledWith('claude-3-7-sonnet-20250219');
  });

  it('persists the selected chat model after initial preference load', async () => {
    mockGetPreferredModel.mockResolvedValue(null);

    renderHook(() => useDashChatModelPreference());

    await waitFor(() => {
      expect(mockSetPreferredModel).toHaveBeenCalledWith('claude-3-haiku-20240307', 'chat_message');
    });
  });

  it('waits for model availability before hydrating the stored preference', async () => {
    mockGetPreferredModel.mockResolvedValue('claude-3-5-sonnet-20241022');
    isLoading = true;

    const { rerender } = renderHook(() => useDashChatModelPreference());

    expect(mockGetPreferredModel).not.toHaveBeenCalled();

    isLoading = false;
    rerender({});

    await waitFor(() => {
      expect(mockGetPreferredModel).toHaveBeenCalledWith('chat_message');
    });

    await waitFor(() => {
      expect(mockSetSelectedModel).toHaveBeenCalledWith('claude-3-5-sonnet-20241022');
    });
  });
});
