/**
 * MarkdownFallback
 *
 * Pure React Native markdown renderer — no external dependencies.
 * Used when react-native-markdown-display is unavailable (or on web).
 *
 * Handles: ## headings, **bold**, *italic*, bullet/numbered lists,
 * code blocks (no visible backticks), blockquotes, inline code.
 */

import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';

interface Props {
  content: string;
  theme: any;
  /** Base font size (default 15) */
  fontSize?: number;
}

export const MarkdownFallback: React.FC<Props> = ({ content, theme, fontSize = 15 }) => {
  const lines = String(content || '').split('\n');
  const elements: React.ReactNode[] = [];
  let inCodeBlock = false;
  let codeLines: string[] = [];
  let codeLang = '';

  lines.forEach((line, idx) => {
    // ── Code blocks ────────────────────────────────────────────────────
    if (line.startsWith('```')) {
      if (!inCodeBlock) {
        inCodeBlock = true;
        codeLang = line.slice(3).trim();
        codeLines = [];
      } else {
        inCodeBlock = false;
        elements.push(
          <View key={`code-${idx}`} style={[s.codeBlock, { backgroundColor: theme.surfaceVariant || '#1e293b' }]}>
            {codeLang ? (
              <Text style={[s.codeLang, { color: theme.textTertiary || '#64748b' }]}>{codeLang}</Text>
            ) : null}
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <Text style={[s.codeText, { color: '#d4d4d4', fontSize: fontSize - 1 }]}>
                {codeLines.join('\n')}
              </Text>
            </ScrollView>
          </View>,
        );
        codeLines = [];
        codeLang = '';
      }
      return;
    }
    if (inCodeBlock) { codeLines.push(line); return; }

    // ── Headings ───────────────────────────────────────────────────────
    if (line.startsWith('### ')) {
      elements.push(
        <Text key={idx} style={[s.h3, { color: theme.text, fontSize: fontSize + 1 }]}>
          {line.slice(4).trim()}
        </Text>,
      );
      return;
    }
    if (line.startsWith('## ')) {
      elements.push(
        <Text key={idx} style={[s.h2, { color: theme.text, fontSize: fontSize + 3 }]}>
          {line.slice(3).trim()}
        </Text>,
      );
      return;
    }
    if (line.startsWith('# ')) {
      elements.push(
        <Text key={idx} style={[s.h1, { color: theme.text, fontSize: fontSize + 5 }]}>
          {line.slice(2).trim()}
        </Text>,
      );
      return;
    }

    // ── Blockquote ─────────────────────────────────────────────────────
    if (line.startsWith('> ')) {
      elements.push(
        <View key={idx} style={[s.blockquote, { borderLeftColor: theme.primary, backgroundColor: theme.primary + '18' }]}>
          <Text style={[s.bodyText, { color: theme.text, fontSize }]}>
            {renderInline(line.slice(2), theme, fontSize)}
          </Text>
        </View>,
      );
      return;
    }

    // ── Bullet list ────────────────────────────────────────────────────
    const bulletMatch = line.match(/^(\s*)([-*])\s+(.*)$/);
    if (bulletMatch) {
      const indent = Math.floor(bulletMatch[1].length / 2);
      elements.push(
        <View key={idx} style={[s.listItem, { marginLeft: indent * 12 }]}>
          <Text style={[s.bullet, { color: theme.primary, fontSize }]}>•</Text>
          <Text style={[s.bodyText, { color: theme.text, fontSize, flex: 1 }]}>
            {renderInline(bulletMatch[3], theme, fontSize)}
          </Text>
        </View>,
      );
      return;
    }

    // ── Numbered list ──────────────────────────────────────────────────
    const numberedMatch = line.match(/^(\s*)(\d+)\.\s+(.*)$/);
    if (numberedMatch) {
      const indent = Math.floor(numberedMatch[1].length / 2);
      elements.push(
        <View key={idx} style={[s.listItem, { marginLeft: indent * 12 }]}>
          <Text style={[s.listNum, { color: theme.primary, fontSize }]}>{numberedMatch[2]}.</Text>
          <Text style={[s.bodyText, { color: theme.text, fontSize, flex: 1 }]}>
            {renderInline(numberedMatch[3], theme, fontSize)}
          </Text>
        </View>,
      );
      return;
    }

    // ── Horizontal rule ────────────────────────────────────────────────
    if (/^-{3,}$/.test(line.trim()) || /^={3,}$/.test(line.trim())) {
      elements.push(<View key={idx} style={[s.hr, { backgroundColor: theme.border }]} />);
      return;
    }

    // ── Empty line ─────────────────────────────────────────────────────
    if (line.trim() === '') {
      elements.push(<View key={idx} style={{ height: 6 }} />);
      return;
    }

    // ── Regular paragraph ──────────────────────────────────────────────
    elements.push(
      <Text key={idx} style={[s.bodyText, { color: theme.text, fontSize }]}>
        {renderInline(line, theme, fontSize)}
      </Text>,
    );
  });

  return <View>{elements}</View>;
};

