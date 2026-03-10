/**
 * DashBoardContent - Rich content display for Dash AI responses
 * 
 * Features:
 * - Proper KaTeX/LaTeX math rendering
 * - Visual math diagrams for examples (long division, etc.)
 * - Text precedence for TTS reading
 * - Animated reveal for step-by-step explanations
 */

import React, { useMemo, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Platform,
  Animated,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import MathRenderer from './dash-assistant/MathRenderer';

// ── Inline math segment splitter (shared with DashTutorWhiteboard) ───────────
// Splits a string like "The area is $A = \pi r^2$ here" into
// [{type:'text', content:'The area is '}, {type:'inlineMath', content:'A = \pi r^2'}, ...]
type InlineSeg = { type: 'text' | 'inlineMath'; content: string };
function splitInlineMathSegs(text: string): InlineSeg[] {
  const segs: InlineSeg[] = [];
  const re = /\$([^$\n]+?)\$/g;
  let cursor = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > cursor) segs.push({ type: 'text', content: text.slice(cursor, m.index) });
    segs.push({ type: 'inlineMath', content: m[1] });
    cursor = m.index + m[0].length;
  }
  if (cursor < text.length) segs.push({ type: 'text', content: text.slice(cursor) });
  return segs;
}

// Color palette matching design reference
const C = {
  white: '#f1f5f9',
  yellow: '#fde68a',
  cyan: '#67e8f9',
  green: '#86efac',
  pink: '#f9a8d4',
  purple: '#a78bfa',
  indigo: '#6366f1',
  board: 'transparent',
  dim: 'rgba(241,245,249,0.4)',
};

interface ContentSegment {
  type: 'text' | 'math' | 'equation' | 'heading' | 'step';
  content: string;
  index: number;
}

/**
 * Parse content into segments for rendering
 */
function parseContentSegments(text: string): ContentSegment[] {
  const segments: ContentSegment[] = [];
  let remaining = text;
  let index = 0;

  // Regex patterns
  const displayMathRegex = /^\$\$([\s\S]*?)\$\$/;
  const inlineMathRegex = /\$([^$\n]+?)\$/;
  const headingRegex = /^#{1,3}\s+(.+)$/;
  const stepRegex = /^(\d+[.)]\s+|Step\s*\d+:\s*)(.+)$/;

  while (remaining.length > 0) {
    const lines = remaining.split('\n');
    const firstLine = lines[0];

    // Check for display math (entire line)
    const displayMatch = firstLine.match(displayMathRegex);
    if (displayMatch) {
      segments.push({
        type: 'equation',
        content: displayMatch[1].trim(),
        index: index++,
      });
      remaining = remaining.slice(firstLine.length + 1);
      continue;
    }

    // Check for heading
    const headingMatch = firstLine.match(headingRegex);
    if (headingMatch) {
      segments.push({
        type: 'heading',
        content: headingMatch[1],
        index: index++,
      });
      remaining = remaining.slice(firstLine.length + 1);
      continue;
    }

    // Check for step
    const stepMatch = firstLine.match(stepRegex);
    if (stepMatch) {
      segments.push({
        type: 'step',
        content: stepMatch[2],
        index: index++,
      });
      remaining = remaining.slice(firstLine.length + 1);
      continue;
    }

    // Check for inline math
    const inlineMatch = firstLine.match(inlineMathRegex);
    if (inlineMatch) {
      // Split by inline math
      const parts = firstLine.split(inlineMathRegex);
      if (parts.length > 1) {
        // Has inline math - render as equation segment
        segments.push({
          type: 'math',
          content: firstLine,
          index: index++,
        });
        remaining = remaining.slice(firstLine.length + 1);
        continue;
      }
    }

    // Plain text
    if (firstLine.trim()) {
      segments.push({
        type: 'text',
        content: firstLine,
        index: index++,
      });
    }
    remaining = remaining.slice(firstLine.length + 1);
  }

  return segments;
}

/**
 * Strip content for TTS reading (removes math delimiters, markdown)
 */
