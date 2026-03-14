import React from 'react';
import { View, Text, Platform, ScrollView, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { styles, getMarkdownStyles } from './DashAIChat.styles';
import { containsMathSyntax, parseMathSegments } from '@/components/exam-prep/mathSegments';
import { MathRenderer } from '@/components/ai/dash-assistant/MathRenderer';

import EduDashSpinner from '@/components/ui/EduDashSpinner';
// Conditional import for markdown
const isWeb = Platform.OS === 'web';
let Markdown: React.ComponentType<any> | null = null;
if (!isWeb) {
  Markdown = require('react-native-markdown-display').default;
}

/**
 * Simple markdown-to-JSX renderer for web platform
 * Handles common markdown syntax without external dependencies
 */
const WebMarkdownRenderer: React.FC<{ content: string; theme: any }> = ({ content, theme }) => {
  const renderMarkdown = (text: string) => {
    const lines = text.split('\n');
    const elements: React.ReactNode[] = [];
    let inCodeBlock = false;
    let codeBlockContent: string[] = [];
    let codeBlockLanguage = '';
    
    lines.forEach((line, idx) => {
      // Code block start/end
      if (line.startsWith('```')) {
        if (!inCodeBlock) {
          inCodeBlock = true;
          codeBlockLanguage = line.substring(3).trim();
          codeBlockContent = [];
        } else {
          inCodeBlock = false;
          elements.push(
            <View key={`code-${idx}`} style={[styles.webCodeBlock, { backgroundColor: '#1e1e1e' }]}>
              {codeBlockLanguage && (
                <Text style={[styles.webCodeLanguage, { color: '#858585' }]}>
                  {codeBlockLanguage}
                </Text>
              )}
              <ScrollView horizontal>
                <Text style={[styles.webCodeText, { color: '#d4d4d4' }]}>
                  {codeBlockContent.join('\n')}
                </Text>
              </ScrollView>
            </View>
          );
          codeBlockContent = [];
          codeBlockLanguage = '';
        }
        return;
      }
      
      if (inCodeBlock) {
        codeBlockContent.push(line);
        return;
      }
      
      // Headings
      if (line.startsWith('###')) {
        elements.push(
          <Text key={idx} style={[styles.webHeading3, { color: theme.text }]}>
            {line.substring(3).trim()}
          </Text>
        );
        return;
      }
      if (line.startsWith('##')) {
        elements.push(
          <Text key={idx} style={[styles.webHeading2, { color: theme.text }]}>
            {line.substring(2).trim()}
          </Text>
        );
        return;
      }
      if (line.startsWith('#')) {
        elements.push(
          <Text key={idx} style={[styles.webHeading1, { color: theme.text }]}>
            {line.substring(1).trim()}
          </Text>
        );
        return;
      }
      
      // Bullet lists
      if (line.trim().startsWith('- ') || line.trim().startsWith('* ')) {
        const content = line.trim().substring(2);
        elements.push(
          <View key={idx} style={styles.webListItem}>
            <Text style={[styles.webListBullet, { color: theme.primary }]}>•</Text>
            <Text style={[styles.webText, { color: theme.text }]}>
              {renderInlineMarkdown(content, theme)}
            </Text>
          </View>
        );
        return;
      }
      
      // Numbered lists
      const numberedMatch = line.trim().match(/^(\d+)\.\s+(.*)$/);
      if (numberedMatch) {
        elements.push(
          <View key={idx} style={styles.webListItem}>
            <Text style={[styles.webListNumber, { color: theme.primary }]}>
              {numberedMatch[1]}.
            </Text>
            <Text style={[styles.webText, { color: theme.text }]}>
              {renderInlineMarkdown(numberedMatch[2], theme)}
            </Text>
          </View>
        );
        return;
      }
      
      // Blockquotes
      if (line.startsWith('> ')) {
        elements.push(
          <View key={idx} style={[styles.webBlockquote, { 
            backgroundColor: theme.primary + '15',
            borderLeftColor: theme.primary 
          }]}>
            <Text style={[styles.webText, { color: theme.text }]}>
              {renderInlineMarkdown(line.substring(2), theme)}
            </Text>
          </View>
        );
        return;
      }
      
      // Empty lines
      if (line.trim() === '') {
        elements.push(<View key={idx} style={{ height: 8 }} />);
        return;
      }
      
      // Regular paragraph
      elements.push(
        <Text key={idx} style={[styles.webText, { color: theme.text }]}>
          {renderInlineMarkdown(line, theme)}
        </Text>
      );
    });
    
    return elements;
  };
  
  const renderInlineMarkdown = (text: string, theme: any): React.ReactNode => {
    const parts: React.ReactNode[] = [];
    let currentText = '';
    let i = 0;
    
    while (i < text.length) {
      // Inline code `code`
      if (text[i] === '`') {
        if (currentText) {
          parts.push(currentText);
          currentText = '';
        }
        const end = text.indexOf('`', i + 1);
        if (end !== -1) {
          parts.push(
            <Text key={`code-${i}`} style={[styles.webInlineCode, { 
              backgroundColor: theme.surface,
              color: theme.primary 
            }]}>
              {text.substring(i + 1, end)}
            </Text>
          );
          i = end + 1;
          continue;
        }
      }
      
      // Bold **text**
      if (text.substring(i, i + 2) === '**') {
        if (currentText) {
          parts.push(currentText);
          currentText = '';
        }
        const end = text.indexOf('**', i + 2);
        if (end !== -1) {
          parts.push(
            <Text key={`bold-${i}`} style={{ fontWeight: '600' }}>
              {text.substring(i + 2, end)}
            </Text>
          );
          i = end + 2;
          continue;
        }
      }
      
      // Italic *text* or _text_
      if (text[i] === '*' || text[i] === '_') {
        const char = text[i];
        if (currentText) {
          parts.push(currentText);
          currentText = '';
        }
        const end = text.indexOf(char, i + 1);
        if (end !== -1 && text[i - 1] !== char && text[end + 1] !== char) {
          parts.push(
            <Text key={`italic-${i}`} style={{ fontStyle: 'italic', color: theme.textSecondary }}>
              {text.substring(i + 1, end)}
            </Text>
          );
          i = end + 1;
          continue;
        }
      }
      
      currentText += text[i];
      i++;
    }
    
    if (currentText) {
      parts.push(currentText);
    }
    
    return parts.length > 0 ? parts : text;
  };
  
  return <View>{renderMarkdown(content)}</View>;
};

/**
 * Renders content with math expressions using MathRenderer.
 * Splits text into segments: plain text rendered via markdown, math via KaTeX.
 */
const MathAwareContent: React.FC<{ content: string; theme: any; markdownStyles?: any }> = ({ content, theme, markdownStyles }) => {
  const segments = parseMathSegments(content);
  return (
    <View>
      {segments.map((seg, i) => {
        if (seg.type === 'block') {
          return <MathRenderer key={i} expression={seg.value} displayMode />;
        }
        if (seg.type === 'inline') {
          return <MathRenderer key={i} expression={seg.value} displayMode={false} />;
        }
        // Text segments: prefer react-native-markdown-display, fall back to
        // WebMarkdownRenderer (pure RN primitives — works on native too).
        if (Markdown) {
          return <Markdown key={i} style={markdownStyles}>{seg.value}</Markdown>;
        }
        return <WebMarkdownRenderer key={i} content={seg.value} theme={theme} />;
      })}
    </View>
  );
};

export interface ChatMessageData {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  isStreaming?: boolean;
  toolsUsed?: string[];
}

interface ChatMessageProps {
  message: ChatMessageData;
  onCopy?: (message: ChatMessageData) => void;
  onRegenerate?: (message: ChatMessageData) => void;
  onShare?: (message: ChatMessageData) => void;
  disableActions?: boolean;
}

export const ChatMessage: React.FC<ChatMessageProps> = ({
  message,
  onCopy,
  onRegenerate,
  onShare,
  disableActions = false,
}) => {
  const { theme } = useTheme();
  const { profile } = useAuth();
  const isUser = message.role === 'user';
  const markdownStyles = getMarkdownStyles(theme);

  return (
    <View
      style={[
        styles.messageContainer,
        isUser ? styles.userMessageContainer : styles.assistantMessageContainer,
      ]}
    >
      {/* Avatar */}
      {!isUser && (
        <View style={[styles.avatar, { backgroundColor: theme.primary }]}>
          <Ionicons name="sparkles" size={16} color="#fff" />
        </View>
      )}
      
      {/* Message bubble */}
      <View
        style={[
          styles.messageBubble,
          isUser 
            ? [styles.userBubble, { backgroundColor: theme.primary }]
            : [styles.assistantBubble, { backgroundColor: theme.surface }],
        ]}
      >
        {message.isStreaming ? (
          <View style={styles.streamingContainer}>
            <EduDashSpinner size="small" color={theme.primary} />
            <Text style={[styles.streamingText, { color: theme.textSecondary }]}>
              Thinking...
            </Text>
          </View>
        ) : isUser ? (
          <Text style={styles.userText}>{message.content}</Text>
        ) : containsMathSyntax(message.content) ? (
          <MathAwareContent content={message.content} theme={theme} markdownStyles={markdownStyles} />
        ) : Markdown ? (
          <Markdown style={markdownStyles}>{message.content}</Markdown>
        ) : (
          // WebMarkdownRenderer uses only View/Text/ScrollView — safe on native.
          // Handles ##, **bold**, bullet lists, code blocks without showing backticks.
          <WebMarkdownRenderer content={message.content} theme={theme} />
        )}
        
        {/* Tools used indicator */}
        {message.toolsUsed && message.toolsUsed.length > 0 && (
          <View style={[styles.toolsUsed, { borderTopColor: theme.border }]}>
            <Ionicons name="construct-outline" size={12} color={theme.textSecondary} />
            <Text style={[styles.toolsText, { color: theme.textSecondary }]}>
              Used: {message.toolsUsed.join(', ')}
            </Text>
          </View>
        )}
        {!message.isStreaming && !disableActions && (onCopy || onRegenerate || onShare) && (
          <View style={styles.messageActionsRow}>
            {onCopy && (
              <TouchableOpacity style={styles.messageAction} onPress={() => onCopy(message)}>
                <Ionicons name="copy-outline" size={14} color={theme.textSecondary} />
              </TouchableOpacity>
            )}
            {!isUser && onRegenerate && (
              <TouchableOpacity style={styles.messageAction} onPress={() => onRegenerate(message)}>
                <Ionicons name="refresh-outline" size={14} color={theme.textSecondary} />
              </TouchableOpacity>
            )}
            {onShare && (
              <TouchableOpacity style={styles.messageAction} onPress={() => onShare(message)}>
                <Ionicons name="share-social-outline" size={14} color={theme.textSecondary} />
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>
      
      {/* User avatar */}
      {isUser && (
        <View style={[styles.avatar, styles.userAvatar, { backgroundColor: theme.textSecondary }]}>
          <Text style={styles.userAvatarText}>
            {profile?.first_name?.[0] || 'U'}
          </Text>
        </View>
      )}
    </View>
  );
};
