import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';

interface ScheduleConflict {
  id: string;
  blockId1: string;
  blockId2: string;
  type: 'overlap' | 'gap' | 'teacher_clash' | 'room_clash';
  severity: 'warning' | 'error';
  startTime1: string;
  endTime1: string;
  startTime2: string;
  endTime2: string;
  blockName1: string;
  blockName2: string;
  suggestedSolutions?: ConflictSolution[];
}

interface ConflictSolution {
  id: string;
  description: string;
  action: 'move' | 'resize' | 'delete' | 'swap';
  newStartTime1?: string;
  newEndTime1?: string;
  newStartTime2?: string;
  newEndTime2?: string;
  impact: 'low' | 'medium' | 'high';
}

interface ConflictResolverProps {
  conflicts: ScheduleConflict[];
  visible: boolean;
  onClose: () => void;
  onResolve: (conflictId: string, solution: ConflictSolution) => void;
  onIgnore: (conflictId: string) => void;
}

export const ConflictResolver: React.FC<ConflictResolverProps> = ({
  conflicts,
  visible,
  onClose,
  onResolve,
  onIgnore,
}) => {
  const [selectedConflict, setSelectedConflict] = useState<string | null>(null);
  const [selectedSolution, setSelectedSolution] = useState<string | null>(null);

  const errorConflicts = useMemo(
    () => conflicts.filter(c => c.severity === 'error'),
    [conflicts]
  );

  const warningConflicts = useMemo(
    () => conflicts.filter(c => c.severity === 'warning'),
    [conflicts]
  );

  const getConflictIcon = (
    type: ScheduleConflict['type']
  ): ComponentProps<typeof Ionicons>['name'] => {
    switch (type) {
      case 'overlap':
        return 'time-outline';
      case 'gap':
        return 'ellipsis-horizontal-outline';
      case 'teacher_clash':
        return 'person-outline';
      case 'room_clash':
        return 'location-outline';
      default:
        return 'alert-circle-outline';
    }
  };

  const getConflictTitle = (type: ScheduleConflict['type']): string => {
    switch (type) {
      case 'overlap':
        return 'Schedule Overlap';
      case 'gap':
        return 'Unscheduled Gap';
      case 'teacher_clash':
        return 'Teacher Double-booked';
      case 'room_clash':
        return 'Room Double-booked';
      default:
        return 'Schedule Conflict';
    }
  };

  const getImpactColor = (impact: ConflictSolution['impact']): string => {
    switch (impact) {
      case 'low':
        return '#4CAF50';
      case 'medium':
        return '#FF9800';
      case 'high':
        return '#F44336';
      default:
        return '#666';
    }
  };

  const handleResolve = () => {
    if (!selectedConflict || !selectedSolution) {
      Alert.alert('Selection Required', 'Please select a conflict and a solution');
      return;
    }

    const conflict = conflicts.find(c => c.id === selectedConflict);
    const solution = conflict?.suggestedSolutions?.find(s => s.id === selectedSolution);

    if (conflict && solution) {
      onResolve(selectedConflict, solution);
      setSelectedConflict(null);
      setSelectedSolution(null);
    }
  };

  const renderConflictItem = (conflict: ScheduleConflict) => (
    <TouchableOpacity
      key={conflict.id}
      style={[
        styles.conflictItem,
        selectedConflict === conflict.id && styles.conflictItemSelected,
      ]}
      onPress={() => {
        setSelectedConflict(conflict.id);
        setSelectedSolution(null);
      }}
    >
      <View style={styles.conflictHeader}>
        <View style={[
          styles.severityBadge,
          conflict.severity === 'error' ? styles.severityError : styles.severityWarning,
        ]}>
          <Ionicons
            name={conflict.severity === 'error' ? 'alert-circle' : 'warning'}
            size={16}
            color="#FFF"
          />
        </View>
        <View style={styles.conflictInfo}>
          <Text style={styles.conflictType}>{getConflictTitle(conflict.type)}</Text>
          <Text style={styles.conflictBlocks}>
            {conflict.blockName1} vs {conflict.blockName2}
          </Text>
        </View>
        <Ionicons
          name={getConflictIcon(conflict.type)}
          size={24}
          color="#666"
        />
      </View>
      <View style={styles.conflictTimes}>
        <View style={styles.timeBlock}>
          <Text style={styles.timeLabel}>Block 1</Text>
          <Text style={styles.timeValue}>{conflict.startTime1} - {conflict.endTime1}</Text>
        </View>
        <View style={styles.timeBlock}>
          <Text style={styles.timeLabel}>Block 2</Text>
          <Text style={styles.timeValue}>{conflict.startTime2} - {conflict.endTime2}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );

  const renderSolutions = () => {
    const conflict = conflicts.find(c => c.id === selectedConflict);
    if (!conflict || !conflict.suggestedSolutions) return null;

    return (
      <View style={styles.solutionsContainer}>
        <Text style={styles.solutionsTitle}>Suggested Solutions</Text>
        {conflict.suggestedSolutions.map(solution => (
          <TouchableOpacity
            key={solution.id}
            style={[
              styles.solutionItem,
              selectedSolution === solution.id && styles.solutionItemSelected,
            ]}
            onPress={() => setSelectedSolution(solution.id)}
          >
            <View style={styles.solutionHeader}>
              <Ionicons
                name="checkmark-circle-outline"
                size={20}
                color={selectedSolution === solution.id ? '#1976D2' : '#CCC'}
              />
              <Text style={styles.solutionDescription}>{solution.description}</Text>
            </View>
            <View style={styles.solutionMeta}>
              <View style={[styles.impactBadge, { backgroundColor: getImpactColor(solution.impact) }]}>
                <Text style={styles.impactText}>{solution.impact} impact</Text>
              </View>
              <Text style={styles.actionType}>{solution.action}</Text>
            </View>
          </TouchableOpacity>
        ))}
      </View>
    );
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Resolve Conflicts</Text>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <Ionicons name="close" size={24} color="#666" />
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.content}>
          {errorConflicts.length > 0 && (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Ionicons name="alert-circle" size={20} color="#F44336" />
                <Text style={styles.sectionTitle}>Errors ({errorConflicts.length})</Text>
              </View>
              <Text style={styles.sectionDescription}>
                These conflicts must be resolved before saving
              </Text>
              {errorConflicts.map(renderConflictItem)}
            </View>
          )}

          {warningConflicts.length > 0 && (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Ionicons name="warning" size={20} color="#FF9800" />
                <Text style={styles.sectionTitle}>Warnings ({warningConflicts.length})</Text>
              </View>
              <Text style={styles.sectionDescription}>
                These are potential issues you may want to address
              </Text>
              {warningConflicts.map(renderConflictItem)}
            </View>
          )}

          {selectedConflict && renderSolutions()}

          {conflicts.length === 0 && (
            <View style={styles.emptyState}>
              <Ionicons name="checkmark-circle" size={64} color="#4CAF50" />
              <Text style={styles.emptyTitle}>No Conflicts</Text>
              <Text style={styles.emptyDescription}>
                Your schedule is conflict-free and ready to publish
              </Text>
            </View>
          )}
        </ScrollView>

        <View style={styles.footer}>
          {selectedConflict && (
            <TouchableOpacity
              style={styles.ignoreButton}
              onPress={() => {
                onIgnore(selectedConflict);
                setSelectedConflict(null);
              }}
            >
              <Text style={styles.ignoreButtonText}>Ignore</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[
              styles.resolveButton,
              !selectedSolution && styles.resolveButtonDisabled,
            ]}
            onPress={handleResolve}
            disabled={!selectedSolution}
          >
            <Text style={styles.resolveButtonText}>Apply Solution</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
  },
  closeButton: {
    padding: 8,
  },
  content: {
    flex: 1,
  },
  section: {
    padding: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  sectionDescription: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
    marginBottom: 12,
  },
  conflictItem: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  conflictItemSelected: {
    borderColor: '#1976D2',
    borderWidth: 2,
  },
  conflictHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  severityBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  severityError: {
    backgroundColor: '#F44336',
  },
  severityWarning: {
    backgroundColor: '#FF9800',
  },
  conflictInfo: {
    flex: 1,
    marginLeft: 12,
  },
  conflictType: {
    fontSize: 14,
    fontWeight: '600',
  },
  conflictBlocks: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  conflictTimes: {
    flexDirection: 'row',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
  },
  timeBlock: {
    flex: 1,
  },
  timeLabel: {
    fontSize: 11,
    color: '#999',
  },
  timeValue: {
    fontSize: 13,
    fontWeight: '500',
    marginTop: 2,
  },
  solutionsContainer: {
    padding: 16,
    backgroundColor: '#FFF',
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
  },
  solutionsTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  solutionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 8,
    backgroundColor: '#F5F5F5',
    marginBottom: 8,
  },
  solutionItemSelected: {
    backgroundColor: '#E3F2FD',
  },
  solutionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  solutionDescription: {
    fontSize: 14,
    marginLeft: 8,
    flex: 1,
  },
  solutionMeta: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  impactBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    marginRight: 8,
  },
  impactText: {
    fontSize: 11,
    color: '#FFF',
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  actionType: {
    fontSize: 12,
    color: '#666',
    textTransform: 'capitalize',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 48,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#666',
    marginTop: 16,
  },
  emptyDescription: {
    fontSize: 14,
    color: '#999',
    marginTop: 8,
    textAlign: 'center',
  },
  footer: {
    flexDirection: 'row',
    padding: 16,
    backgroundColor: '#FFF',
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
  },
  ignoreButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    marginRight: 8,
    alignItems: 'center',
  },
  ignoreButtonText: {
    fontSize: 16,
    color: '#666',
  },
  resolveButton: {
    flex: 2,
    paddingVertical: 14,
    borderRadius: 8,
    backgroundColor: '#1976D2',
    alignItems: 'center',
  },
  resolveButtonDisabled: {
    backgroundColor: '#BDBDBD',
  },
  resolveButtonText: {
    fontSize: 16,
    color: '#FFF',
    fontWeight: '600',
  },
});

export default ConflictResolver;
