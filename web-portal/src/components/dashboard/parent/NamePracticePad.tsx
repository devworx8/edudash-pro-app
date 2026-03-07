'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { createClient } from '@/lib/supabase/client';
import { usePhonicsClips } from '@/lib/audio/usePhonicsClips';
import type { PhonicsClipId } from '@/lib/phonics/clipCatalog';
import { Eraser, Save, Volume2, RotateCcw, CheckCircle2 } from 'lucide-react';

interface NamePracticeProgress {
  attempt_count: number;
  last_score: number | null;
  best_score: number | null;
  last_attempt_at: string | null;
  latest_snapshot_url: string | null;
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

const CANVAS_WIDTH = 860;
const CANVAS_HEIGHT = 300;

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
  const supabase = createClient();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawRef = useRef<{ drawing: boolean; x: number; y: number }>({ drawing: false, x: 0, y: 0 });
  const [strokeCount, setStrokeCount] = useState(0);
  const [drawLength, setDrawLength] = useState(0);
  const [saving, setSaving] = useState(false);
  const [savedState, setSavedState] = useState<{ score: number; snapshotUrl: string | null } | null>(null);
  const [progress, setProgress] = useState<NamePracticeProgress | null>(null);
  const [statusMessage, setStatusMessage] = useState<string>('');

  const practiceName = useMemo(
    () => (targetName?.trim() || childName?.trim() || 'My Name').replace(/\s+/g, ' ').trim(),
    [childName, targetName],
  );

  const { clips, activeClipId, playClip } = usePhonicsClips();
  const starterClips = useMemo(() => clips.slice(0, 6), [clips]);

  const baselineRows = compact ? 2 : 3;

  useEffect(() => {
    const loadProgress = async () => {
      const { data } = await supabase
        .from('name_practice_progress')
        .select('attempt_count, last_score, best_score, last_attempt_at, latest_snapshot_url')
        .eq('student_id', studentId)
        .maybeSingle();

      if (data) {
        setProgress(data as NamePracticeProgress);
      }
    };

    void loadProgress();
  }, [studentId, supabase]);

  const initCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#07142f';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    ctx.strokeStyle = 'rgba(129, 140, 248, 0.35)';
    ctx.lineWidth = 1;

