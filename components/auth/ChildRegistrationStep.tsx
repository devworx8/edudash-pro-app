import React from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Platform,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { ChildRegistrationData } from '@/types/auth-enhanced';

const MAX_CHILDREN = 5;

const SA_GRADES = [
  'Grade R',
  'Grade 1',
  'Grade 2',
  'Grade 3',
  'Grade 4',
  'Grade 5',
  'Grade 6',
  'Grade 7',
  'Grade 8',
  'Grade 9',
  'Grade 10',
  'Grade 11',
  'Grade 12',
];

interface StepTheme {
  colors: {
    background: string;
    surface: string;
    surfaceVariant: string;
    outline: string;
    error: string;
    onSurface: string;
    onSurfaceVariant: string;
    primary: string;
    onPrimary: string;
    primaryContainer: string;
    onPrimaryContainer: string;
  };
  typography: {
    body1: { fontSize: number };
    body2: { fontSize: number };
    titleLarge: { fontSize: number; fontWeight?: string | number };
    subtitle2: { fontWeight?: string | number };
    caption: { fontSize: number };
  };
}

interface ChildRegistrationStepProps {
  theme: StepTheme;
  addedChildren: ChildRegistrationData[];
  loading: boolean;
  onAddChild: (child: ChildRegistrationData) => void;
  onRemoveChild: (index: number) => void;
  onUpdateChild: (index: number, child: ChildRegistrationData) => void;
  onSkip: () => void;
  onContinue: () => void;
}

const emptyChild = (): ChildRegistrationData => ({
  firstName: '',
  lastName: '',
  dateOfBirth: '',
  grade: '',
});

