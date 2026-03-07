'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Settings, Zap, RefreshCcw, Save, CheckCircle2 } from 'lucide-react';

interface AIGlobalSettings {
  id: string;
  default_provider: 'claude' | 'openai';
  enable_automatic_fallback: boolean;
  fallback_provider: 'claude' | 'openai';
  max_retries: number;
  retry_delay_seconds: number;
}

interface AIProviderConfig {
  id: string;
  service_type: string;
  provider_override: 'claude' | 'openai' | null;
  model_free: string;
  model_basic: string;
  model_premium: string;
  model_pro: string;
  model_enterprise: string;
  description: string;
  is_active: boolean;
}

const SERVICE_LABELS: Record<string, string> = {
  homework_help: '📚 Homework Help',
  lesson_generation: '📝 Lesson Generation',
  grading_assistance: '📊 Grading Assistance',
  dash_conversation: '💬 Dash Conversation',
  general: '🔧 General',
};

const CLAUDE_MODELS = [
  'claude-3-haiku-20240307',
  'claude-3-sonnet-20240229',
  'claude-3-5-sonnet-20241022',
  'claude-3-opus-20240229',
];

const OPENAI_MODELS = [
  'gpt-3.5-turbo',
  'gpt-4',
  'gpt-4-turbo',
  'gpt-4o',
  'gpt-4o-mini',
];