    const rowHeight = CANVAS_HEIGHT / (baselineRows + 1);
    for (let row = 1; row <= baselineRows; row += 1) {
      const y = row * rowHeight;
      ctx.beginPath();
      ctx.moveTo(24, y);
      ctx.lineTo(CANVAS_WIDTH - 24, y);
      ctx.stroke();
    }

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }, [baselineRows]);

  useEffect(() => {
    initCanvas();
  }, [initCanvas]);

  const getPoint = useCallback((event: PointerEvent | ReactPointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const scaleX = CANVAS_WIDTH / rect.width;
    const scaleY = CANVAS_HEIGHT / rect.height;

    return {
      x: (event.clientX - rect.left) * scaleX,
      y: (event.clientY - rect.top) * scaleY,
    };
  }, []);

  const onPointerDown = useCallback((event: ReactPointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const point = getPoint(event);
    if (!canvas || !point) return;

    canvas.setPointerCapture(event.pointerId);
    drawRef.current = { drawing: true, x: point.x, y: point.y };
    setStrokeCount((prev) => prev + 1);

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.strokeStyle = '#f8fafc';
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(point.x, point.y);
  }, [getPoint]);

  const onPointerMove = useCallback((event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!drawRef.current.drawing) return;
    const canvas = canvasRef.current;
    const point = getPoint(event);
    if (!canvas || !point) return;

    const prevX = drawRef.current.x;
    const prevY = drawRef.current.y;
    drawRef.current.x = point.x;
    drawRef.current.y = point.y;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.lineTo(point.x, point.y);
    ctx.stroke();

    const delta = Math.hypot(point.x - prevX, point.y - prevY);
    setDrawLength((prev) => prev + delta);
  }, [getPoint]);

  const onPointerUp = useCallback((event: ReactPointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (canvas) {
      try {
        canvas.releasePointerCapture(event.pointerId);
      } catch {
        // no-op
      }
    }
    drawRef.current.drawing = false;
  }, []);

  const clearCanvas = useCallback(() => {
    setStrokeCount(0);
    setDrawLength(0);
    setSavedState(null);
    setStatusMessage('');
    initCanvas();
  }, [initCanvas]);

  const calculateScore = useCallback(() => {
    const nameLengthFactor = Math.max(4, practiceName.replace(/\s/g, '').length);
    const strokeScore = Math.min(60, strokeCount * 8);
    const motionTarget = nameLengthFactor * 120;
    const motionScore = Math.min(40, (drawLength / motionTarget) * 40);
    return clampScore(strokeScore + motionScore);
  }, [drawLength, practiceName, strokeCount]);

  const savePractice = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas || saving) return;

    setSaving(true);
    setStatusMessage('Saving practice...');

    try {
      const score = calculateScore();
      const dataUrl = canvas.toDataURL('image/png');
      let snapshotUrl: string | null = null;

      if (preschoolId) {
        const path = `${preschoolId}/${studentId}/${Date.now()}.png`;
        const blob = await fetch(dataUrl).then((res) => res.blob());

        const { error: uploadError } = await supabase.storage
          .from('name-practice-snapshots')
          .upload(path, blob, {
            contentType: 'image/png',
            upsert: false,
          });

        if (!uploadError) {
          const signed = await supabase.storage
            .from('name-practice-snapshots')
            .createSignedUrl(path, 60 * 60 * 24 * 30);

          snapshotUrl = signed.data?.signedUrl || path;
        }
      }

      const { error: rpcError, data: rpcData } = await supabase.rpc('record_name_practice_attempt', {
        p_student_id: studentId,
        p_preschool_id: preschoolId,
        p_score: score,
        p_snapshot_url: snapshotUrl,
        p_assignment_id: assignmentId || null,
      });

      if (rpcError) {
        throw rpcError;
      }

      setSavedState({ score, snapshotUrl });
      setStatusMessage('Practice saved. Great writing effort.');

      if (rpcData) {
        setProgress({
          attempt_count: rpcData.attempt_count,
          best_score: rpcData.best_score,
          last_score: rpcData.last_score,
          last_attempt_at: rpcData.last_attempt_at,
          latest_snapshot_url: rpcData.latest_snapshot_url,
        });
      }

      onSaved?.(score, snapshotUrl);
    } catch (error) {
      console.error('[NamePracticePad] save failed', error);
      setStatusMessage('Could not save this attempt. Please try again.');
    } finally {
      setSaving(false);
    }
  }, [assignmentId, calculateScore, onSaved, preschoolId, saving, studentId, supabase]);

  return (
    <div className="card" style={{ padding: compact ? 16 : 20, display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: compact ? 18 : 20 }}>Name Writing Practice</h3>
          <p style={{ margin: '4px 0 0', color: 'var(--muted)', fontSize: 13 }}>
            Trace and write: <strong>{practiceName}</strong>
          </p>
        </div>
        {progress && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <span className="badge">Attempts {progress.attempt_count}</span>
            <span className="badge">Best {progress.best_score ? Math.round(progress.best_score) : 0}%</span>
          </div>
        )}
      </div>

      <div
        style={{
          position: 'relative',
          borderRadius: 14,
          border: '1px solid rgba(129, 140, 248, 0.4)',
          overflow: 'hidden',
          background: 'radial-gradient(circle at top, rgba(99, 102, 241, 0.2), rgba(2, 6, 23, 0.9))',
        }}
      >
        <div
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'rgba(226, 232, 240, 0.2)',
            fontSize: compact ? 40 : 56,
            fontWeight: 800,
            letterSpacing: '0.16em',
            pointerEvents: 'none',
            textTransform: 'uppercase',
          }}
        >
          {practiceName}
        </div>

        <canvas
          ref={canvasRef}
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerUp}
          style={{ width: '100%', minHeight: compact ? 220 : 260, touchAction: 'none', cursor: 'crosshair', display: 'block' }}
        />
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button className="btn" onClick={clearCanvas}>
          <Eraser size={16} /> Clear
        </button>
        <button className="btn" onClick={initCanvas}>
          <RotateCcw size={16} /> Reset Guide
        </button>
        <button className="btn btnPrimary" disabled={saving || strokeCount === 0} onClick={savePractice}>
          <Save size={16} /> {saving ? 'Saving...' : 'Save Attempt'}
        </button>
      </div>

      <div style={{ display: 'grid', gap: 8 }}>
        <div style={{ fontSize: 12, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          Phonics and Viseme Clips
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {starterClips.map((clip) => {
            const isActive = activeClipId === clip.id;
            return (
              <button
                key={clip.id}
                className="btn"
                onClick={() => playClip(clip.id as PhonicsClipId)}
                style={{
                  borderColor: isActive ? 'rgba(34, 197, 94, 0.8)' : undefined,
                  boxShadow: isActive ? '0 0 0 1px rgba(34,197,94,0.45)' : undefined,
                }}
                title={clip.cue}
              >
                <Volume2 size={14} /> {clip.label}
              </button>
            );
          })}
        </div>
      </div>

      {savedState && (
        <div className="card" style={{ padding: 12, background: 'rgba(16, 185, 129, 0.14)', border: '1px solid rgba(16, 185, 129, 0.35)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600 }}>
            <CheckCircle2 size={16} /> Saved score: {savedState.score}%
          </div>
        </div>
      )}

      {statusMessage && <p style={{ margin: 0, color: 'var(--muted)', fontSize: 13 }}>{statusMessage}</p>}
    </div>
  );
}
