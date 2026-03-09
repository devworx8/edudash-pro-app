import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import EduDashSpinner from '@/components/ui/EduDashSpinner';
import type { FeeCategoryCode } from '@/types/finance';
import type { PettyCashRequest } from '@/services/ApprovalWorkflowService';
import type { POPUpload, StatusFilter } from './pop-review.constants';
import {
  formatAmount,
  formatDate,
  formatMonth,
  getStatusColor,
  getStatusIcon,
  normalizePOPStatus,
} from './pop-review.utils';

interface ThemeLike {
  [key: string]: any;
}

interface StyleLike {
  [key: string]: any;
}

interface CategoryMetaLike {
  label: string;
  color: string;
  icon: string;
}

interface POPUploadCardProps {
  item: POPUpload;
  processing: string | null;
  theme: ThemeLike;
  styles: StyleLike;
  queueMonthSelections: Record<string, string>;
  resolveQueueDisplayMonth: (upload: POPUpload) => string;
  getCategoryMeta: (upload: POPUpload) => CategoryMetaLike;
  onViewDocument: (upload: POPUpload) => void;
  onOpenReceiptModal: (upload: POPUpload) => void;
  onOpenQueueMonthPicker: (upload: POPUpload) => void;
  onOpenCategoryPicker: (upload: POPUpload) => void;
  onReject: (upload: POPUpload) => void;
  onApprove: (upload: POPUpload) => void;
}

