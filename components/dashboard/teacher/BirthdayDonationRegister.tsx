import React, { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, ScrollView } from 'react-native';
import { useTranslation } from 'react-i18next';
import EduDashSpinner from '@/components/ui/EduDashSpinner';
import { useBirthdayDonations } from './birthday-donation/useBirthdayDonations';
import { PAYMENT_METHODS } from './birthday-donation/types';
import type { BirthdayDonationRegisterProps } from './birthday-donation/types';

export const BirthdayDonationRegister: React.FC<BirthdayDonationRegisterProps> = ({ organizationId }) => {
  const { t } = useTranslation();
  const [studentSearch, setStudentSearch] = useState('');
  const {
    isPreschool, useSchoolWide,
    selectedClassId, setSelectedClassId, classGroups, selectedClass,
    reminderClassId, setReminderClassId, reminderClassGroups,
    birthdayWindowMode, setBirthdayWindowMode,
    useFridayCelebration, setUseFridayCelebration,
    setSelectedBirthdayKey,
    upcomingBirthdays, selectedBirthday, celebrationDate,
    emptyMessage,
    paymentMethod, setPaymentMethod,
    activeStudentsLoading, loadingDonations, savingId,
    sendingReminders, error,
    paidStudents, unpaidStudents, paidEntriesByStudentId,
    reminderUnpaidStudents,
    expectedAmount, totalReceived, classReceived, remainingAmount, classExpectedAmount,
    handleMarkPaid, handleMarkUnpaid, handleSendReminderPress, handleOpenMemories,
    styles, theme, showAlert, AlertModalComponent,
  } = useBirthdayDonations({ organizationId });

  const searchQuery = studentSearch.trim().toLowerCase();
  const filteredUnpaidStudents = useMemo(
    () => unpaidStudents.filter((student) => (`${student.firstName} ${student.lastName}`).toLowerCase().includes(searchQuery)),
    [unpaidStudents, searchQuery]
  );
  const filteredPaidStudents = useMemo(
    () => paidStudents.filter((student) => (`${student.firstName} ${student.lastName}`).toLowerCase().includes(searchQuery)),
    [paidStudents, searchQuery]
  );

  if (!organizationId) {
    return (
      <View style={styles.card}>
        <Text style={styles.title}>{t('dashboard.birthday_donations.title', { defaultValue: 'Birthday Donations' })}</Text>
        <Text style={styles.muted}>{t('dashboard.birthday_donations.no_org', { defaultValue: 'Connect your school profile to track donations.' })}</Text>
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <Text style={styles.title}>{t('dashboard.birthday_donations.title', { defaultValue: 'Birthday Donations' })}</Text>
      <Text style={styles.subtitle}>
        {useSchoolWide
          ? t('dashboard.birthday_donations.subtitle_school', { defaultValue: 'Mark R25 birthday contributions for the whole school.' })
          : t('dashboard.birthday_donations.subtitle', { defaultValue: 'Mark R25 birthday contributions for your class.' })}
      </Text>

      {activeStudentsLoading ? (
        <View style={styles.loadingRow}>
          <EduDashSpinner color={theme.primary} />
          <Text style={styles.muted}>{t('common.loading', { defaultValue: 'Loading...' })}</Text>
        </View>
      ) : (
        <>
          {!useSchoolWide && classGroups.length > 1 && (
            <View style={styles.classRow}>
              {classGroups.map((group) => {
                const selected = group.id === selectedClassId;
                return (
                  <TouchableOpacity
                    key={group.id}
                    style={[styles.classChip, selected && { backgroundColor: theme.primary }]}
                    onPress={() => setSelectedClassId(group.id)}
                  >
                    <Text style={[styles.classChipText, selected && { color: '#fff' }]}>{group.name}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          {!useSchoolWide && !selectedClass && (
            <Text style={styles.muted}>{t('dashboard.birthday_donations.no_class', { defaultValue: 'No class assigned yet.' })}</Text>
          )}

          {/* Window mode selector — always visible so teachers can switch to
              Recent/All even when there are no upcoming birthdays */}
          <View style={styles.birthdayPicker}>
            <Text style={styles.label}>{t('dashboard.birthday_donations.select_birthday', { defaultValue: 'Select birthday' })}</Text>
            <View style={styles.windowRow}>
              {(['upcoming', 'recent', 'all'] as const).map((mode) => {
                const selected = mode === birthdayWindowMode;
                const label = mode === 'upcoming'
                  ? t('dashboard.birthday_donations.window_upcoming', { defaultValue: 'Upcoming' })
                  : mode === 'recent'
                    ? t('dashboard.birthday_donations.window_recent', { defaultValue: 'Recent' })
                    : t('dashboard.birthday_donations.window_all', { defaultValue: 'All' });
                return (
                  <TouchableOpacity
                    key={mode}
                    style={[styles.windowChip, selected && { backgroundColor: theme.primary }]}
                    onPress={() => setBirthdayWindowMode(mode)}
                  >
                    <Text style={[styles.windowChipText, selected && { color: '#fff' }]}>{label}</Text>
                  </TouchableOpacity>
                );
              })}
              {isPreschool && (
                <TouchableOpacity
                  style={[styles.windowChip, useFridayCelebration && { backgroundColor: theme.primary }]}
                  onPress={() => setUseFridayCelebration((prev) => !prev)}
                >
                  <Text style={[styles.windowChipText, useFridayCelebration && { color: '#fff' }]}>
                    {t('dashboard.birthday_donations.friday_mode', { defaultValue: 'Friday celebration' })}
                  </Text>
                </TouchableOpacity>
              )}
            </View>

            {upcomingBirthdays.length === 0 ? (
              <Text style={[styles.muted, { marginTop: 8 }]}>
                {emptyMessage}
              </Text>
            ) : (
              <View style={styles.birthdayPickerList}>
                {upcomingBirthdays.map((entry) => {
                  const selected = entry.key === selectedBirthday?.key;
                  const daysLabel = entry.daysUntil === 0
                    ? t('dashboard.birthday_donations.today', { defaultValue: 'Today' })
                    : entry.isPast
                      ? t('dashboard.birthday_donations.days_ago', { defaultValue: '{{count}} days ago', count: Math.abs(entry.daysUntil) })
                      : t('dashboard.birthday_donations.days_until', { defaultValue: '{{count}} days away', count: entry.daysUntil });

                  return (
                    <TouchableOpacity
                      key={entry.key}
                      style={[styles.birthdayChip, selected && { backgroundColor: theme.primary, borderColor: theme.primary }]}
                      onPress={() => setSelectedBirthdayKey(entry.key)}
                    >
                      <Text style={[styles.birthdayChipName, selected && { color: '#fff' }]}>
                        {entry.student.firstName} {entry.student.lastName}
                      </Text>
                      <Text style={[styles.birthdayChipMeta, selected && { color: '#fff' }]}>
                        {entry.date.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' })} • {daysLabel}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
            {upcomingBirthdays.length > 0 && birthdayWindowMode === 'upcoming' && (
              <Text style={styles.helperText}>
                {t('dashboard.birthday_donations.late_hint', {
                  defaultValue: 'Late payment? Switch to Recent or All to record past birthdays.',
                })}
              </Text>
            )}
          </View>

          {selectedBirthday && (
            <View style={styles.birthdayCard}>
              <Text style={styles.label}>{t('dashboard.birthday_donations.selected_label', { defaultValue: 'Selected birthday' })}</Text>
              <Text style={styles.birthdayName}>
                {selectedBirthday.student.firstName} {selectedBirthday.student.lastName}
              </Text>
              <Text style={styles.muted}>
                {selectedBirthday.date.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' })}
                {` • ${selectedBirthday.daysUntil === 0
                  ? t('dashboard.birthday_donations.today', { defaultValue: 'Today' })
                  : selectedBirthday.isPast
                    ? t('dashboard.birthday_donations.days_ago', { defaultValue: '{{count}} days ago', count: Math.abs(selectedBirthday.daysUntil) })
                    : t('dashboard.birthday_donations.days_until', { defaultValue: '{{count}} days away', count: selectedBirthday.daysUntil })}`}
              </Text>
              {celebrationDate && (
                <Text style={styles.muted}>
                  {t('dashboard.birthday_donations.celebration_label', { defaultValue: 'Celebration Friday' })}:{' '}
                  {celebrationDate.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' })}
                </Text>
              )}
            </View>
          )}

          {selectedBirthday && (
            <>
              <View style={styles.summaryGrid}>
                <View style={styles.summaryItem}>
                  <Text style={styles.summaryLabel}>
                    {useSchoolWide
                      ? t('dashboard.birthday_donations.expected_school', { defaultValue: 'School target' })
                      : t('dashboard.birthday_donations.expected_amount', { defaultValue: 'Expected' })}
                  </Text>
                  <Text style={styles.summaryValue}>R{expectedAmount.toFixed(2)}</Text>
                </View>
                <View style={styles.summaryItem}>
                  <Text style={styles.summaryLabel}>
                    {useSchoolWide
                      ? t('dashboard.birthday_donations.received_school', { defaultValue: 'School received' })
                      : t('dashboard.birthday_donations.total_received', { defaultValue: 'Received' })}
                  </Text>
                  <Text style={styles.summaryValue}>R{totalReceived.toFixed(2)}</Text>
                </View>
                <View style={styles.summaryItem}>
                  <Text style={styles.summaryLabel}>
                    {useSchoolWide
                      ? t('dashboard.birthday_donations.remaining_school', { defaultValue: 'School remaining' })
                      : t('dashboard.birthday_donations.remaining', { defaultValue: 'Remaining' })}
                  </Text>
                  <Text style={styles.summaryValue}>R{remainingAmount.toFixed(2)}</Text>
                </View>
              </View>
              {!useSchoolWide && (
                <Text style={styles.muted}>
                  {t('dashboard.birthday_donations.class_progress', {
                    defaultValue: 'Your class: R{{received}} of R{{expected}}',
                    received: classReceived.toFixed(2),
                    expected: classExpectedAmount.toFixed(2),
                  })}
                </Text>
              )}

              <View style={styles.memoriesRow}>
                <TouchableOpacity style={styles.memoriesButton} onPress={handleOpenMemories}>
                  <Text style={styles.memoriesButtonText}>
                    {t('dashboard.birthday_donations.open_memories', { defaultValue: 'Birthday memories' })}
                  </Text>
                </TouchableOpacity>
                <Text style={styles.muted}>
                  {t('dashboard.birthday_donations.memories_hint', { defaultValue: 'Upload and view photos/videos for this birthday.' })}
                </Text>
              </View>

              <View style={styles.formSection}>
                <Text style={styles.label}>{t('dashboard.birthday_donations.method_label', { defaultValue: 'Payment method' })}</Text>
                <View style={styles.methodRow}>
                  {PAYMENT_METHODS.map((method) => {
                    const selected = method === paymentMethod;
                    return (
                      <TouchableOpacity
                        key={method}
                        style={[styles.methodChip, selected && { backgroundColor: theme.primary }]}
                        onPress={() => setPaymentMethod(method)}
                      >
                        <Text style={[styles.methodText, selected && { color: '#fff' }]}>
                          {t(`dashboard.birthday_donations.methods.${method}`, { defaultValue: method.toUpperCase() })}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              {error && <Text style={styles.errorText}>{error}</Text>}

              <View style={styles.listSection}>
                <View style={styles.searchRow}>
                  <TextInput
                    value={studentSearch}
                    onChangeText={setStudentSearch}
                    placeholder={t('dashboard.birthday_donations.search_student', { defaultValue: 'Search learner...' })}
                    placeholderTextColor={theme.textSecondary}
                    style={styles.searchInput}
                  />
                  {!!studentSearch && (
                    <TouchableOpacity style={styles.searchClearButton} onPress={() => setStudentSearch('')}>
                      <Text style={styles.searchClearText}>
                        {t('common.clear', { defaultValue: 'Clear' })}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>

                <View style={styles.sectionHeaderRow}>
                  <Text style={[styles.sectionTitle, styles.sectionTitleInline]}>
                    {t('dashboard.birthday_donations.pending_title', { defaultValue: 'Not paid yet' })}
                    {` (${filteredUnpaidStudents.length}/${unpaidStudents.length})`}
                  </Text>
                  <TouchableOpacity
                    style={[
                      styles.reminderButton,
                      (sendingReminders || reminderUnpaidStudents.length === 0) && styles.reminderButtonDisabled,
                    ]}
                    onPress={handleSendReminderPress}
                    disabled={sendingReminders || reminderUnpaidStudents.length === 0}
                  >
                    <Text
                      style={[
                        styles.reminderButtonText,
                        (sendingReminders || reminderUnpaidStudents.length === 0) && styles.reminderButtonTextDisabled,
                      ]}
                    >
                      {sendingReminders
                        ? t('common.sending', { defaultValue: 'Sending...' })
                        : t('dashboard.birthday_donations.send_reminder', { defaultValue: 'Send reminder' })}
                    </Text>
                  </TouchableOpacity>
                </View>
                {useSchoolWide && reminderClassGroups.length > 1 && (
                  <View style={styles.reminderScopeSection}>
                    <Text style={styles.label}>
                      {t('dashboard.birthday_donations.reminder_scope', { defaultValue: 'Reminder scope' })}
                    </Text>
                    <View style={styles.classRow}>
                      <TouchableOpacity
                        style={[
                          styles.classChip,
                          reminderClassId === 'all' && { backgroundColor: theme.primary },
                        ]}
                        onPress={() => setReminderClassId('all')}
                      >
                        <Text style={[styles.classChipText, reminderClassId === 'all' && { color: '#fff' }]}>
                          {t('dashboard.birthday_donations.reminder_scope_all', { defaultValue: 'All classes' })}
                        </Text>
                      </TouchableOpacity>
                      {reminderClassGroups.map((group) => {
                        const selected = group.id === reminderClassId;
                        return (
                          <TouchableOpacity
                            key={group.id}
                            style={[styles.classChip, selected && { backgroundColor: theme.primary }]}
                            onPress={() => setReminderClassId(group.id)}
                          >
                            <Text style={[styles.classChipText, selected && { color: '#fff' }]}>{group.name}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                )}
                {loadingDonations ? (
                  <Text style={styles.muted}>{t('common.loading', { defaultValue: 'Loading...' })}</Text>
                ) : filteredUnpaidStudents.length === 0 ? (
                  <Text style={styles.muted}>
                    {searchQuery
                      ? t('dashboard.birthday_donations.no_search_results', { defaultValue: 'No learners match your search.' })
                      : t('dashboard.birthday_donations.all_paid', { defaultValue: 'Everyone is paid up 🎉' })}
                  </Text>
                ) : (
                  <ScrollView
                    style={styles.studentListScroll}
                    contentContainerStyle={styles.studentListContent}
                    showsVerticalScrollIndicator
                    nestedScrollEnabled
                  >
                    {filteredUnpaidStudents.map((student) => (
                      <View key={student.id} style={styles.studentRow}>
                        <Text style={styles.studentName}>{student.firstName} {student.lastName}</Text>
                        <TouchableOpacity
                          style={styles.payButton}
                          onPress={() => handleMarkPaid(student)}
                          disabled={savingId === student.id}
                        >
                          <Text style={styles.payButtonText}>
                            {savingId === student.id
                              ? t('common.saving', { defaultValue: 'Saving...' })
                              : t('dashboard.birthday_donations.mark_paid', { defaultValue: 'Mark paid' })}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    ))}
                  </ScrollView>
                )}
              </View>

              <View style={styles.listSection}>
                <Text style={styles.sectionTitle}>
                  {t('dashboard.birthday_donations.paid_title', { defaultValue: 'Paid' })}
                  {` (${filteredPaidStudents.length}/${paidStudents.length})`}
                </Text>
                {filteredPaidStudents.length === 0 ? (
                  <Text style={styles.muted}>
                    {searchQuery
                      ? t('dashboard.birthday_donations.no_search_results', { defaultValue: 'No learners match your search.' })
                      : t('dashboard.birthday_donations.no_paid', { defaultValue: 'No payments recorded yet.' })}
                  </Text>
                ) : (
                  <ScrollView
                    style={styles.studentListScroll}
                    contentContainerStyle={styles.studentListContent}
                    showsVerticalScrollIndicator
                    nestedScrollEnabled
                  >
                    {filteredPaidStudents.map((student) => (
                      <View key={student.id} style={styles.studentRow}>
                        <Text style={styles.studentName}>{student.firstName} {student.lastName}</Text>
                        <View style={styles.paidActions}>
                          <Text style={styles.paidBadge}>{t('dashboard.birthday_donations.paid_badge', { defaultValue: 'Paid' })}</Text>
                          <TouchableOpacity
                            style={styles.unpayButton}
                            onPress={() => {
                              const donationEntry = paidEntriesByStudentId.get(student.id);
                              if (!donationEntry) return;
                              showAlert({
                                title: t('dashboard.birthday_donations.confirm_unpaid_title', { defaultValue: 'Mark unpaid?' }),
                                message: t('dashboard.birthday_donations.confirm_unpaid_message', {
                                  defaultValue: 'This will remove the payment for {{name}}.',
                                  name: `${student.firstName} ${student.lastName}`.trim(),
                                }),
                                type: 'warning',
                                buttons: [
                                  { text: t('common.cancel', { defaultValue: 'Cancel' }), style: 'cancel' },
                                  {
                                    text: t('dashboard.birthday_donations.confirm_unpaid_cta', { defaultValue: 'Mark unpaid' }),
                                    style: 'destructive',
                                    onPress: () => handleMarkUnpaid(student, donationEntry),
                                  },
                                ],
                              });
                            }}
                            disabled={savingId === student.id}
                          >
                            <Text style={styles.unpayButtonText}>
                              {savingId === student.id
                                ? t('common.saving', { defaultValue: 'Saving...' })
                                : t('dashboard.birthday_donations.mark_unpaid', { defaultValue: 'Mark unpaid' })}
                            </Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    ))}
                  </ScrollView>
                )}
              </View>
            </>
          )}
        </>
      )}
      <AlertModalComponent />
    </View>
  );
};