export default function AIConfigPage() {
  const [globalSettings, setGlobalSettings] = useState<AIGlobalSettings | null>(null);
  const [configs, setConfigs] = useState<AIProviderConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const supabase = createClient();

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      // Load global settings
      const { data: globalData, error: globalError } = await supabase
        .from('ai_global_settings')
        .select('*')
        .eq('id', '00000000-0000-0000-0000-000000000001')
        .single();

      if (globalError) throw globalError;
      setGlobalSettings(globalData);

      // Load provider configs
      const { data: configData, error: configError } = await supabase
        .from('ai_provider_config')
        .select('*')
        .order('service_type');

      if (configError) throw configError;
      setConfigs(configData || []);
    } catch (error) {
      console.error('Error loading AI config:', error);
      alert('Failed to load AI configuration');
    } finally {
      setLoading(false);
    }
  };

  const saveGlobalSettings = async () => {
    if (!globalSettings) return;

    setSaving(true);
    try {
      const { error } = await supabase
        .from('ai_global_settings')
        .update({
          default_provider: globalSettings.default_provider,
          enable_automatic_fallback: globalSettings.enable_automatic_fallback,
          fallback_provider: globalSettings.fallback_provider,
          max_retries: globalSettings.max_retries,
          retry_delay_seconds: globalSettings.retry_delay_seconds,
          updated_at: new Date().toISOString(),
        })
        .eq('id', '00000000-0000-0000-0000-000000000001');

      if (error) throw error;

      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (error) {
      console.error('Error saving global settings:', error);
      alert('Failed to save global settings');
    } finally {
      setSaving(false);
    }
  };

  const saveConfig = async (config: AIProviderConfig) => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('ai_provider_config')
        .update({
          provider_override: config.provider_override,
          model_free: config.model_free,
          model_basic: config.model_basic,
          model_premium: config.model_premium,
          model_pro: config.model_pro,
          model_enterprise: config.model_enterprise,
          is_active: config.is_active,
          updated_at: new Date().toISOString(),
        })
        .eq('id', config.id);

      if (error) throw error;

      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (error) {
      console.error('Error saving config:', error);
      alert('Failed to save configuration');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <RefreshCcw className="w-8 h-8 animate-spin mx-auto text-blue-600 dark:text-blue-400" />
          <p className="mt-2 text-gray-600 dark:text-gray-400">Loading AI Configuration...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <Settings className="w-8 h-8" />
                AI Provider Configuration
              </h1>
              <p className="mt-2 text-gray-600 dark:text-gray-400">
                Configure AI providers and models for different scenarios and user tiers
              </p>
            </div>
            {saveSuccess && (
              <div className="flex items-center gap-2 bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-100 px-4 py-2 rounded-lg">
                <CheckCircle2 className="w-5 h-5" />
                <span>Saved successfully!</span>
              </div>
            )}
          </div>
        </div>

        {/* Global Settings Card */}
        {globalSettings && (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 mb-6">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
              <Zap className="w-5 h-5 text-yellow-500" />
              Global Settings
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Default Provider */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Default Provider
                </label>
                <select
                  value={globalSettings.default_provider}
                  onChange={(e) =>
                    setGlobalSettings({
                      ...globalSettings,
                      default_provider: e.target.value as 'claude' | 'openai',
                    })
                  }
                  className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                >
                  <option value="claude">Claude (Anthropic)</option>
                  <option value="openai">OpenAI (GPT)</option>
                </select>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Used when service has no provider override
                </p>
              </div>

              {/* Enable Fallback */}
              <div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={globalSettings.enable_automatic_fallback}
                    onChange={(e) =>
                      setGlobalSettings({
                        ...globalSettings,
                        enable_automatic_fallback: e.target.checked,
                      })
                    }
                    className="w-5 h-5 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                  />
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Enable Automatic Fallback
                  </span>
                </label>
                <p className="mt-1 ml-7 text-xs text-gray-500 dark:text-gray-400">
                  Automatically retry with fallback provider on rate limits
                </p>
              </div>

              {/* Fallback Provider */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Fallback Provider
                </label>
                <select
                  value={globalSettings.fallback_provider}
                  onChange={(e) =>
                    setGlobalSettings({
                      ...globalSettings,
                      fallback_provider: e.target.value as 'claude' | 'openai',
                    })
                  }
                  disabled={!globalSettings.enable_automatic_fallback}
                  className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                >
                  <option value="claude">Claude (Anthropic)</option>
                  <option value="openai">OpenAI (GPT)</option>
                </select>
              </div>

              {/* Max Retries */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Max Retries
                </label>
                <input
                  type="number"
                  min="0"
                  max="10"
                  value={globalSettings.max_retries}
                  onChange={(e) =>
                    setGlobalSettings({
                      ...globalSettings,
                      max_retries: parseInt(e.target.value),
                    })
                  }
                  className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="mt-6 flex justify-end">
              <button
                onClick={saveGlobalSettings}
                disabled={saving}
                className="flex items-center gap-2 px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                {saving ? 'Saving...' : 'Save Global Settings'}
              </button>
            </div>
          </div>
        )}

        {/* Service-Specific Configurations */}
        <div className="space-y-4">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
            Service-Specific Configuration
          </h2>

          {configs.map((config) => (
            <div
              key={config.id}
              className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6"
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{SERVICE_LABELS[config.service_type]}</span>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                      {config.service_type.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())}
                    </h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">{config.description}</p>
                  </div>
                </div>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={config.is_active}
                    onChange={(e) => {
                      const updated = { ...config, is_active: e.target.checked };
                      setConfigs(configs.map((c) => (c.id === config.id ? updated : c)));
                    }}
                    className="w-5 h-5 text-green-600 rounded"
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-300">Active</span>
                </label>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
                {/* Provider Override */}
                <div className="md:col-span-2 lg:col-span-3">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Provider Override
                  </label>
                  <select
                    value={config.provider_override || ''}
                    onChange={(e) => {
                      const updated = {
                        ...config,
                        provider_override: (e.target.value || null) as 'claude' | 'openai' | null,
                      };
                      setConfigs(configs.map((c) => (c.id === config.id ? updated : c)));
                    }}
                    className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  >
                    <option value="">Use Global Default</option>
                    <option value="claude">Claude (Anthropic)</option>
                    <option value="openai">OpenAI (GPT)</option>
                  </select>
                </div>

                {/* Model per tier */}
                {[
                  { key: 'model_free', label: 'Free Tier' },
                  { key: 'model_basic', label: 'Basic Tier' },
                  { key: 'model_premium', label: 'Premium Tier' },
                  { key: 'model_pro', label: 'Pro Tier' },
                  { key: 'model_enterprise', label: 'Enterprise Tier' },
                ].map(({ key, label }) => (
                  <div key={key}>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      {label}
                    </label>
                    <select
                      value={config[key as keyof AIProviderConfig] as string}
                      onChange={(e) => {
                        const updated = { ...config, [key]: e.target.value };
                        setConfigs(configs.map((c) => (c.id === config.id ? updated : c)));
                      }}
                      className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    >
                      <optgroup label="Claude Models">
                        {CLAUDE_MODELS.map((model) => (
                          <option key={model} value={model}>
                            {model}
                          </option>
                        ))}
                      </optgroup>
                      <optgroup label="OpenAI Models">
                        {OPENAI_MODELS.map((model) => (
                          <option key={model} value={model}>
                            {model}
                          </option>
                        ))}
                      </optgroup>
                    </select>
                  </div>
                ))}
              </div>

              <div className="flex justify-end">
                <button
                  onClick={() => saveConfig(config)}
                  disabled={saving}
                  className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors disabled:opacity-50"
                >
                  <Save className="w-4 h-4" />
                  {saving ? 'Saving...' : 'Save Configuration'}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
