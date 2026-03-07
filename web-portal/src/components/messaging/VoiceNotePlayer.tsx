'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Play, Pause, Mic } from 'lucide-react';

interface VoiceNotePlayerProps {
  url: string;
  duration?: number; // in ms
  isOwn: boolean;
}

const formatDuration = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

// Generate fake waveform bars for visual effect
const generateWaveformBars = (count: number): number[] => {
  const bars: number[] = [];
  for (let i = 0; i < count; i++) {
    // Create a smooth wave pattern
    const base = Math.sin((i / count) * Math.PI) * 0.5 + 0.5;
    const randomness = Math.random() * 0.3;
    bars.push(Math.max(0.2, Math.min(1, base + randomness)));
  }
  return bars;
};

export const VoiceNotePlayer = ({ url, duration, isOwn }: VoiceNotePlayerProps) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [totalDuration, setTotalDuration] = useState(duration ? duration / 1000 : 0);
  const [waveformBars] = useState(() => generateWaveformBars(32));
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const audio = new Audio(url);
    audioRef.current = audio;

    audio.addEventListener('loadedmetadata', () => {
      if (!duration) {
        setTotalDuration(audio.duration);
      }
    });

    audio.addEventListener('timeupdate', () => {
      setCurrentTime(audio.currentTime);
      setProgress(audio.duration > 0 ? (audio.currentTime / audio.duration) * 100 : 0);
    });

    audio.addEventListener('ended', () => {
      setIsPlaying(false);
      setCurrentTime(0);
      setProgress(0);
    });

    audio.addEventListener('play', () => setIsPlaying(true));
    audio.addEventListener('pause', () => setIsPlaying(false));

    return () => {
      audio.pause();
      audio.src = '';
    };
  }, [url, duration]);

  const togglePlayback = useCallback(() => {
    if (!audioRef.current) return;

    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play().catch(console.error);
    }
  }, [isPlaying]);

  const handleWaveformClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!audioRef.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const percentage = clickX / rect.width;
    audioRef.current.currentTime = percentage * audioRef.current.duration;
  };

  const displayTime = isPlaying || currentTime > 0 
    ? formatDuration(currentTime) 
    : formatDuration(totalDuration);

  // Colors based on ownership
  const primaryColor = isOwn ? '#ffffff' : '#8b5cf6';
  const secondaryColor = isOwn ? 'rgba(255, 255, 255, 0.4)' : 'rgba(139, 92, 246, 0.4)';
  const buttonBg = isOwn 
    ? 'rgba(255, 255, 255, 0.2)' 
    : 'linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%)';
  const buttonColor = isOwn ? '#ffffff' : '#ffffff';

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
      minWidth: '200px',
      maxWidth: '280px',
      padding: '8px 4px',
    }}>
      {/* Play/Pause Button */}
      <button
        onClick={togglePlayback}
        style={{
          width: '42px',
          height: '42px',
          borderRadius: '50%',
          background: buttonBg,
          border: 'none',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          flexShrink: 0,
          transition: 'transform 0.15s ease, opacity 0.15s ease',
          boxShadow: isOwn ? 'none' : '0 2px 8px rgba(139, 92, 246, 0.3)',
        }}
        onMouseDown={(e) => (e.currentTarget.style.transform = 'scale(0.95)')}
        onMouseUp={(e) => (e.currentTarget.style.transform = 'scale(1)')}
        onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
      >
        {isPlaying ? (
          <Pause size={20} color={buttonColor} fill={buttonColor} />
        ) : (
          <Play size={20} color={buttonColor} fill={buttonColor} style={{ marginLeft: '2px' }} />
        )}
      </button>

      {/* Waveform and Time */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {/* Waveform Visualization */}
        <div
          onClick={handleWaveformClick}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '2px',
            height: '28px',
            cursor: 'pointer',
            position: 'relative',
          }}
        >
          {waveformBars.map((height, index) => {
            const barProgress = (index / waveformBars.length) * 100;
            const isActive = barProgress <= progress;
            return (
              <div
                key={index}
                style={{
                  width: '3px',
                  height: `${height * 100}%`,
                  minHeight: '4px',
                  maxHeight: '28px',
                  borderRadius: '2px',
                  background: isActive ? primaryColor : secondaryColor,
                  transition: 'background 0.1s ease',
                }}
              />
            );
          })}
        </div>

        {/* Time Display */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <span style={{
            fontSize: '11px',
            color: isOwn ? 'rgba(255, 255, 255, 0.8)' : 'rgba(148, 163, 184, 0.9)',
            fontWeight: 500,
            fontVariantNumeric: 'tabular-nums',
          }}>
            {displayTime}
          </span>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
          }}>
            <Mic size={12} color={isOwn ? 'rgba(255, 255, 255, 0.6)' : 'rgba(148, 163, 184, 0.7)'} />
          </div>
        </div>
      </div>
    </div>
  );
};