export const POPUploadCard: React.FC<POPUploadCardProps> = ({
  item,
  processing,
  theme,
  styles,
  queueMonthSelections,
  resolveQueueDisplayMonth,
  getCategoryMeta,
  onViewDocument,
  onOpenReceiptModal,
  onOpenQueueMonthPicker,
  onOpenCategoryPicker,
  onReject,
  onApprove,
}) => {
  const status = normalizePOPStatus(item.status);
  const isProcessing = processing === item.id;
  const studentName = item.student
    ? `${item.student.first_name} ${item.student.last_name}`
    : 'Unknown Student';
  const uploaderName = (() => {
    if (!item.uploader) return 'Unknown';
    const fn = item.uploader.first_name ?? '';
    const ln = item.uploader.last_name ?? '';
    const name = `${fn} ${ln}`.trim();
    return name || (item.uploader as { email?: string }).email || 'School admin';
  })();
  const selectedMonth = queueMonthSelections[item.id];
  const paymentForMonth = selectedMonth || resolveQueueDisplayMonth(item);
  const categoryMeta = getCategoryMeta(item);

  return (
    <View style={[styles.card, { backgroundColor: theme.cardBackground, borderColor: theme.border }]}>
      <View style={styles.cardHeader}>
        <View style={styles.cardHeaderLeft}>
          <View style={[styles.statusBadge, { backgroundColor: getStatusColor(status) + '20' }]}>
            <Ionicons name={getStatusIcon(status) as any} size={16} color={getStatusColor(status)} />
            <Text style={[styles.statusText, { color: getStatusColor(status) }]}>
              {status.charAt(0).toUpperCase() + status.slice(1)}
            </Text>
          </View>
          <Text style={[styles.dateText, { color: theme.textSecondary }]}>
            {formatDate(item.created_at)}
          </Text>
        </View>
        <View style={styles.cardHeaderActions}>
          <TouchableOpacity onPress={() => onViewDocument(item)} style={styles.viewButton}>
            <Ionicons name="document-text" size={20} color={theme.primary} />
          </TouchableOpacity>
          {status === 'approved' ? (
            <TouchableOpacity
              onPress={() => onOpenReceiptModal(item)}
              style={styles.viewButton}
              accessibilityLabel="Generate receipt"
            >
              <Ionicons name="receipt-outline" size={20} color={theme.success} />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      <View style={styles.cardContent}>
        <View style={styles.infoRow}>
          <Ionicons name="person" size={16} color={theme.textSecondary} />
          <Text style={[styles.infoLabel, { color: theme.textSecondary }]}>Student:</Text>
          <Text style={[styles.infoValue, { color: theme.text }]}>{studentName}</Text>
        </View>

        <View style={styles.infoRow}>
          <Ionicons name="person-circle" size={16} color={theme.textSecondary} />
          <Text style={[styles.infoLabel, { color: theme.textSecondary }]}>Submitted by:</Text>
          <Text style={[styles.infoValue, { color: theme.text }]}>{uploaderName}</Text>
        </View>

        <View style={styles.infoRow}>
          <Ionicons name="cash" size={16} color={theme.textSecondary} />
          <Text style={[styles.infoLabel, { color: theme.textSecondary }]}>Amount:</Text>
          <Text style={[styles.infoValue, { color: theme.success, fontWeight: '600' }]}>
            {formatAmount(item.payment_amount)}
          </Text>
        </View>

        {(paymentForMonth || status === 'pending') && (
          <View style={styles.infoRow}>
            <Ionicons name="calendar" size={16} color={theme.textSecondary} />
            <Text style={[styles.infoLabel, { color: theme.textSecondary }]}>Payment For:</Text>
            <Text style={[styles.infoValue, { color: theme.text }]}>
              {paymentForMonth ? formatMonth(paymentForMonth) : 'Not set'}
            </Text>
            {status === 'pending' && (
              <TouchableOpacity
                style={[styles.categoryEditButton, { borderColor: theme.border }]}
                onPress={() => onOpenQueueMonthPicker(item)}
              >
                <Ionicons name="create-outline" size={12} color={theme.textSecondary} />
                <Text style={[styles.categoryEditText, { color: theme.textSecondary }]}>
                  Change
                </Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {status === 'pending' && (
          <View style={styles.infoRow}>
            <Ionicons
              name="calendar-outline"
              size={16}
              color={selectedMonth ? theme.primary : theme.warning || '#F59E0B'}
            />
            <Text style={[styles.infoLabel, { color: theme.textSecondary }]}>Accounting Month:</Text>
            <TouchableOpacity
              style={[
                styles.monthPickerButton,
                { borderColor: selectedMonth ? theme.primary + '60' : theme.warning || '#F59E0B' },
              ]}
              onPress={() => onOpenQueueMonthPicker(item)}
            >
              <Text
                style={[
                  styles.monthPickerButtonText,
                  { color: selectedMonth ? theme.primary : theme.warning || '#F59E0B' },
                ]}
              >
                {selectedMonth
                  ? new Date(selectedMonth).toLocaleDateString('en-ZA', { month: 'short', year: 'numeric' })
                  : 'Select month'}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.infoRow}>
          <Ionicons name="pricetag" size={16} color={theme.textSecondary} />
          <Text style={[styles.infoLabel, { color: theme.textSecondary }]}>Category:</Text>
          <View style={[styles.categoryBadge, { backgroundColor: categoryMeta.color + '20', borderColor: categoryMeta.color + '55' }]}>
            <Ionicons name={categoryMeta.icon as any} size={12} color={categoryMeta.color} />
            <Text style={[styles.categoryBadgeText, { color: categoryMeta.color }]}>{categoryMeta.label}</Text>
          </View>
          {status === 'pending' && (
            <TouchableOpacity
              style={[styles.categoryEditButton, { borderColor: theme.border }]}
              onPress={() => onOpenCategoryPicker(item)}
            >
              <Ionicons name="create-outline" size={12} color={theme.textSecondary} />
              <Text style={[styles.categoryEditText, { color: theme.textSecondary }]}>Change</Text>
            </TouchableOpacity>
          )}
        </View>

        {item.payment_reference && (
          <View style={styles.infoRow}>
            <Ionicons name="barcode" size={16} color={theme.textSecondary} />
            <Text style={[styles.infoLabel, { color: theme.textSecondary }]}>Reference:</Text>
            <Text style={[styles.infoValue, { color: theme.text }]}>{item.payment_reference}</Text>
          </View>
        )}
      </View>

      {status === 'pending' && (
        <View style={styles.cardActions}>
          <TouchableOpacity
            style={[styles.actionButton, styles.rejectButton, { borderColor: theme.error }]}
            onPress={() => onReject(item)}
            disabled={isProcessing}
          >
            {isProcessing ? (
              <EduDashSpinner size="small" color={theme.error} />
            ) : (
              <>
                <Ionicons name="close" size={18} color={theme.error} />
                <Text style={[styles.actionButtonText, { color: theme.error }]}>Reject</Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionButton, styles.approveButton, { backgroundColor: theme.success }]}
            onPress={() => onApprove(item)}
            disabled={isProcessing || !selectedMonth}
          >
            {isProcessing ? (
              <EduDashSpinner size="small" color="#fff" />
            ) : (
              <>
                <Ionicons name="checkmark" size={18} color="#fff" />
                <Text style={[styles.actionButtonText, { color: '#fff' }]}>
                  {selectedMonth ? 'Approve' : 'Select month first'}
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      )}

      {item.review_notes && status !== 'pending' && (
        <View style={[styles.reviewNotes, { backgroundColor: theme.surface }]}>
          <Text style={[styles.reviewNotesLabel, { color: theme.textSecondary }]}>Review Notes:</Text>
          <Text style={[styles.reviewNotesText, { color: theme.text }]}>{item.review_notes}</Text>
        </View>
      )}
    </View>
  );
};

interface PettyCashCardProps {
  item: PettyCashRequest;
  processing: string | null;
  theme: ThemeLike;
  styles: StyleLike;
  toFilterStatus: (status?: string) => StatusFilter;
  onOpenPettyCashModal: (request: PettyCashRequest) => void;
}

export const PettyCashCard: React.FC<PettyCashCardProps> = ({
  item,
  processing,
  theme,
  styles,
  toFilterStatus,
  onOpenPettyCashModal,
}) => {
  const normalizedStatus = toFilterStatus(item.status);
  const isPending = normalizedStatus === 'pending';
  const isProcessing = processing === item.id;
  const urgencyColor = item.urgency === 'urgent'
    ? theme.error
    : item.urgency === 'high'
      ? (theme.warning || '#F59E0B')
      : item.urgency === 'low'
        ? theme.textSecondary
        : theme.primary;
  const statusLabel = String(item.status || 'pending')
    .replace('_', ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());

  return (
    <View style={[styles.card, { backgroundColor: theme.cardBackground, borderColor: theme.border }]}>
      <View style={styles.cardHeader}>
        <View style={styles.cardHeaderLeft}>
          <View style={[styles.statusBadge, { backgroundColor: getStatusColor(normalizedStatus) + '20' }]}>
            <Ionicons name={getStatusIcon(normalizedStatus) as any} size={16} color={getStatusColor(normalizedStatus)} />
            <Text style={[styles.statusText, { color: getStatusColor(normalizedStatus) }]}>
              {statusLabel}
            </Text>
          </View>
          <Text style={[styles.dateText, { color: theme.textSecondary }]}>
            {formatDate(item.requested_at || item.created_at)}
          </Text>
        </View>
        <View style={[styles.categoryBadge, { backgroundColor: urgencyColor + '20', borderColor: urgencyColor + '55' }]}>
          <Ionicons name="flash-outline" size={12} color={urgencyColor} />
          <Text style={[styles.categoryBadgeText, { color: urgencyColor }]}>
            {item.urgency || 'normal'}
          </Text>
        </View>
      </View>

      <View style={styles.cardContent}>
        <View style={styles.infoRow}>
          <Ionicons name="person-circle" size={16} color={theme.textSecondary} />
          <Text style={[styles.infoLabel, { color: theme.textSecondary }]}>Requested by:</Text>
          <Text style={[styles.infoValue, { color: theme.text }]}>{item.requestor_name || 'Staff member'}</Text>
        </View>

        <View style={styles.infoRow}>
          <Ionicons name="cash" size={16} color={theme.textSecondary} />
          <Text style={[styles.infoLabel, { color: theme.textSecondary }]}>Amount:</Text>
          <Text style={[styles.infoValue, { color: theme.success, fontWeight: '600' }]}>
            {formatAmount(item.amount)}
          </Text>
        </View>

        <View style={styles.infoRow}>
          <Ionicons name="pricetag" size={16} color={theme.textSecondary} />
          <Text style={[styles.infoLabel, { color: theme.textSecondary }]}>Category:</Text>
          <Text style={[styles.infoValue, { color: theme.text }]}>{item.category || 'General'}</Text>
        </View>

        <View style={styles.infoRow}>
          <Ionicons name="calendar-outline" size={16} color={theme.textSecondary} />
          <Text style={[styles.infoLabel, { color: theme.textSecondary }]}>Needed by:</Text>
          <Text style={[styles.infoValue, { color: theme.text }]}>
            {item.needed_by ? formatDate(item.needed_by) : 'Not specified'}
          </Text>
        </View>

        {(item.description || item.justification) && (
          <View style={styles.infoRow}>
            <Ionicons name="document-text-outline" size={16} color={theme.textSecondary} />
            <Text style={[styles.infoLabel, { color: theme.textSecondary }]}>Reason:</Text>
            <Text style={[styles.infoValue, { color: theme.text }]}>
              {item.description || item.justification}
            </Text>
          </View>
        )}
      </View>

      {isPending && (
        <View style={styles.cardActions}>
          <TouchableOpacity
            style={[styles.actionButton, styles.approveButton, { backgroundColor: theme.primary }]}
            onPress={() => onOpenPettyCashModal(item)}
            disabled={isProcessing}
          >
            {isProcessing ? (
              <EduDashSpinner size="small" color="#fff" />
            ) : (
              <>
                <Ionicons name="checkmark-circle-outline" size={18} color="#fff" />
                <Text style={[styles.actionButtonText, { color: '#fff' }]}>Review Request</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
};
