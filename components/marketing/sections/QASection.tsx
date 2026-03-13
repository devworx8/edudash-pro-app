import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { IconSymbol } from '@/components/ui/IconSymbol';
import { marketingTokens } from '../tokens';
import { Section } from '../Section';
import { SectionHeader } from '../SectionHeader';
import { GlassCard } from '../GlassCard';

const faqs = [
  {
    question: 'How does the AI assistance work?',
    answer: 'Our AI tools run securely on the server with strict privacy and COPPA compliance. No child data is used for AI training. All AI features use PII redaction and Row-Level Security (RLS) to protect sensitive information.',
  },
  {
    question: 'Is it safe for preschool children?',
    answer: 'Yes. EduDash Pro uses parental consent, data minimization, and strict child-data protections. Core learner, parent, and school workflows are ad-free, and any limited sponsored placements are restricted to eligible adult community users only.',
  },
  {
    question: 'Do I need technical skills to use it?',
    answer: 'No technical skills required. Our platform is designed to be intuitive for teachers, parents, and administrators with no prior tech experience. We also provide onboarding support and training materials.',
  },
  {
    question: 'Can I try before committing?',
    answer: 'Absolutely! We offer a 14-day free trial with full access to all Pro features. No credit card required to start, and you can cancel anytime.',
  },
];

export function QASection() {
  const [expanded, setExpanded] = useState<number | null>(null);

  return (
    <Section style={styles.section}>
      <SectionHeader
        overline="FAQ"
        title="Frequently Asked Questions"
        subtitle="Common questions about EduDash Pro"
      />

      <View style={styles.list}>
        {faqs.map((faq, index) => (
          <Pressable
            key={index}
            onPress={() => setExpanded(expanded === index ? null : index)}
            accessibilityRole="button"
            accessibilityLabel={`${faq.question}. ${expanded === index ? 'Collapse' : 'Expand'} answer`}
          >
            <GlassCard 
              intensity={expanded === index ? 'medium' : 'soft'}
              style={styles.item}
            >
              <View style={styles.questionRow}>
                <Text style={styles.question}>{faq.question}</Text>
                <IconSymbol 
                  name={expanded === index ? 'chevron.up' : 'chevron.down'} 
                  size={20} 
                  color={marketingTokens.colors.accent.cyan400} 
                />
              </View>
              
              {expanded === index && (
                <Text style={styles.answer}>{faq.answer}</Text>
              )}
            </GlassCard>
          </Pressable>
        ))}
      </View>
    </Section>
  );
}

const styles = StyleSheet.create({
  section: {
    backgroundColor: marketingTokens.colors.bg.elevated,
  },
  list: {
    gap: marketingTokens.spacing.md,
  },
  item: {
    minHeight: 64,
    justifyContent: 'center',
  },
  questionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: marketingTokens.spacing.md,
  },
  question: {
    ...marketingTokens.typography.body,
    fontWeight: '700',
    color: marketingTokens.colors.fg.primary,
    flex: 1,
  },
  answer: {
    ...marketingTokens.typography.body,
    fontSize: 14,
    color: marketingTokens.colors.fg.secondary,
    lineHeight: 22,
    marginTop: marketingTokens.spacing.lg,
  },
});
