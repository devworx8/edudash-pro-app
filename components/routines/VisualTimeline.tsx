import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  GestureResponderEvent,
  PanResponder,
  Animated,
} from 'react-native';
import { RoutineBlock, TimeSlot } from '../../lib/types/routine';

interface VisualTimelineProps {
  blocks: RoutineBlock[];
  startTime: number; // Hour (0-23)
  endTime: number; // Hour (0-23)
  onBlockMove: (blockId: string, newStartTime: string, newEndTime: string) => void;
  onBlockResize: (blockId: string, newEndTime: string) => void;
  onBlockSelect: (block: RoutineBlock) => void;
  conflicts: ScheduleConflict[];
  capAlignment: CAPSCoverage[];
}

interface ScheduleConflict {
  blockId1: string;
  blockId2: string;
  type: 'overlap' | 'adjacent' | 'gap';
  severity: 'warning' | 'error';
}

interface CAPSCoverage {
  subject: string;
  target: number;
  achieved: number;
}

const HOUR_HEIGHT = 60; // pixels per hour
const BLOCK_COLORS: Record<string, string> = {
  'Literacy': '#4CAF50',
  'Mathematics': '#2196F3',
  'Life Skills': '#FF9800',
  'Creative Arts': '#9C27B0',
  'Physical Education': '#F44336',
  'Music': '#00BCD4',
  'Break': '#9E9E9E',
  'default': '#607D8B',
};

