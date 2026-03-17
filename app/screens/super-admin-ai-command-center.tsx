/**
 * AI Command Center - Super Admin Agentic AI Operations Hub
 *
 * All state + logic lives in hooks/super-admin-ai-command-center/.
 * This file is JSX-only.
 */

import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, RefreshControl, Modal, Platform, KeyboardAvoidingView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTheme } from '@/contexts/ThemeContext';
import { isPlatformStaff } from '@/lib/roleUtils';
import ThemedStatusBar from '@/components/ui/ThemedStatusBar';
import { AlertModal, useAlertModal } from '@/components/ui/AlertModal';
import EduDashSpinner from '@/components/ui/EduDashSpinner';
import {
  AGENT_ICONS,
  AGENT_COLORS,
  getStatusColor,
  getInsightIcon,
  getInsightColor,
  formatTimeAgo,
  createStyles,
} from '@/lib/screen-styles/super-admin-ai-command-center.styles';
import { useSuperAdminAICommandCenter } from '@/hooks/super-admin-ai-command-center';

export default function SuperAdminAICommandCenter() {
  const { theme } = useTheme();
  const styles = createStyles(theme);
  const { showAlert, alertProps } = useAlertModal();

  const {
    refreshing, loading, agents, tasks, insights, integrations,
    activeTab, setActiveTab,
    assistantVisible, setAssistantVisible,
    assistantMessage, setAssistantMessage,
    chatHistory, assistantLoading, chatScrollRef,
    onRefresh, toggleAgent, toggleTask, runAgent,
    handleInsightAction, dismissInsight, configureIntegration,
    sendToAssistant, profile,
  } = useSuperAdminAICommandCenter(showAlert);

  // Access check
  if (!profile || !isPlatformStaff(profile.role)) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
        <ThemedStatusBar />
        <View style={styles.accessDenied}>
          <Ionicons name="lock-closed" size={64} color={theme.error} />
          <Text style={[styles.accessDeniedText, { color: theme.text }]}>Access Denied</Text>
        </View>
      </SafeAreaView>
    );
  }

  // Loading state
  if (loading && agents.length === 0) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
        <ThemedStatusBar />
        <View style={styles.loadingContainer}>
          <EduDashSpinner size="large" color={theme.primary} />
          <Text style={[styles.loadingText, { color: theme.textSecondary }]}>Loading Dash AI Command Center...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <ThemedStatusBar />
      
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={theme.text} />
        </TouchableOpacity>
        <View style={styles.headerTitle}>
          <Text style={[styles.title, { color: theme.text }]}>Dash AI Command Center</Text>
          <Text style={[styles.subtitle, { color: theme.textSecondary }]}>Full Agentic AI • Unlimited</Text>
        </View>
        <TouchableOpacity 
          style={[styles.assistantButton, { backgroundColor: '#8b5cf6' }]}
          onPress={() => setAssistantVisible(true)}
        >
          <Ionicons name="sparkles" size={20} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Tab Bar */}
      <View style={[styles.tabBar, { borderBottomColor: theme.border }]}>
        {(['agents', 'tasks', 'insights', 'integrations'] as const).map(tab => (
          <TouchableOpacity
            key={tab}
            style={[
              styles.tab,
              activeTab === tab && { borderBottomColor: theme.primary, borderBottomWidth: 2 }
            ]}
            onPress={() => setActiveTab(tab)}
          >
            <Text style={[
              styles.tabText,
              { color: activeTab === tab ? theme.primary : theme.textSecondary }
            ]}>
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        style={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />
        }
      >
        {/* AI Agents Tab */}
        {activeTab === 'agents' && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>
              <Ionicons name="hardware-chip" size={18} color="#8b5cf6" /> AI Agents ({agents.length})
            </Text>
            {agents.length === 0 ? (
              <View style={[styles.emptyState, { backgroundColor: theme.surface }]}>
                <Ionicons name="cube-outline" size={48} color={theme.textSecondary} />
                <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
                  No agents configured. Run the migration to add default agents.
                </Text>
              </View>
            ) : (
              agents.map(agent => (
                <View 
                  key={agent.id} 
                  style={[styles.agentCard, { backgroundColor: theme.surface, borderColor: theme.border }]}
                >
                  <View style={styles.agentHeader}>
                    <View style={[styles.agentIcon, { backgroundColor: `${AGENT_COLORS[agent.agent_type] || '#6b7280'}20` }]}>
                      <Ionicons 
                        name={(AGENT_ICONS[agent.agent_type] || 'cube') as any} 
                        size={24} 
                        color={AGENT_COLORS[agent.agent_type] || '#6b7280'} 
                      />
                    </View>
                    <View style={styles.agentInfo}>
                      <Text style={[styles.agentName, { color: theme.text }]}>{agent.name}</Text>
                      <Text style={[styles.agentDesc, { color: theme.textSecondary }]} numberOfLines={2}>
                        {agent.description}
                      </Text>
                    </View>
                    <View style={[styles.statusBadge, { backgroundColor: getStatusColor(agent.status) }]}>
                      <Text style={styles.statusText}>{agent.status}</Text>
                    </View>
                  </View>
                  
                  <View style={styles.agentStats}>
                    <View style={styles.statItem}>
                      <Text style={[styles.statLabel, { color: theme.textSecondary }]}>Success Rate</Text>
                      <Text style={[styles.statValue, { color: theme.text }]}>
                        {agent.success_rate?.toFixed(1) || 0}%
                      </Text>
                    </View>
                    <View style={styles.statItem}>
                      <Text style={[styles.statLabel, { color: theme.textSecondary }]}>Last Run</Text>
                      <Text style={[styles.statValue, { color: theme.text }]}>
                        {formatTimeAgo(agent.last_run_at)}
                      </Text>
                    </View>
                    <View style={styles.statItem}>
                      <Text style={[styles.statLabel, { color: theme.textSecondary }]}>Total Runs</Text>
                      <Text style={[styles.statValue, { color: theme.text }]}>{agent.total_runs || 0}</Text>
                    </View>
                  </View>
                  
                  <View style={styles.agentActions}>
                    <TouchableOpacity
                      style={[styles.actionButton, { backgroundColor: theme.primary }]}
                      onPress={() => runAgent(agent)}
                      disabled={agent.status === 'running' || agent.status === 'disabled'}
                    >
                      <Ionicons name="play" size={16} color="#fff" />
                      <Text style={styles.actionButtonText}>Run Now</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[
                        styles.actionButton, 
                        { backgroundColor: agent.status === 'disabled' ? '#10b981' : '#ef4444' }
                      ]}
                      onPress={() => toggleAgent(agent.id)}
                    >
                      <Ionicons name={agent.status === 'disabled' ? 'power' : 'pause'} size={16} color="#fff" />
                      <Text style={styles.actionButtonText}>
                        {agent.status === 'disabled' ? 'Enable' : 'Disable'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))
            )}
          </View>
        )}

        {/* Autonomous Tasks Tab */}
        {activeTab === 'tasks' && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>
              <Ionicons name="timer" size={18} color="#3b82f6" /> Autonomous Tasks ({tasks.length})
            </Text>
            {tasks.length === 0 ? (
              <View style={[styles.emptyState, { backgroundColor: theme.surface }]}>
                <Ionicons name="time-outline" size={48} color={theme.textSecondary} />
                <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
                  No tasks configured. Run the migration to add default tasks.
                </Text>
              </View>
            ) : (
              tasks.map(task => (
                <View 
                  key={task.id} 
                  style={[styles.taskCard, { backgroundColor: theme.surface, borderColor: theme.border }]}
                >
                  <View style={styles.taskHeader}>
                    <View style={styles.taskInfo}>
                      <Text style={[styles.taskName, { color: theme.text }]}>{task.name}</Text>
                      <Text style={[styles.taskSchedule, { color: theme.textSecondary }]}>
                        <Ionicons name="time-outline" size={12} /> {task.schedule_cron}
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={[
                        styles.toggleButton,
                        { backgroundColor: task.is_enabled ? '#10b981' : '#6b7280' }
                      ]}
                      onPress={() => toggleTask(task.id)}
                    >
                      <Text style={styles.toggleText}>{task.is_enabled ? 'ON' : 'OFF'}</Text>
                    </TouchableOpacity>
                  </View>
                  <Text style={[styles.taskDesc, { color: theme.textSecondary }]}>{task.description}</Text>
                  <View style={styles.taskMeta}>
                    <Text style={[styles.taskMetaText, { color: theme.textSecondary }]}>
                      Last: {formatTimeAgo(task.last_execution_at)} • Status: {task.last_execution_status || 'Never run'}
                    </Text>
                  </View>
                </View>
              ))
            )}
          </View>
        )}

        {/* Insights Tab */}
        {activeTab === 'insights' && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>
              <Ionicons name="bulb" size={18} color="#f59e0b" /> Platform Insights ({insights.length})
            </Text>
            {insights.length === 0 ? (
              <View style={[styles.emptyState, { backgroundColor: theme.surface }]}>
                <Ionicons name="sparkles-outline" size={48} color={theme.textSecondary} />
                <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
                  No insights yet. AI will generate insights based on platform activity.
                </Text>
              </View>
            ) : (
              insights.map((insight) => (
                <View 
                  key={insight.id} 
                  style={[styles.insightCard, { backgroundColor: theme.surface, borderLeftColor: getInsightColor(insight.insight_type) }]}
                >
                  <View style={styles.insightHeader}>
                    <Ionicons name={getInsightIcon(insight.insight_type) as any} size={20} color={getInsightColor(insight.insight_type)} />
                    <View style={{ flex: 1, marginLeft: 8 }}>
                      <Text style={[styles.insightTitle, { color: theme.text }]}>{insight.title}</Text>
                      <Text style={[styles.insightTime, { color: theme.textSecondary }]}>
                        {formatTimeAgo(insight.created_at)} • {insight.priority} priority
                      </Text>
                    </View>
                    <TouchableOpacity onPress={() => dismissInsight(insight.id)}>
                      <Ionicons name="close-circle" size={20} color={theme.textSecondary} />
                    </TouchableOpacity>
                  </View>
                  <Text style={[styles.insightDescription, { color: theme.textSecondary }]}>
                    {insight.description}
                  </Text>
                  {insight.action_label && (
                    <TouchableOpacity 
                      style={[styles.insightAction, { backgroundColor: getInsightColor(insight.insight_type) + '20' }]}
                      onPress={() => handleInsightAction(insight)}
                    >
                      <Text style={[styles.insightActionText, { color: getInsightColor(insight.insight_type) }]}>
                        {insight.action_label}
                      </Text>
                      <Ionicons name="arrow-forward" size={14} color={getInsightColor(insight.insight_type)} />
                    </TouchableOpacity>
                  )}
                </View>
              ))
            )}
          </View>
        )}

        {/* Integrations Tab */}
        {activeTab === 'integrations' && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>
              <Ionicons name="git-branch" size={18} color="#ec4899" /> Integrations ({integrations.length})
            </Text>
            {integrations.length === 0 ? (
              <View style={[styles.emptyState, { backgroundColor: theme.surface }]}>
                <Ionicons name="extension-puzzle-outline" size={48} color={theme.textSecondary} />
                <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
                  No integrations configured. Run migration to add GitHub, EAS, etc.
                </Text>
              </View>
            ) : (
              integrations.map((integration) => (
                <View 
                  key={integration.id} 
                  style={[styles.taskCard, { backgroundColor: theme.surface, borderColor: theme.border }]}
                >
                  <View style={styles.taskHeader}>
                    <View style={styles.taskInfo}>
                      <Text style={[styles.taskName, { color: theme.text }]}>{integration.name}</Text>
                      <Text style={[styles.taskSchedule, { color: theme.textSecondary }]}>
                        {integration.integration_type}
                      </Text>
                    </View>
                    <View style={[
                      styles.statusBadge,
                      { backgroundColor: integration.is_enabled ? '#10b981' : '#6b7280' }
                    ]}>
                      <Text style={styles.statusText}>{integration.is_enabled ? 'Active' : 'Disabled'}</Text>
                    </View>
                  </View>
                  <View style={styles.taskMeta}>
                    <Text style={[styles.taskMetaText, { color: theme.textSecondary }]}>
                      Last sync: {formatTimeAgo(integration.last_sync_at)} • Status: {integration.last_sync_status || 'Never synced'}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={[styles.actionButton, { backgroundColor: theme.primary, marginTop: 8 }]}
                    onPress={() => configureIntegration(integration)}
                  >
                    <Ionicons name="settings" size={16} color="#fff" />
                    <Text style={styles.actionButtonText}>Configure</Text>
                  </TouchableOpacity>
                </View>
              ))
            )}
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* AI Assistant Modal - Full Chat Interface */}
      <Modal
        visible={assistantVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setAssistantVisible(false)}
      >
        <KeyboardAvoidingView 
          style={styles.assistantOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={[styles.assistantContainer, { backgroundColor: theme.surface }]}>
            <View style={[styles.assistantHeader, { borderBottomColor: theme.border }]}>
              <View style={styles.assistantTitleRow}>
                <Ionicons name="sparkles" size={24} color="#8b5cf6" />
                <View style={{ marginLeft: 8 }}>
                  <Text style={[styles.assistantTitle, { color: theme.text }]}>Admin AI Assistant</Text>
                  <Text style={[styles.assistantSubtitle, { color: theme.textSecondary }]}>
                    Full Agentic • Enterprise Tier • Unlimited
                  </Text>
                </View>
              </View>
              <TouchableOpacity onPress={() => setAssistantVisible(false)}>
                <Ionicons name="close" size={24} color={theme.textSecondary} />
              </TouchableOpacity>
            </View>
            
            <ScrollView 
              ref={chatScrollRef}
              style={styles.chatContent}
              contentContainerStyle={{ padding: 16 }}
            >
              {chatHistory.length === 0 ? (
                <View style={styles.assistantWelcome}>
                  <Ionicons name="chatbubbles" size={48} color="#8b5cf6" />
                  <Text style={[styles.assistantWelcomeTitle, { color: theme.text }]}>
                    Super Admin AI
                  </Text>
                  <Text style={[styles.assistantWelcomeText, { color: theme.textSecondary }]}>
                    I can query the database, analyze platform data, manage GitHub PRs, trigger EAS builds, and more. Try:
                  </Text>
                  <View style={styles.suggestionsContainer}>
                    {[
                      'Show me platform stats for this month',
                      'List all active schools',
                      'Get recent GitHub commits',
                      'Show AI usage by school',
                    ].map((suggestion, idx) => (
                      <TouchableOpacity
                        key={idx}
                        style={[styles.suggestionChip, { backgroundColor: theme.background }]}
                        onPress={() => setAssistantMessage(suggestion)}
                      >
                        <Text style={[styles.suggestionText, { color: theme.primary }]}>{suggestion}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              ) : (
                chatHistory.map((msg, idx) => (
                  <View
                    key={idx}
                    style={[
                      styles.chatBubble,
                      msg.role === 'user' ? styles.userBubble : styles.assistantBubble,
                      { backgroundColor: msg.role === 'user' ? theme.primary : theme.background }
                    ]}
                  >
                    <Text style={[
                      styles.chatBubbleText,
                      { color: msg.role === 'user' ? '#fff' : theme.text }
                    ]}>
                      {msg.content}
                    </Text>
                    {msg.tool_calls && msg.tool_calls.length > 0 && (
                      <View style={styles.toolCallsInfo}>
                        <Ionicons name="construct" size={12} color={theme.textSecondary} />
                        <Text style={[styles.toolCallsText, { color: theme.textSecondary }]}>
                          Used {msg.tool_calls.length} tool(s)
                        </Text>
                      </View>
                    )}
                  </View>
                ))
              )}
              {assistantLoading && (
                <View style={[styles.chatBubble, styles.assistantBubble, { backgroundColor: theme.background }]}>
                  <EduDashSpinner size="small" color={theme.primary} />
                  <Text style={[styles.thinkingText, { color: theme.textSecondary }]}>Thinking...</Text>
                </View>
              )}
            </ScrollView>
            
            <View style={[styles.assistantInputRow, { borderTopColor: theme.border }]}>
              <TextInput
                style={[styles.assistantInput, { 
                  backgroundColor: theme.background, 
                  color: theme.text,
                  borderColor: theme.border,
                }]}
                placeholder="Ask anything about the platform..."
                placeholderTextColor={theme.textSecondary}
                value={assistantMessage}
                onChangeText={setAssistantMessage}
                onSubmitEditing={sendToAssistant}
                multiline
                maxLength={2000}
              />
              <TouchableOpacity 
                style={[styles.assistantSendBtn, { backgroundColor: '#8b5cf6' }]}
                onPress={sendToAssistant}
                disabled={assistantLoading || !assistantMessage.trim()}
              >
                {assistantLoading ? (
                  <EduDashSpinner size="small" color="#fff" />
                ) : (
                  <Ionicons name="send" size={20} color="#fff" />
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <AlertModal {...alertProps} />
    </SafeAreaView>
  );
}
