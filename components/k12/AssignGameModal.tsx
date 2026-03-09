/**
 * Assign Game Modal — EduDash Arena
 * Bottom-sheet modal for assigning a K-12 game to a class.
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Modal,
  Switch,
  TextInput,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';

import type { K12Game, K12Difficulty } from '@/lib/activities/k12Activities.types';
import { GRADE_RANGE_LABELS } from '@/lib/activities/k12Activities.types';
import type { ClassRow, AssignGamePayload } from '@/hooks/k12/useTeacherGameControl';

interface Props {
  game: K12Game | null;
  classes: ClassRow[];
  visible: boolean;
  onClose: () => void;
  onSubmit: (payload: AssignGamePayload) => void;
  colors: {
    card: string;
    text: string;
    textSecondary: string;
    surface: string;
    border: string;
  };
}

export default function AssignGameModal({ game, classes, visible, onClose, onSubmit, colors }: Props) {
  const [classId, setClassId] = useState('');
  const [difficulty, setDifficulty] = useState<K12Difficulty>('medium');
  const [isChallenge, setIsChallenge] = useState(false);
  const [showLeaderboard, setShowLeaderboard] = useState(true);
  const [maxAttempts, setMaxAttempts] = useState('3');
  const [hasDueDate, setHasDueDate] = useState(false);
  const [dueDate, setDueDate] = useState(new Date(Date.now() + 7 * 86_400_000));
  const [showDatePicker, setShowDatePicker] = useState(false);

  const valid = classId.length > 0 && game !== null;

  const handleSubmit = () => {
    if (!valid || !game) return;
    onSubmit({
      game_id: game.id,
      class_id: classId,
      difficulty,
      due_date: hasDueDate ? dueDate.toISOString() : null,
      is_challenge: isChallenge,
      show_leaderboard: showLeaderboard,
      max_attempts: Math.max(1, Math.min(10, parseInt(maxAttempts, 10) || 3)),
    });
    // Reset state
    setClassId('');
    setDifficulty('medium');
    setIsChallenge(false);
    setShowLeaderboard(true);
    setMaxAttempts('3');
    setHasDueDate(false);
  };

  if (!game) return null;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.overlay}>
        <View style={[s.sheet, { backgroundColor: colors.card }]}>
          {/* Header */}
          <View style={s.header}>
            <Text style={s.emoji}>{game.emoji}</Text>
            <View style={{ flex: 1 }}>
              <Text style={[s.title, { color: colors.text }]}>{game.title}</Text>
              <Text style={[s.sub, { color: colors.textSecondary }]}>
                {GRADE_RANGE_LABELS[game.gradeRange]} · {game.durationMinutes} min
              </Text>
            </View>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={24} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} style={{ marginTop: 16 }}>
            {/* Class picker */}
            <Text style={[s.label, { color: colors.textSecondary }]}>Assign to class</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
              {classes.map(c => (
                <TouchableOpacity
                  key={c.id}
                  onPress={() => setClassId(c.id)}
                  style={[
                    s.pill,
                    {
                      backgroundColor: classId === c.id ? '#4F46E5' : colors.surface,
                      borderColor: classId === c.id ? '#4F46E5' : colors.border,
                    },
                  ]}
                >
                  <Text style={{ color: classId === c.id ? '#fff' : colors.text, fontSize: 13 }}>
                    {c.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Difficulty */}
            <Text style={[s.label, { color: colors.textSecondary }]}>Difficulty</Text>
            <View style={[s.segRow, { marginBottom: 16 }]}>
              {(['easy', 'medium', 'hard'] as K12Difficulty[]).map(d => (
                <TouchableOpacity
                  key={d}
                  onPress={() => setDifficulty(d)}
                  style={[
                    s.seg,
                    {
                      backgroundColor: difficulty === d ? '#4F46E5' : colors.surface,
                      borderColor: difficulty === d ? '#4F46E5' : colors.border,
                    },
                  ]}
                >
                  <Text style={{ color: difficulty === d ? '#fff' : colors.text, fontSize: 13 }}>
                    {d.charAt(0).toUpperCase() + d.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Max attempts */}
            <Text style={[s.label, { color: colors.textSecondary }]}>Max attempts</Text>
            <TextInput
              value={maxAttempts}
              onChangeText={setMaxAttempts}
              keyboardType="number-pad"
              maxLength={2}
              style={[
                s.input,
                { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface },
              ]}
            />

            {/* Toggles */}
            <View style={[s.toggleRow, { borderColor: colors.border }]}>
              <View>
                <Text style={[s.toggleLabel, { color: colors.text }]}>Challenge mode</Text>
                <Text style={[s.toggleSub, { color: colors.textSecondary }]}>
                  Shows a countdown and highlights top scorers
                </Text>
              </View>
              <Switch value={isChallenge} onValueChange={setIsChallenge} trackColor={{ true: '#4F46E5' }} />
            </View>

            <View style={[s.toggleRow, { borderColor: colors.border }]}>
              <View>
                <Text style={[s.toggleLabel, { color: colors.text }]}>Class leaderboard</Text>
                <Text style={[s.toggleSub, { color: colors.textSecondary }]}>
                  Students can see each other's scores
                </Text>
              </View>
              <Switch value={showLeaderboard} onValueChange={setShowLeaderboard} trackColor={{ true: '#4F46E5' }} />
            </View>

            <View style={[s.toggleRow, { borderColor: colors.border }]}>
              <View>
                <Text style={[s.toggleLabel, { color: colors.text }]}>Set due date</Text>
              </View>
              <Switch value={hasDueDate} onValueChange={setHasDueDate} trackColor={{ true: '#4F46E5' }} />
            </View>
            {hasDueDate && (
              <TouchableOpacity
                onPress={() => setShowDatePicker(true)}
                style={[s.dateBtn, { borderColor: colors.border, backgroundColor: colors.surface }]}
              >
                <Ionicons name="calendar-outline" size={16} color={colors.textSecondary} />
                <Text style={{ color: colors.text, marginLeft: 8, fontSize: 14 }}>
                  Due: {dueDate.toLocaleDateString('en-ZA')}
                </Text>
              </TouchableOpacity>
            )}
            {showDatePicker && (
              <DateTimePicker
                value={dueDate}
                mode="date"
                minimumDate={new Date()}
                onChange={(_, date) => {
                  setShowDatePicker(false);
                  if (date) setDueDate(date);
                }}
              />
            )}

            <TouchableOpacity
              onPress={handleSubmit}
              disabled={!valid}
              style={[s.submitBtn, { opacity: valid ? 1 : 0.45 }]}
            >
              <Ionicons name="checkmark-circle" size={20} color="#fff" />
              <Text style={s.submitText}>Assign to Class</Text>
            </TouchableOpacity>
            <View style={{ height: 32 }} />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: '85%' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  emoji: { fontSize: 32 },
  title: { fontSize: 17, fontWeight: '700' },
  sub: { fontSize: 12, marginTop: 2 },
  label: {
    fontSize: 12, fontWeight: '600', marginBottom: 8,
    textTransform: 'uppercase', letterSpacing: 0.5,
  },
  pill: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
    borderWidth: 1, marginRight: 8,
  },
  segRow: { flexDirection: 'row', gap: 8 },
  seg: { flex: 1, paddingVertical: 10, borderRadius: 8, borderWidth: 1, alignItems: 'center' },
  input: {
    height: 44, borderWidth: 1, borderRadius: 8,
    paddingHorizontal: 14, fontSize: 16, marginBottom: 16, width: 80,
  },
  toggleRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 14, borderBottomWidth: 1, marginBottom: 4,
  },
  toggleLabel: { fontSize: 14, fontWeight: '600' },
  toggleSub: { fontSize: 12, marginTop: 2, maxWidth: 220 },
  dateBtn: {
    flexDirection: 'row', alignItems: 'center', borderWidth: 1,
    borderRadius: 8, paddingHorizontal: 14, paddingVertical: 10,
    marginTop: 8, marginBottom: 4, alignSelf: 'flex-start',
  },
  submitBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#4F46E5', borderRadius: 12, paddingVertical: 14,
    marginTop: 20, gap: 8,
  },
  submitText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