export function stripContentForTTS(text: string): string {
  return text
    .replace(/\$\$([\s\S]*?)\$\$/g, '$1')  // Display math
    .replace(/\$([^$\n]+?)\$/g, '$1')       // Inline math
    .replace(/^#{1,3}\s+/gm, '')            // Headings
    .replace(/\*\*(.+?)\*\*/g, '$1')        // Bold
    .replace(/\*(.+?)\*/g, '$1')            // Italic
    .replace(/`([^`]+)`/g, '$1')            // Code
    .replace(/^\d+[.)]\s+/gm, 'Step: ')     // Step numbers
    .replace(/^Step\s*\d+:\s*/gm, 'Step: ')
    .replace(/\n+/g, ' ')                    // Newlines to spaces
    .trim();
}

interface DashBoardContentProps {
  content: string;
  animateReveal?: boolean;
  onAnimationComplete?: () => void;
}

export function DashBoardContent({ 
  content, 
  animateReveal = true,
  onAnimationComplete 
}: DashBoardContentProps) {
  const segments = useMemo(() => parseContentSegments(content), [content]);
  const fadeAnims = useRef(segments.map(() => new Animated.Value(animateReveal ? 0 : 1))).current;

  useEffect(() => {
    if (!animateReveal) return;

    // Staggered reveal animation
    const animations = segments.map((_, i) =>
      Animated.timing(fadeAnims[i], {
        toValue: 1,
        duration: 300,
        delay: i * 150,
        useNativeDriver: true,
      })
    );

    Animated.stagger(100, animations).start(() => {
      onAnimationComplete?.();
    });
  }, [segments, animateReveal, onAnimationComplete]);

  return (
    <View style={styles.container}>
      {segments.map((segment, i) => (
        <Animated.View
          key={`segment-${i}`}
          style={[
            styles.segmentWrapper,
            { opacity: fadeAnims[i] },
          ]}
        >
          {renderSegment(segment)}
        </Animated.View>
      ))}
    </View>
  );
}

function renderSegment(segment: ContentSegment) {
  switch (segment.type) {
    case 'heading':
      return (
        <View style={styles.headingContainer}>
          <Text style={styles.headingText}>{segment.content}</Text>
          <View style={styles.headingUnderline} />
        </View>
      );

    case 'step':
      return (
        <View style={styles.stepContainer}>
          <View style={styles.stepBadge}>
            <Text style={styles.stepNumber}>{segment.index + 1}</Text>
          </View>
          <Text style={styles.stepText}>{segment.content}</Text>
        </View>
      );

    case 'equation':
      return (
        <View style={styles.equationContainer}>
          <MathRenderer expression={segment.content} displayMode={true} />
        </View>
      );

    case 'math': {
      // Line with mixed text + inline math — render each segment with proper KaTeX
      const mathSegs = splitInlineMathSegs(segment.content);
      return (
        <View style={[styles.textContainer, styles.inlineMathRow]}>
          {mathSegs.map((seg, i) =>
            seg.type === 'text' ? (
              <Text key={i} style={styles.textStyle}>{seg.content}</Text>
            ) : (
              <MathRenderer key={i} expression={seg.content} displayMode={false} />
            )
          )}
        </View>
      );
    }

    case 'text':
    default:
      return (
        <View style={styles.textContainer}>
          <Text style={styles.textStyle}>{segment.content}</Text>
        </View>
      );
  }
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: 8,
  },
  segmentWrapper: {
    marginVertical: 4,
  },
  headingContainer: {
    marginVertical: 12,
    paddingBottom: 8,
  },
  headingText: {
    color: C.yellow,
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  headingUnderline: {
    height: 1,
    backgroundColor: 'rgba(253,230,138,0.3)',
    marginTop: 6,
  },
  stepContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginVertical: 6,
    paddingLeft: 4,
  },
  stepBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(99,102,241,0.2)',
    borderWidth: 1,
    borderColor: C.indigo,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  stepNumber: {
    color: C.indigo,
    fontSize: 12,
    fontWeight: '700',
  },
  stepText: {
    flex: 1,
    color: C.white,
    fontSize: 15,
    lineHeight: 22,
  },
  equationContainer: {
    backgroundColor: 'rgba(99,102,241,0.1)',
    borderRadius: 8,
    padding: 12,
    borderLeftWidth: 3,
    borderLeftColor: C.cyan,
    marginVertical: 8,
  },
  textContainer: {
    paddingVertical: 2,
  },
  inlineMathRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 2,
  },
  textStyle: {
    color: C.white,
    fontSize: 15,
    lineHeight: 22,
  },
});

export default DashBoardContent;