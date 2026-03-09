import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  PanResponder,
  type GestureResponderEvent,
  type PanResponderGestureState,
} from 'react-native';
import Svg, { Path, Line, Text as SvgText } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { captureRef } from 'react-native-view-shot';
import { assertSupabase } from '@/lib/supabase';
import { useTheme } from '@/contexts/ThemeContext';
import { usePhonicsClips } from '@/hooks/usePhonicsClips';

interface NamePracticeProgress {
  attempt_count: number;
  last_score: number | null;
  best_score: number | null;
  last_attempt_at: string | null;
}

interface Stroke {
  id: string;
  path: string;
}

interface NamePracticePadProps {
  studentId: string;
  preschoolId?: string | null;
  assignmentId?: string | null;
  childName: string;
  targetName?: string;
  compact?: boolean;
  onSaved?: (score: number, snapshotUrl: string | null) => void;
}

const CANVAS_HEIGHT = 240;

function clampScore(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function NamePracticePad({
  studentId,
  preschoolId,
  assignmentId,
  childName,
  targetName,
  compact = false,
  onSaved,
}: NamePracticePadProps) {
  const { theme } = useTheme();
  const supabase = assertSupabase();
  const canvasRef = useRef<View | null>(null);
  const [canvasWidth, setCanvasWidth] = useState(320);
  const [paths, setPaths] = useState<Stroke[]>([]);
  const [currentPath, setCurrentPath] = useState<string | null>(null);
  const pathIdRef = useRef(1);
  const [strokeCount, setStrokeCount] = useState(0);
  const [drawLength, setDrawLength] = useState(0);
  const [statusMessage, setStatusMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState<NamePracticeProgress | null>(null);

  const practiceName = useMemo(
    () => (targetName?.trim() || childName?.trim() || 'My Name').replace(/\s+/g, ' ').trim(),
    [childName, targetName],
  );

  const { clips, activeClipId, playClip } = usePhonicsClips();
  const starterClips = useMemo(() => clips.slice(0, 6), [clips]);

  useEffect(() => {
    let active = true;

    const loadProgress = async () => {
      const { data } = await supabase
        .from('name_practice_progress')
        .select('attempt_count, last_score, best_score, last_attempt_at')
        .eq('student_id', studentId)
        .maybeSingle();

      if (active && data) {
        setProgress(data as NamePracticeProgress);
      }
    };

    void loadProgress();

    return () => {
      active = false;
    };
  }, [studentId, supabase]);

  const startStroke = useCallback((x: number, y: number) => {
    setCurrentPath(`M${x},${y}`);
    setStrokeCount((prev) => prev + 1);
  }, []);

  const moveStroke = useCallback((x: number, y: number, prevX: number, prevY: number) => {
    setCurrentPath((prev) => (prev ? `${prev} L${x},${y}` : `M${x},${y}`));
    setDrawLength((prev) => prev + Math.hypot(x - prevX, y - prevY));
  }, []);

  const endStroke = useCallback(() => {
    setCurrentPath((prev) => {
      if (!prev) return null;
      const newStroke: Stroke = {
        id: `stroke-${pathIdRef.current++}`,
        path: prev,
      };
      setPaths((existing) => [...existing, newStroke]);
      return null;
    });
  }, []);

  const currentPointRef = useRef<{ x: number; y: number } | null>(null);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (event: GestureResponderEvent) => {
          const { locationX, locationY } = event.nativeEvent;
          currentPointRef.current = { x: locationX, y: locationY };
          startStroke(locationX, locationY);
        },
        onPanResponderMove: (event: GestureResponderEvent, _gesture: PanResponderGestureState) => {
          const { locationX, locationY } = event.nativeEvent;
          const previous = currentPointRef.current;
          if (!previous) {
            currentPointRef.current = { x: locationX, y: locationY };
            startStroke(locationX, locationY);
            return;
          }

          moveStroke(locationX, locationY, previous.x, previous.y);
          currentPointRef.current = { x: locationX, y: locationY };
        },
        onPanResponderRelease: () => {
          currentPointRef.current = null;
          endStroke();
        },
        onPanResponderTerminate: () => {
          currentPointRef.current = null;
          endStroke();
        },
      }),
    [endStroke, moveStroke, startStroke],
  );

  const clearCanvas = useCallback(() => {
    setPaths([]);
    setCurrentPath(null);
    setDrawLength(0);
    setStrokeCount(0);
    setStatusMessage('');
  }, []);

  const calculateScore = useCallback(() => {
    const letters = Math.max(4, practiceName.replace(/\s/g, '').length);
    const strokeScore = Math.min(60, strokeCount * 8);
    const motionTarget = letters * 120;
    const motionScore = Math.min(40, (drawLength / motionTarget) * 40);
    return clampScore(strokeScore + motionScore);
  }, [drawLength, practiceName, strokeCount]);

  const savePractice = useCallback(async () => {
    if (saving || paths.length === 0) return;

    setSaving(true);
    setStatusMessage('Saving practice...');

    try {
      const score = calculateScore();
      let snapshotUrl: string | null = null;

      if (preschoolId && canvasRef.current) {
        const imageUri = await captureRef(canvasRef, {
          format: 'png',
          quality: 0.92,
          result: 'tmpfile',
        });

        const path = `${preschoolId}/${studentId}/${Date.now()}.png`;
        const blob = await fetch(imageUri).then((res) => res.blob());

        const { error: uploadError } = await supabase.storage
          .from('name-practice-snapshots')
          .upload(path, blob, {
            contentType: 'image/png',
            upsert: false,
          });

        if (!uploadError) {
          snapshotUrl = path;
        }
      }

      const { error: rpcError, data: rpcData } = await supabase.rpc('record_name_practice_attempt', {
        p_student_id: studentId,
        p_preschool_id: preschoolId || null,
        p_score: score,
        p_snapshot_url: snapshotUrl,
        p_assignment_id: assignmentId || null,
      });

      if (rpcError) {
        throw rpcError;
      }

      if (rpcData) {
        setProgress({
          attempt_count: rpcData.attempt_count,
          best_score: rpcData.best_score,
          last_score: rpcData.last_score,
          last_attempt_at: rpcData.last_attempt_at,
        });
      }

      onSaved?.(score, snapshotUrl);
      setStatusMessage('Practice saved. Nice effort.');
    } catch (error) {
      console.error('[NamePracticePad.native] save failed', error);
      setStatusMessage('Could not save this attempt. Please try again.');
    } finally {
      setSaving(false);
    }
  }, [assignmentId, calculateScore, onSaved, paths.length, preschoolId, saving, studentId, supabase]);

  const guidelineColor = `${theme.primary}55`;

  return (
    <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border, padding: compact ? 14 : 18 }]}> 
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: theme.text }]}>Name Writing Practice</Text>
          <Text style={[styles.subtitle, { color: theme.textSecondary }]}>Trace and write: {practiceName}</Text>
        </View>
        <View style={[styles.progressChip, { backgroundColor: `${theme.primary}22` }]}> 
          <Text style={[styles.progressChipText, { color: theme.primary }]}>
            {progress?.attempt_count || 0} attempts
          </Text>
        </View>
      </View>

      <View
        ref={canvasRef}
        style={[styles.canvasContainer, { backgroundColor: '#07142f', borderColor: theme.border }]}
        onLayout={(event) => setCanvasWidth(event.nativeEvent.layout.width)}
        {...panResponder.panHandlers}
      >
        <Svg width="100%" height={CANVAS_HEIGHT}>
          {[1, 2, 3].map((lineIndex) => {
            const y = (CANVAS_HEIGHT / 4) * lineIndex;
            return (
              <Line
                key={`guide-${lineIndex}`}
                x1="14"
                x2={String(Math.max(14, canvasWidth - 14))}
                y1={String(y)}
                y2={String(y)}
                stroke={guidelineColor}
                strokeWidth="1"
              />
            );
          })}

          <SvgText x="16" y="44" fill="rgba(255,255,255,0.25)" fontSize="30" fontWeight="700">
            {practiceName}
          </SvgText>

          {paths.map((stroke) => (
            <Path
              key={stroke.id}
              d={stroke.path}
              stroke="#f8fafc"
              strokeWidth="8"
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          ))}

          {currentPath && (
            <Path
              d={currentPath}
              stroke="#f8fafc"
              strokeWidth="8"
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          )}
        </Svg>
      </View>

      <View style={styles.metricRow}>
        <Text style={[styles.metricText, { color: theme.textSecondary }]}>Strokes: {strokeCount}</Text>
        <Text style={[styles.metricText, { color: theme.textSecondary }]}>Best: {Math.round(progress?.best_score || 0)}%</Text>
        <Text style={[styles.metricText, { color: theme.textSecondary }]}>Last: {Math.round(progress?.last_score || 0)}%</Text>
      </View>

      {starterClips.length > 0 && (
        <View style={{ gap: 8 }}>
          <Text style={[styles.clipTitle, { color: theme.textSecondary }]}>Phonics clips</Text>
          <View style={styles.clipWrap}>
            {starterClips.map((clip) => (
              <TouchableOpacity
                key={clip.id}
                style={[
                  styles.clipButton,
                  {
                    borderColor: `${theme.primary}66`,
                    backgroundColor: activeClipId === clip.id ? `${theme.primary}33` : theme.background,
                  },
                ]}
                onPress={() => playClip(clip.id)}
              >
                <Ionicons name="volume-medium" size={14} color={theme.primary} />
                <Text style={[styles.clipLabel, { color: theme.text }]}>{clip.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      {statusMessage ? (
        <Text style={[styles.statusText, { color: theme.textSecondary }]}>{statusMessage}</Text>
      ) : null}

      <View style={styles.actionsRow}>
        <TouchableOpacity
          style={[styles.actionButton, { borderColor: theme.border, backgroundColor: theme.background }]}
          onPress={clearCanvas}
        >
          <Ionicons name="refresh" size={16} color={theme.textSecondary} />
          <Text style={[styles.actionText, { color: theme.textSecondary }]}>Reset</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionButton, styles.primaryAction, { backgroundColor: theme.primary }]}
          onPress={savePractice}
          disabled={saving || paths.length === 0}
        >
          <Ionicons name="save-outline" size={16} color={theme.onPrimary || '#fff'} />
          <Text style={[styles.actionText, { color: theme.onPrimary || '#fff' }]}>
            {saving ? 'Saving...' : 'Save attempt'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: 16,
    gap: 12,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  title: {
    fontSize: 19,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 13,
    marginTop: 2,
  },
  progressChip: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  progressChipText: {
    fontSize: 12,
    fontWeight: '700',
  },
  canvasContainer: {
    borderWidth: 1,
    borderRadius: 14,
    overflow: 'hidden',
    height: CANVAS_HEIGHT,
  },
  metricRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  metricText: {
    fontSize: 12,
    fontWeight: '500',
  },
  clipTitle: {
    fontSize: 13,
    fontWeight: '600',
  },
  clipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  clipButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  clipLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  statusText: {
    fontSize: 12,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    paddingVertical: 11,
    paddingHorizontal: 12,
    borderWidth: 1,
    gap: 6,
    flex: 1,
  },
  primaryAction: {
    borderWidth: 0,
  },
  actionText: {
    fontSize: 13,
    fontWeight: '700',
  },
});