/** Renders inline markdown: **bold**, *italic*, `code` */
function renderInline(text: string, theme: any, fontSize: number): React.ReactNode {
  const parts: React.ReactNode[] = [];
  let buf = '';
  let i = 0;

  const flush = () => { if (buf) { parts.push(buf); buf = ''; } };

  while (i < text.length) {
    // Inline code
    if (text[i] === '`') {
      flush();
      const end = text.indexOf('`', i + 1);
      if (end !== -1) {
        parts.push(
          <Text key={`ic-${i}`} style={[s.inlineCode, { backgroundColor: theme.surfaceVariant || '#1e293b', color: theme.primary, fontSize: fontSize - 1 }]}>
            {text.slice(i + 1, end)}
          </Text>,
        );
        i = end + 1;
        continue;
      }
    }
    // Bold
    if (text.slice(i, i + 2) === '**') {
      flush();
      const end = text.indexOf('**', i + 2);
      if (end !== -1) {
        parts.push(
          <Text key={`b-${i}`} style={{ fontWeight: '700', color: theme.text, fontSize }}>
            {text.slice(i + 2, end)}
          </Text>,
        );
        i = end + 2;
        continue;
      }
    }
    // Italic (single * or _)
    if ((text[i] === '*' || text[i] === '_') && text[i - 1] !== text[i] && text[i + 1] !== text[i]) {
      flush();
      const ch = text[i];
      const end = text.indexOf(ch, i + 1);
      if (end !== -1 && text[end + 1] !== ch) {
        parts.push(
          <Text key={`em-${i}`} style={{ fontStyle: 'italic', color: theme.textSecondary || theme.text, fontSize }}>
            {text.slice(i + 1, end)}
          </Text>,
        );
        i = end + 1;
        continue;
      }
    }
    buf += text[i];
    i++;
  }
  flush();
  return parts.length > 0 ? parts : text;
}

const s = StyleSheet.create({
  h1: { fontWeight: '700', marginVertical: 8, lineHeight: 32 },
  h2: { fontWeight: '700', marginVertical: 6, lineHeight: 28 },
  h3: { fontWeight: '600', marginVertical: 4, lineHeight: 24 },
  bodyText: { lineHeight: 22, marginBottom: 2 },
  bullet: { marginRight: 6, lineHeight: 22 },
  listNum: { marginRight: 6, lineHeight: 22, fontWeight: '600' },
  listItem: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 3 },
  blockquote: { borderLeftWidth: 3, paddingLeft: 10, paddingVertical: 4, marginVertical: 4, borderRadius: 2 },
  hr: { height: 1, marginVertical: 10 },
  codeBlock: { borderRadius: 8, padding: 12, marginVertical: 8 },
  codeLang: { fontSize: 11, marginBottom: 6, fontWeight: '600' },
  codeText: { fontFamily: 'monospace', lineHeight: 20 },
  inlineCode: { paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4, fontFamily: 'monospace' },
});