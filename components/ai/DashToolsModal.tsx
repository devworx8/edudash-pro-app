import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, ScrollView, StyleSheet, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/contexts/ThemeContext';
import type { DashToolShortcut } from '@/lib/ai/toolCatalog';
import { ModalLayer } from '@/components/ui/ModalLayer';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

interface DashToolsModalProps {
  visible: boolean;
  onClose: () => void;
  tools: DashToolShortcut[];
  onRunTool: (toolName: string, params: Record<string, any>) => Promise<void>;
  getToolSchema?: (toolName: string) => any;
}

const buildTemplateFromSchema = (schema?: any) => {
  if (!schema || typeof schema !== 'object') return {};
  const required = Array.isArray(schema.required) ? schema.required : [];
  const properties = schema.properties && typeof schema.properties === 'object' ? schema.properties : {};
  const template: Record<string, any> = {};

  for (const key of required) {
    const prop = properties[key] || {};
    if (prop.default !== undefined) {
      template[key] = prop.default;
      continue;
    }
    if (Array.isArray(prop.enum) && prop.enum.length > 0) {
      template[key] = prop.enum[0];
      continue;
    }
    switch (prop.type) {
      case 'number':
        template[key] = 0;
        break;
      case 'boolean':
        template[key] = false;
        break;
      case 'array':
        template[key] = [];
        break;
      case 'object':
        template[key] = {};
        break;
      default:
        template[key] = '';
    }
  }

  return template;
};

export const DashToolsModal: React.FC<DashToolsModalProps> = ({
  visible,
  onClose,
  tools,
  onRunTool,
  getToolSchema,
}) => {
  const { theme } = useTheme();
  const [query, setQuery] = useState('');
  const [selectedTool, setSelectedTool] = useState<DashToolShortcut | null>(null);
  const [paramsText, setParamsText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);

  useEffect(() => {
    if (!visible) {
      setQuery('');
      setSelectedTool(null);
      setParamsText('');
      setError(null);
      setIsRunning(false);
    }
  }, [visible]);

  const filteredTools = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return tools;
    return tools.filter((tool) =>
      tool.label.toLowerCase().includes(q) ||
      tool.description.toLowerCase().includes(q) ||
      tool.name.toLowerCase().includes(q)
    );
  }, [query, tools]);

  const openTool = (tool: DashToolShortcut) => {
    setSelectedTool(tool);
    const schemaTemplate = buildTemplateFromSchema(getToolSchema?.(tool.name));
    const merged = { ...schemaTemplate, ...(tool.params || {}) };
    setParamsText(JSON.stringify(merged, null, 2));
    setError(null);
  };

  const handleRun = async () => {
    if (!selectedTool) return;
    setError(null);

    let params: Record<string, any> = {};
    if (paramsText.trim()) {
      try {
        params = JSON.parse(paramsText);
      } catch (err) {
        setError('Invalid JSON. Please fix the parameters and try again.');
        return;
      }
    }

    setIsRunning(true);
    try {
      await onRunTool(selectedTool.name, params);
      try {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch {}
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Tool execution failed.');
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <ModalLayer visible={visible} animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.container, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <View style={styles.header}>
            {selectedTool ? (
              <TouchableOpacity onPress={() => setSelectedTool(null)} style={styles.headerButton}>
                <Ionicons name="arrow-back" size={18} color={theme.text} />
              </TouchableOpacity>
            ) : (
              <View style={styles.headerButton} />
            )}
            <Text style={[styles.title, { color: theme.text }]}>
              {selectedTool ? selectedTool.label : 'Dash Tools'}
            </Text>
            <TouchableOpacity onPress={onClose} style={styles.headerButton}>
              <Ionicons name="close" size={18} color={theme.text} />
            </TouchableOpacity>
          </View>

          {!selectedTool && (
            <>
              <TextInput
                placeholder="Search tools..."
                placeholderTextColor={theme.textSecondary}
                value={query}
                onChangeText={setQuery}
                style={[styles.searchInput, { borderColor: theme.border, color: theme.text, backgroundColor: theme.background }]}
              />
              <ScrollView style={{ maxHeight: screenHeight * 0.6 }}>
                {filteredTools.map((tool) => (
                  <TouchableOpacity
                    key={tool.name}
                    style={[styles.toolRow, { borderBottomColor: theme.border }]}
                    onPress={() => openTool(tool)}
                  >
                    <View style={[styles.toolIcon, { backgroundColor: theme.primary + '22' }]}>
                      <Ionicons name="construct-outline" size={16} color={theme.primary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.toolLabel, { color: theme.text }]}>{tool.label}</Text>
                      <Text style={[styles.toolDescription, { color: theme.textSecondary }]}>{tool.description}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={theme.textSecondary} />
                  </TouchableOpacity>
                ))}
                {filteredTools.length === 0 && (
                  <View style={styles.emptyState}>
                    <Ionicons name="search-outline" size={20} color={theme.textSecondary} />
                    <Text style={[styles.emptyText, { color: theme.textSecondary }]}>No tools found.</Text>
                  </View>
                )}
              </ScrollView>
            </>
          )}

          {selectedTool && (
            <View style={styles.detailContainer}>
              <Text style={[styles.detailDescription, { color: theme.textSecondary }]}>
                {selectedTool.description}
              </Text>
              <Text style={[styles.detailLabel, { color: theme.text }]}>Parameters (JSON)</Text>
              <TextInput
                value={paramsText}
                onChangeText={setParamsText}
                multiline
                style={[
                  styles.paramsInput,
                  { borderColor: theme.border, color: theme.text, backgroundColor: theme.background },
                ]}
                placeholder='{"key": "value"}'
                placeholderTextColor={theme.textSecondary}
              />
              {error && <Text style={[styles.errorText, { color: theme.error }]}>{error}</Text>}
              <TouchableOpacity
                style={[styles.runButton, { backgroundColor: theme.primary, opacity: isRunning ? 0.6 : 1 }]}
                onPress={handleRun}
                disabled={isRunning}
              >
                <Ionicons name="play" size={16} color={theme.onPrimary || '#fff'} />
                <Text style={[styles.runButtonText, { color: theme.onPrimary || '#fff' }]}>
                  {isRunning ? 'Running...' : 'Run Tool'}
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    </ModalLayer>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  container: {
    width: Math.min(560, screenWidth - 24),
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  headerButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    flex: 1,
    textAlign: 'center',
    fontWeight: '700',
    fontSize: 16,
  },
  searchInput: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10,
  },
  toolRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  toolIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  toolLabel: {
    fontSize: 14,
    fontWeight: '700',
  },
  toolDescription: {
    fontSize: 12,
    marginTop: 2,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  emptyText: {
    marginTop: 8,
    fontSize: 12,
  },
  detailContainer: {
    gap: 10,
  },
  detailDescription: {
    fontSize: 12,
  },
  detailLabel: {
    fontSize: 12,
    fontWeight: '700',
  },
  paramsInput: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 120,
    fontFamily: 'monospace',
    fontSize: 12,
  },
  runButton: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    paddingVertical: 12,
  },
  runButtonText: {
    fontWeight: '700',
  },
  errorText: {
    fontSize: 12,
    fontWeight: '600',
  },
});