export const VisualTimeline: React.FC<VisualTimelineProps> = ({
  blocks,
  startTime,
  endTime,
  onBlockMove,
  onBlockResize,
  onBlockSelect,
  conflicts,
  capAlignment,
}) => {
  const [selectedBlock, setSelectedBlock] = useState<string | null>(null);
  const [draggingBlock, setDraggingBlock] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState(0);

  const hours = useMemo(() => {
    const result = [];
    for (let h = startTime; h <= endTime; h++) {
      result.push(h);
    }
    return result;
  }, [startTime, endTime]);

  const getBlockColor = (subject: string): string => {
    return BLOCK_COLORS[subject] || BLOCK_COLORS['default'];
  };

  const timeToPosition = (time: string): number => {
    const [hours, minutes] = time.split(':').map(Number);
    return ((hours - startTime) * 60 + minutes) * (HOUR_HEIGHT / 60);
  };

  const positionToTime = (position: number): string => {
    const totalMinutes = Math.round(position / (HOUR_HEIGHT / 60));
    const hours = startTime + Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
  };

  const getBlockStyle = (block: RoutineBlock): any => {
    const top = timeToPosition(block.startTime);
    const bottom = timeToPosition(block.endTime);
    const height = bottom - top;
    
    return {
      position: 'absolute' as const,
      top: top,
      height: Math.max(height, 30),
      left: 80,
      right: 16,
      backgroundColor: getBlockColor(block.subject || 'default'),
      borderRadius: 8,
      padding: 8,
      opacity: draggingBlock === block.id ? 0.7 : 1,
    };
  };

  const hasConflict = (blockId: string): boolean => {
    return conflicts.some(c => c.blockId1 === blockId || c.blockId2 === blockId);
  };

  const handleBlockPress = (block: RoutineBlock) => {
    setSelectedBlock(block.id);
    onBlockSelect(block);
  };

  const handleDragStart = (blockId: string, y: number) => {
    setDraggingBlock(blockId);
    setDragOffset(y);
  };

  const handleDragEnd = (block: RoutineBlock, newY: number) => {
    const duration = getBlockDuration(block);
    const newStartTime = positionToTime(newY);
    const newEndTime = addDuration(newStartTime, duration);
    onBlockMove(block.id, newStartTime, newEndTime);
    setDraggingBlock(null);
    setDragOffset(0);
  };

  const getBlockDuration = (block: RoutineBlock): number => {
    const start = timeToMinutes(block.startTime);
    const end = timeToMinutes(block.endTime);
    return end - start;
  };

  const timeToMinutes = (time: string): number => {
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
  };

  const addDuration = (startTime: string, durationMinutes: number): string => {
    const startMinutes = timeToMinutes(startTime);
    const endMinutes = startMinutes + durationMinutes;
    const hours = Math.floor(endMinutes / 60);
    const minutes = endMinutes % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
  };

  const renderHourMarkers = () => (
    <View style={styles.hourMarkersContainer}>
      {hours.map(hour => (
        <View key={hour} style={styles.hourMarker}>
          <Text style={styles.hourLabel}>
            {`${hour.toString().padStart(2, '0')}:00`}
          </Text>
          <View style={styles.hourLine} />
        </View>
      ))}
    </View>
  );

  const renderBlocks = () => (
    <View style={styles.blocksContainer}>
      {blocks.map(block => (
        <TouchableOpacity
          key={block.id}
          style={[
            getBlockStyle(block),
            selectedBlock === block.id && styles.selectedBlock,
            hasConflict(block.id) && styles.conflictBlock,
          ]}
          onPress={() => handleBlockPress(block)}
          activeOpacity={0.8}
        >
          <Text style={styles.blockTitle} numberOfLines={1}>
            {block.name || block.subject}
          </Text>
          <Text style={styles.blockTime}>
            {block.startTime} - {block.endTime}
          </Text>
          {hasConflict(block.id) && (
            <View style={styles.conflictIndicator}>
              <Text style={styles.conflictIcon}>⚠️</Text>
            </View>
          )}
        </TouchableOpacity>
      ))}
    </View>
  );

  const renderCAPSCoverage = () => (
    <View style={styles.capsContainer}>
      <Text style={styles.capsTitle}>CAPS Coverage</Text>
      {capAlignment.map((caps, index) => (
        <View key={index} style={styles.capsItem}>
          <Text style={styles.capsSubject}>{caps.subject}</Text>
          <View style={styles.capsProgressBar}>
            <View 
              style={[
                styles.capsProgressFill,
                { width: `${(caps.achieved / caps.target) * 100}%` }
              ]} 
            />
          </View>
          <Text style={styles.capsPercentage}>
            {Math.round((caps.achieved / caps.target) * 100)}%
          </Text>
        </View>
      ))}
    </View>
  );

  const totalHeight = (endTime - startTime + 1) * HOUR_HEIGHT;

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scrollView}>
        <View style={[styles.timelineContainer, { height: totalHeight }]}>
          {renderHourMarkers()}
          {renderBlocks()}
        </View>
      </ScrollView>
      {renderCAPSCoverage()}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  scrollView: {
    flex: 1,
  },
  timelineContainer: {
    position: 'relative',
  },
  hourMarkersContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
  },
  hourMarker: {
    height: HOUR_HEIGHT,
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  hourLabel: {
    width: 60,
    fontSize: 12,
    color: '#666',
    textAlign: 'right',
    paddingRight: 8,
    paddingTop: 4,
  },
  hourLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#E0E0E0',
    marginTop: 8,
  },
  blocksContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
  },
  selectedBlock: {
    borderWidth: 2,
    borderColor: '#1976D2',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  conflictBlock: {
    borderWidth: 2,
    borderColor: '#F44336',
  },
  blockTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFF',
  },
  blockTime: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.8)',
    marginTop: 2,
  },
  conflictIndicator: {
    position: 'absolute',
    top: 4,
    right: 4,
  },
  conflictIcon: {
    fontSize: 14,
  },
  capsContainer: {
    backgroundColor: '#FFF',
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
  },
  capsTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  capsItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  capsSubject: {
    width: 100,
    fontSize: 12,
    color: '#666',
  },
  capsProgressBar: {
    flex: 1,
    height: 8,
    backgroundColor: '#E0E0E0',
    borderRadius: 4,
    marginHorizontal: 8,
    overflow: 'hidden',
  },
  capsProgressFill: {
    height: '100%',
    backgroundColor: '#4CAF50',
    borderRadius: 4,
  },
  capsPercentage: {
    width: 40,
    fontSize: 12,
    textAlign: 'right',
    color: '#666',
  },
});

export default VisualTimeline;