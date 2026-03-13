import { useEffect, useMemo, useState } from 'react';
import { useAIModelSelection } from '@/hooks/useAIModelSelection';
import { getDefaultModelForTier, getDefaultModels, type AIModelId, type AIModelInfo, type SubscriptionTier } from '@/lib/ai/models';
import { getPreferredModel, setPreferredModel } from '@/lib/ai/preferences';

interface DashChatModelPreferenceState {
  availableModels: AIModelInfo[];
  allModels: AIModelInfo[];
  selectedModel: AIModelId;
  setSelectedModel: (modelId: AIModelId) => void;
  tier: SubscriptionTier;
  canSelectModel: (modelId: AIModelId) => boolean;
  isLoading: boolean;
}

export function useDashChatModelPreference(): DashChatModelPreferenceState {
  const [modelPrefLoaded, setModelPrefLoaded] = useState(false);
  const {
    availableModels,
    selectedModel,
    setSelectedModel,
    canSelectModel,
    tier,
    isLoading,
  } = useAIModelSelection('chat_message');

  const allModels = useMemo(() => getDefaultModels(), []);

  useEffect(() => {
    if (modelPrefLoaded || isLoading || availableModels.length === 0) return;
    let mounted = true;
    (async () => {
      const stored = await getPreferredModel('chat_message');
      if (!mounted) return;
      const allowedIds = new Set(availableModels.map((model) => model.id));
      const tierDefault = getDefaultModelForTier(tier);
      const fallbackModel =
        (allowedIds.has(tierDefault) ? tierDefault : null) ??
        availableModels[0]?.id ??
        selectedModel;

      if (stored && allowedIds.has(stored as AIModelId)) {
        if (stored !== selectedModel) {
          setSelectedModel(stored as AIModelId);
        }
      } else if (!allowedIds.has(selectedModel) && fallbackModel && fallbackModel !== selectedModel) {
        setSelectedModel(fallbackModel);
      }
      setModelPrefLoaded(true);
    })();
    return () => {
      mounted = false;
    };
  }, [availableModels, isLoading, modelPrefLoaded, selectedModel, setSelectedModel, tier]);

  useEffect(() => {
    if (!modelPrefLoaded) return;
    setPreferredModel(selectedModel, 'chat_message');
  }, [modelPrefLoaded, selectedModel]);

  useEffect(() => {
    if (availableModels.length === 0) return;
    if (!availableModels.find((model) => model.id === selectedModel)) {
      const tierDefault = getDefaultModelForTier(tier);
      const fallbackModel = availableModels.find((model) => model.id === tierDefault)?.id || availableModels[0].id;
      setSelectedModel(fallbackModel);
    }
  }, [availableModels, selectedModel, setSelectedModel, tier]);

  return {
    availableModels,
    allModels,
    selectedModel,
    setSelectedModel,
    tier,
    canSelectModel,
    isLoading,
  };
}

export default useDashChatModelPreference;
