import React from 'react';
import { Text, View } from 'react-native';
import { MathRenderer } from '@/components/ai/dash-assistant/MathRenderer';
import { containsMathSyntax, parseMathSegments } from '@/components/exam-prep/mathSegments';
import { questionCardStyles as styles } from '@/components/exam-prep/question-card/styles';
import { isComplexInlineMath } from '@/components/exam-prep/question-card/helpers';

type RichMathTextProps = {
  value: string;
  textStyle: any;
  textColor: string;
};

export function RichMathText({ value, textStyle, textColor }: RichMathTextProps) {
  const segments = parseMathSegments(value);
  const hasBlock = segments.some((segment) => segment.type === 'block');

  if (segments.length === 0 || !containsMathSyntax(value)) {
    return <Text style={[textStyle, { color: textColor }]}>{value}</Text>;
  }

  if (hasBlock) {
    return (
      <View style={styles.mathBlockWrap}>
        {segments.map((segment, index) => {
          if (segment.type === 'text') {
            return (
              <Text key={`segment-${index}`} style={[textStyle, { color: textColor }]}>
                {segment.value}
              </Text>
            );
          }

          return (
            <MathRenderer
              key={`segment-${index}`}
              expression={segment.value}
              displayMode={segment.type === 'block'}
            />
          );
        })}
      </View>
    );
  }

  return (
    <View style={styles.mathInlineWrap}>
      {segments.map((segment, index) => {
        if (segment.type === 'text') {
          return (
            <Text key={`segment-${index}`} style={[textStyle, { color: textColor }]}>
              {segment.value}
            </Text>
          );
        }
        return (
          <View key={`segment-${index}`} style={styles.mathInlineItem}>
            <MathRenderer
              expression={segment.value}
              displayMode={segment.type === 'block' || isComplexInlineMath(segment.value)}
            />
          </View>
        );
      })}
    </View>
  );
}
