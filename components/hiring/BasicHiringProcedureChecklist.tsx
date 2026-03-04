/**
 * Basic Hiring Procedure Checklist
 *
 * Renders the 9-step hiring procedure so principals can follow it from
 * Hiring Hub and Teacher Management. Steps link to the relevant screens.
 */

import React, { useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { BASIC_HIRING_PROCEDURE_STEPS } from '@/lib/hiring/basicHiringProcedure';
import type { ThemeColors } from '@/contexts/ThemeContext';

interface BasicHiringProcedureChecklistProps {
  theme: ThemeColors;
  /** Optional: collapse by default */
  defaultCollapsed?: boolean;
}

export function BasicHiringProcedureChecklist({ theme, defaultCollapsed = true }: BasicHiringProcedureChecklistProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  return (
    <View style={{ marginHorizontal: 16, marginBottom: 16, backgroundColor: theme.surface, borderRadius: 14, borderWidth: 1, borderColor: theme.border, overflow: 'hidden' }}>
      <TouchableOpacity
        style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 14 }}
        onPress={() => setCollapsed((c) => !c)}
        activeOpacity={0.7}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Ionicons name="list-outline" size={20} color={theme.primary} />
          <Text style={{ fontSize: 15, fontWeight: '700', color: theme.text }}>Basic Hiring Procedure</Text>
        </View>
        <Ionicons name={collapsed ? 'chevron-down' : 'chevron-up'} size={22} color={theme.textSecondary} />
      </TouchableOpacity>
      {!collapsed && (
        <View style={{ paddingHorizontal: 14, paddingBottom: 14 }}>
          <Text style={{ fontSize: 12, color: theme.textSecondary, marginBottom: 10 }}>
            Follow these steps for each hire. Use the links to open the right screen.
          </Text>
          {BASIC_HIRING_PROCEDURE_STEPS.map((step) => (
            <TouchableOpacity
              key={step.order}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                paddingVertical: 10,
                paddingHorizontal: 10,
                borderRadius: 8,
                backgroundColor: theme.background,
                marginBottom: 6,
              }}
              onPress={() => step.route && router.push(step.route as any)}
              activeOpacity={0.7}
              disabled={!step.route}
            >
              <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: theme.primary + '25', justifyContent: 'center', alignItems: 'center', marginRight: 10 }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: theme.primary }}>{step.order}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontWeight: '600', color: theme.text }}>{step.label}</Text>
                <Text style={{ fontSize: 11, color: theme.textSecondary, marginTop: 2 }}>{step.appLocation}</Text>
              </View>
              {step.route && <Ionicons name="chevron-forward" size={18} color={theme.textSecondary} />}
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}