export const ChildRegistrationStep: React.FC<ChildRegistrationStepProps> = ({
  theme,
  addedChildren,
  loading,
  onAddChild,
  onRemoveChild,
  onUpdateChild,
  onSkip,
  onContinue,
}) => {
  const [draft, setDraft] = React.useState<ChildRegistrationData>(emptyChild());
  const [draftErrors, setDraftErrors] = React.useState<Record<string, string>>({});
  const [showGradePicker, setShowGradePicker] = React.useState(false);
  const [showDatePicker, setShowDatePicker] = React.useState(false);

  const formatDateString = (date: Date): string => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  const parseDateString = (s: string): Date | null => {
    const parts = s.split('-');
    if (parts.length !== 3) return null;
    const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    return isNaN(d.getTime()) ? null : d;
  };

  const validateDraft = (): boolean => {
    const errs: Record<string, string> = {};
    if (!draft.firstName.trim()) errs.firstName = 'First name is required';
    if (!draft.lastName.trim()) errs.lastName = 'Last name is required';
    if (!draft.grade) errs.grade = 'Please select a grade';
    if (!draft.dateOfBirth) {
      errs.dateOfBirth = 'Date of birth is required';
    } else {
      // Preschool age validation: 6 months to 6 years
      const now = new Date();
      const dob = new Date(draft.dateOfBirth);
      const minDate = new Date(now.getFullYear(), now.getMonth() - 6, now.getDate());
      const maxDate = new Date(now.getFullYear() - 6, now.getMonth(), now.getDate());
      if (dob > now) {
        errs.dateOfBirth = 'Date of birth cannot be in the future';
      } else if (dob > minDate) {
        errs.dateOfBirth = 'Child must be at least 6 months old';
      } else if (dob < maxDate) {
        errs.dateOfBirth = 'Child must be younger than 6 years for preschool';
      }
    }
    setDraftErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleAddChild = () => {
    if (!validateDraft()) return;
    onAddChild({ ...draft });
    setDraft(emptyChild());
    setDraftErrors({});
    setShowGradePicker(false);
  };

  const handleDraftChange = (field: keyof ChildRegistrationData, value: string) => {
    setDraft(prev => ({ ...prev, [field]: value }));
    if (draftErrors[field]) {
      setDraftErrors(prev => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  };

  const canAddMore = addedChildren.length < MAX_CHILDREN;

  return (
    <View style={styles.stepContent}>
      <Text
        style={[
          styles.stepTitle,
          { color: theme.colors.onSurface, fontSize: theme.typography.titleLarge.fontSize },
        ]}
      >
        Add Your Child
      </Text>
      <Text
        style={[
          styles.stepDescription,
          { color: theme.colors.onSurfaceVariant, fontSize: theme.typography.body2.fontSize },
        ]}
      >
        Link your child to see their progress, homework, and school updates.
      </Text>

      {addedChildren.length > 0 && (
        <View style={styles.childrenList}>
          {addedChildren.map((child, idx) => (
            <View
              key={`child-${idx}`}
              style={[
                styles.childCard,
                {
                  backgroundColor: theme.colors.primaryContainer,
                  borderColor: theme.colors.primary + '44',
                },
              ]}
            >
              <View style={styles.childCardContent}>
                <Text style={[styles.childName, { color: theme.colors.onPrimaryContainer }]}>
                  {child.firstName} {child.lastName}
                </Text>
                <Text style={[styles.childGrade, { color: theme.colors.onPrimaryContainer }]}>
                  {child.grade}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => onRemoveChild(idx)}
                style={[styles.removeBtn, { backgroundColor: theme.colors.error + '18' }]}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={{ color: theme.colors.error, fontWeight: '700', fontSize: 16 }}>
                  ✕
                </Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}

      {canAddMore && (
        <View style={[styles.formSection, { backgroundColor: theme.colors.surface, borderColor: theme.colors.outline }]}>
          <Text style={[styles.formSectionTitle, { color: theme.colors.onSurface }]}>
            {addedChildren.length === 0 ? 'Child details' : 'Add another child'}
          </Text>

          <View style={styles.row}>
            <View style={styles.column}>
              <Text style={[styles.label, { color: theme.colors.onSurface }]}>First Name *</Text>
              <TextInput
                style={[
                  styles.input,
                  {
                    backgroundColor: theme.colors.surface,
                    borderColor: draftErrors.firstName ? theme.colors.error : theme.colors.outline,
                    color: theme.colors.onSurface,
                  },
                ]}
                value={draft.firstName}
                onChangeText={v => handleDraftChange('firstName', v)}
                placeholder="First name"
                placeholderTextColor={theme.colors.onSurfaceVariant}
                editable={!loading}
              />
              {draftErrors.firstName ? (
                <Text style={[styles.errorText, { color: theme.colors.error }]}>{draftErrors.firstName}</Text>
              ) : null}
            </View>
            <View style={styles.column}>
              <Text style={[styles.label, { color: theme.colors.onSurface }]}>Last Name *</Text>
              <TextInput
                style={[
                  styles.input,
                  {
                    backgroundColor: theme.colors.surface,
                    borderColor: draftErrors.lastName ? theme.colors.error : theme.colors.outline,
                    color: theme.colors.onSurface,
                  },
                ]}
                value={draft.lastName}
                onChangeText={v => handleDraftChange('lastName', v)}
                placeholder="Last name"
                placeholderTextColor={theme.colors.onSurfaceVariant}
                editable={!loading}
              />
              {draftErrors.lastName ? (
                <Text style={[styles.errorText, { color: theme.colors.error }]}>{draftErrors.lastName}</Text>
              ) : null}
            </View>
          </View>

          <View style={styles.fieldContainer}>
            <Text style={[styles.label, { color: theme.colors.onSurface }]}>Date of Birth *</Text>
            <TouchableOpacity
              style={[
                styles.input,
                {
                  backgroundColor: theme.colors.surface,
                  borderColor: draftErrors.dateOfBirth ? theme.colors.error : theme.colors.outline,
                  justifyContent: 'center',
                },
              ]}
              onPress={() => setShowDatePicker(true)}
              disabled={loading}
            >
              <Text
                style={{
                  color: draft.dateOfBirth ? theme.colors.onSurface : theme.colors.onSurfaceVariant,
                  fontSize: 16,
                }}
              >
                {draft.dateOfBirth || 'Select date of birth'}
              </Text>
            </TouchableOpacity>
            {draftErrors.dateOfBirth ? (
              <Text style={[styles.errorText, { color: theme.colors.error }]}>{draftErrors.dateOfBirth}</Text>
            ) : null}

            {showDatePicker && Platform.OS !== 'web' && (
              <DateTimePicker
                value={parseDateString(draft.dateOfBirth) || new Date()}
                mode="date"
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                maximumDate={new Date()}
                minimumDate={new Date(1990, 0, 1)}
                onChange={(_event, selectedDate) => {
                  setShowDatePicker(Platform.OS === 'ios');
                  if (selectedDate) {
                    handleDraftChange('dateOfBirth', formatDateString(selectedDate));
                  }
                }}
              />
            )}
            {showDatePicker && Platform.OS === 'web' && (
              <TextInput
                style={[
                  styles.input,
                  {
                    backgroundColor: theme.colors.surface,
                    borderColor: theme.colors.primary,
                    color: theme.colors.onSurface,
                    marginTop: 8,
                  },
                ]}
                value={draft.dateOfBirth}
                onChangeText={(v) => {
                  handleDraftChange('dateOfBirth', v);
                }}
                onBlur={() => setShowDatePicker(false)}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={theme.colors.onSurfaceVariant}
                autoFocus
                // @ts-ignore — web-only prop for HTML input type
                type="date"
              />
            )}
          </View>

          <View style={styles.fieldContainer}>
            <Text style={[styles.label, { color: theme.colors.onSurface }]}>Grade *</Text>
            <TouchableOpacity
              style={[
                styles.input,
                {
                  backgroundColor: theme.colors.surface,
                  borderColor: draftErrors.grade ? theme.colors.error : theme.colors.outline,
                  justifyContent: 'center',
                },
              ]}
              onPress={() => setShowGradePicker(!showGradePicker)}
              disabled={loading}
            >
              <Text
                style={{
                  color: draft.grade ? theme.colors.onSurface : theme.colors.onSurfaceVariant,
                  fontSize: 16,
                }}
              >
                {draft.grade || 'Select grade'}
              </Text>
            </TouchableOpacity>
            {draftErrors.grade ? (
              <Text style={[styles.errorText, { color: theme.colors.error }]}>{draftErrors.grade}</Text>
            ) : null}

            {showGradePicker && (
              <ScrollView
                style={[styles.gradeList, { backgroundColor: theme.colors.surface, borderColor: theme.colors.outline }]}
                nestedScrollEnabled
              >
                {SA_GRADES.map(g => (
                  <TouchableOpacity
                    key={g}
                    style={[
                      styles.gradeOption,
                      {
                        backgroundColor: draft.grade === g ? theme.colors.primaryContainer : 'transparent',
                      },
                    ]}
                    onPress={() => {
                      handleDraftChange('grade', g);
                      setShowGradePicker(false);
                    }}
                  >
                    <Text
                      style={{
                        color: draft.grade === g ? theme.colors.onPrimaryContainer : theme.colors.onSurface,
                        fontWeight: draft.grade === g ? '600' : '400',
                      }}
                    >
                      {g}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
          </View>

          <TouchableOpacity
            style={[styles.addButton, { borderColor: theme.colors.primary }]}
            onPress={handleAddChild}
            disabled={loading}
          >
            <Text style={{ color: theme.colors.primary, fontWeight: '600', fontSize: 15 }}>
              {addedChildren.length === 0 ? '+ Add Child' : '+ Add Another Child'}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {!canAddMore && (
        <Text style={[styles.maxNote, { color: theme.colors.onSurfaceVariant }]}>
          Maximum of {MAX_CHILDREN} children reached.
        </Text>
      )}

      <TouchableOpacity
        onPress={onSkip}
        disabled={loading}
        style={styles.skipLink}
      >
        <Text style={{ color: theme.colors.onSurfaceVariant, fontSize: 14, textDecorationLine: 'underline' }}>
          Skip for now
        </Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  stepContent: {
    marginVertical: 24,
  },
  stepTitle: {
    textAlign: 'center',
    fontWeight: '700',
    marginBottom: 8,
  },
  stepDescription: {
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 22,
  },
  childrenList: {
    gap: 10,
    marginBottom: 16,
  },
  childCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
  },
  childCardContent: {
    flex: 1,
  },
  childName: {
    fontSize: 15,
    fontWeight: '600',
  },
  childGrade: {
    fontSize: 13,
    marginTop: 2,
    opacity: 0.85,
  },
  removeBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  formSection: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    gap: 14,
  },
  formSectionTitle: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 2,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  column: {
    flex: 1,
  },
  fieldContainer: {
    gap: 6,
  },
  label: {
    fontWeight: '600',
    fontSize: 14,
    marginBottom: 4,
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
  },
  errorText: {
    fontSize: 12,
    marginLeft: 4,
  },
  gradeList: {
    maxHeight: 200,
    borderWidth: 1,
    borderRadius: 10,
    marginTop: 4,
  },
  gradeOption: {
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  addButton: {
    borderWidth: 2,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    borderStyle: 'dashed',
    marginTop: 4,
  },
  maxNote: {
    textAlign: 'center',
    fontSize: 13,
    marginTop: 8,
  },
  skipLink: {
    alignItems: 'center',
    marginTop: 20,
    paddingVertical: 8,
  },
});

export default ChildRegistrationStep;
