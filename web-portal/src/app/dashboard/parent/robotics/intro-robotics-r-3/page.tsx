'use client';

import { useState, useEffect } from 'react';
import { ArrowUp, ArrowDown, ArrowLeft, ArrowRight, RotateCw, Play, RotateCcw, Home, Sparkles } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';

interface Position {
  x: number;
  y: number;
}

type Direction = 'up' | 'down' | 'left' | 'right';

interface Command {
  type: 'forward' | 'backward' | 'turn-left' | 'turn-right';
  icon: any;
  label: string;
}

const GRID_SIZE = 5;
const COMMANDS: Command[] = [
  { type: 'forward', icon: ArrowUp, label: 'Forward' },
  { type: 'backward', icon: ArrowDown, label: 'Backward' },
  { type: 'turn-left', icon: ArrowLeft, label: 'Turn Left' },
  { type: 'turn-right', icon: ArrowRight, label: 'Turn Right' },
];

const CHALLENGES = [
  {
    id: 1,
    title: 'First Steps',
    description: 'Move the robot forward 2 steps',
    start: { x: 0, y: 2 },
    goal: { x: 2, y: 2 },
    stars: 1,
    hint: 'Press the Forward button twice!',
  },
  {
    id: 2,
    title: 'Turn Around',
    description: 'Turn right and move forward',
    start: { x: 2, y: 0 },
    goal: { x: 2, y: 2 },
    stars: 2,
    hint: 'First turn right, then move forward',
  },
  {
    id: 3,
    title: 'L-Shape Path',
    description: 'Make an L-shape movement',
    start: { x: 0, y: 0 },
    goal: { x: 2, y: 2 },
    stars: 3,
    hint: 'Move forward, turn right, move forward again',
  },
];

export default function MyFirstRobotPage() {
  const router = useRouter();
  const supabase = createClient();
  const [userId, setUserId] = useState<string | null>(null);
  
  const [currentChallenge, setCurrentChallenge] = useState(0);
  const [position, setPosition] = useState<Position>({ x: 0, y: 0 });
  const [direction, setDirection] = useState<Direction>('right');
  const [commandQueue, setCommandQueue] = useState<Command['type'][]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [starsEarned, setStarsEarned] = useState(0);

  const challenge = CHALLENGES[currentChallenge];

  useEffect(() => {
    const loadUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUserId(user?.id || null);
    };
    loadUser();
  }, []);

  useEffect(() => {
    // Reset position when challenge changes
    setPosition(challenge.start);
    setDirection('right');
    setCommandQueue([]);
    setCompleted(false);
    setShowHint(false);
  }, [currentChallenge, challenge.start]);

  // Remove client-side goal checking - server handles validation now

  const getDirectionAngle = (dir: Direction): number => {
    switch (dir) {
      case 'up': return -90;
      case 'down': return 90;
      case 'left': return 180;
      case 'right': return 0;
    }
  };

  const turnLeft = (dir: Direction): Direction => {
    const turns: Record<Direction, Direction> = {
      up: 'left',
      left: 'down',
      down: 'right',
      right: 'up',
    };
    return turns[dir];
  };

  const turnRight = (dir: Direction): Direction => {
    const turns: Record<Direction, Direction> = {
      up: 'right',
      right: 'down',
      down: 'left',
      left: 'up',
    };
    return turns[dir];
  };

  const moveForward = (pos: Position, dir: Direction): Position => {
    const newPos = { ...pos };
    switch (dir) {
      case 'up':
        newPos.y = Math.max(0, newPos.y - 1);
        break;
      case 'down':
        newPos.y = Math.min(GRID_SIZE - 1, newPos.y + 1);
        break;
      case 'left':
        newPos.x = Math.max(0, newPos.x - 1);
        break;
      case 'right':
        newPos.x = Math.min(GRID_SIZE - 1, newPos.x + 1);
        break;
    }
    return newPos;
  };

  const moveBackward = (pos: Position, dir: Direction): Position => {
    const oppositeDir: Record<Direction, Direction> = {
      up: 'down',
      down: 'up',
      left: 'right',
      right: 'left',
    };
    return moveForward(pos, oppositeDir[dir]);
  };

  const addCommand = (command: Command['type']) => {
    if (isPlaying || completed) return;
    setCommandQueue([...commandQueue, command]);
  };

  const executeCommands = async () => {
    if (commandQueue.length === 0 || isPlaying) return;

    setIsPlaying(true);
    let currentPos = { ...position };
    let currentDir = direction;

    // Visual simulation for user feedback
    for (const command of commandQueue) {
      await new Promise(resolve => setTimeout(resolve, 500));

      switch (command) {
        case 'forward':
          currentPos = moveForward(currentPos, currentDir);
          break;
        case 'backward':
          currentPos = moveBackward(currentPos, currentDir);
          break;
        case 'turn-left':
          currentDir = turnLeft(currentDir);
          break;
        case 'turn-right':
          currentDir = turnRight(currentDir);
          break;
      }

      setPosition(currentPos);
      setDirection(currentDir);
    }

    // Server-side validation
    try {
      const { data, error } = await supabase.functions.invoke('validate-robotics-challenge', {
        body: {
          module_id: 'intro-robotics-r-3',
          challenge_id: challenge.id,
          commands: commandQueue.map(cmd => ({
            type: cmd.replace('-', '_') // Convert 'turn-left' to 'turn_left'
          })),
        },
      });

      if (error) {
        console.error('Validation error:', error);
        alert('Failed to validate solution. Please try again.');
        setIsPlaying(false);
        return;
      }

      if (data.success) {
        setCompleted(true);
        setStarsEarned(data.stars_earned);
        alert(data.feedback);
      } else {
        alert(data.feedback || 'Try again!');
      }
    } catch (error) {
      console.error('Challenge validation error:', error);
      alert('Network error. Please check your connection.');
    }

    setIsPlaying(false);
  };

  const reset = () => {
    setPosition(challenge.start);
    setDirection('right');
    setCommandQueue([]);
    setCompleted(false);
    setIsPlaying(false);
  };

  const nextChallenge = () => {
    if (currentChallenge < CHALLENGES.length - 1) {
      setCurrentChallenge(currentChallenge + 1);
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--background)', padding: '20px' }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
        {/* Header */}
        <div style={{ marginBottom: '24px' }}>
          <button
            onClick={() => router.push('/dashboard/parent/robotics')}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--primary)',
              fontSize: '14px',
              fontWeight: 600,
              cursor: 'pointer',
              marginBottom: '16px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            ← Back to Robotics
          </button>
          <h1 style={{ fontSize: '32px', fontWeight: 700, marginBottom: '8px' }}>
            🤖 My First Robot Friend
          </h1>
          <p style={{ color: 'var(--muted)', fontSize: '16px' }}>
            Grade R-3 • Learn basic robot movements through fun challenges!
          </p>
        </div>

        {/* Challenge Info */}
        <div style={{
          background: 'linear-gradient(135deg, rgba(124, 58, 237, 0.1) 0%, rgba(236, 72, 153, 0.1) 100%)',
          border: '2px solid #7c3aed',
          borderRadius: '16px',
          padding: '20px',
          marginBottom: '24px',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <h2 style={{ fontSize: '20px', fontWeight: 700 }}>
              Challenge {challenge.id}: {challenge.title}
            </h2>
            <div style={{ display: 'flex', gap: '4px' }}>
              {Array.from({ length: challenge.stars }).map((_, i) => (
                <span key={i} style={{ fontSize: '20px' }}>
                  {completed ? '⭐' : '☆'}
                </span>
              ))}
            </div>
          </div>
          <p style={{ color: 'var(--text)', marginBottom: '12px' }}>{challenge.description}</p>
          {showHint && (
            <div style={{
              background: 'rgba(251, 191, 36, 0.1)',
              border: '1px solid #fbbf24',
              borderRadius: '8px',
              padding: '12px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}>
              <Sparkles size={16} color="#fbbf24" />
              <span style={{ fontSize: '14px', color: '#fbbf24' }}>{challenge.hint}</span>
            </div>
          )}
          {!showHint && (
            <button
              onClick={() => setShowHint(true)}
              style={{
                background: 'none',
                border: '1px solid #fbbf24',
                color: '#fbbf24',
                padding: '6px 12px',
                borderRadius: '6px',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              💡 Show Hint
            </button>
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '24px' }}>
          {/* Grid */}
          <div>
            <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '12px' }}>Robot Grid</h3>
            <div style={{
              display: 'grid',
              gridTemplateColumns: `repeat(${GRID_SIZE}, 1fr)`,
              gap: '8px',
              background: 'var(--surface)',
              padding: '16px',
              borderRadius: '12px',
              aspectRatio: '1',
              maxWidth: '500px',
              margin: '0 auto',
            }}>
              {Array.from({ length: GRID_SIZE * GRID_SIZE }).map((_, i) => {
                const x = i % GRID_SIZE;
                const y = Math.floor(i / GRID_SIZE);
                const isRobot = position.x === x && position.y === y;
                const isGoal = challenge.goal.x === x && challenge.goal.y === y;
                const isStart = challenge.start.x === x && challenge.start.y === y;

                return (
                  <div
                    key={i}
                    style={{
                      background: isGoal ? 'rgba(16, 185, 129, 0.2)' : isStart ? 'rgba(251, 191, 36, 0.2)' : 'var(--surface-2)',
                      border: isGoal ? '2px solid #10b981' : isStart ? '2px solid #fbbf24' : '1px solid var(--border)',
                      borderRadius: '8px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 'clamp(24px, 6vw, 32px)',
                      aspectRatio: '1',
                      position: 'relative',
                      transition: 'all 0.3s ease',
                    }}
                  >
                    {isRobot && (
                      <div style={{
                        transform: `rotate(${getDirectionAngle(direction)}deg)`,
                        transition: 'transform 0.3s ease',
                      }}>
                        🤖
                      </div>
                    )}
                    {isGoal && !isRobot && '🎯'}
                    {isStart && !isRobot && !isGoal && '🏠'}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Controls */}
          <div>
            <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '12px' }}>Command Queue</h3>
            <div style={{
              background: 'var(--surface)',
              padding: '16px',
              borderRadius: '12px',
              minHeight: '120px',
              marginBottom: '16px',
            }}>
              <div style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: '8px',
                minHeight: '80px',
              }}>
                {commandQueue.map((cmd, i) => {
                  const command = COMMANDS.find(c => c.type === cmd)!;
                  const Icon = command.icon;
                  return (
                    <div
                      key={i}
                      style={{
                        background: '#7c3aed',
                        color: 'white',
                        padding: '8px 12px',
                        borderRadius: '8px',
                        fontSize: '13px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                      }}
                    >
                      <Icon size={14} />
                      {i + 1}
                    </div>
                  );
                })}
                {commandQueue.length === 0 && (
                  <p style={{ color: 'var(--muted)', fontSize: '14px' }}>
                    Click buttons below to add commands
                  </p>
                )}
              </div>
            </div>

            <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '12px' }}>Commands</h3>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
              gap: '12px',
              marginBottom: '16px',
            }}>
              {COMMANDS.map(command => {
                const Icon = command.icon;
                return (
                  <button
                    key={command.type}
                    onClick={() => addCommand(command.type)}
                    disabled={isPlaying || completed}
                    style={{
                      background: 'linear-gradient(135deg, #7c3aed 0%, #ec4899 100%)',
                      border: 'none',
                      borderRadius: '12px',
                      padding: '20px 16px',
                      color: 'white',
                      fontSize: '15px',
                      fontWeight: 600,
                      cursor: isPlaying || completed ? 'not-allowed' : 'pointer',
                      opacity: isPlaying || completed ? 0.5 : 1,
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '8px',
                      transition: 'all 0.2s',
                      minHeight: '90px',
                      touchAction: 'manipulation',
                      WebkitTapHighlightColor: 'transparent',
                    }}
                    onMouseEnter={(e) => {
                      if (!isPlaying && !completed) {
                        e.currentTarget.style.transform = 'scale(1.05)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = 'scale(1)';
                    }}
                  >
                    <Icon size={28} />
                    {command.label}
                  </button>
                );
              })}
            </div>

            {/* Action Buttons */}
            <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
              <button
                onClick={executeCommands}
                disabled={commandQueue.length === 0 || isPlaying || completed}
                style={{
                  flex: '1 1 200px',
                  background: '#10b981',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '16px 12px',
                  color: 'white',
                  fontSize: '16px',
                  fontWeight: 700,
                  cursor: commandQueue.length === 0 || isPlaying || completed ? 'not-allowed' : 'pointer',
                  opacity: commandQueue.length === 0 || isPlaying || completed ? 0.5 : 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  minHeight: '56px',
                  touchAction: 'manipulation',
                  WebkitTapHighlightColor: 'transparent',
                }}
              >
                <Play size={20} />
                {isPlaying ? 'Running...' : 'Run Code'}
              </button>
              <button
                onClick={reset}
                style={{
                  flex: '0 1 auto',
                  background: 'var(--surface-2)',
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  padding: '16px 20px',
                  color: 'var(--text)',
                  fontSize: '16px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  minHeight: '56px',
                  touchAction: 'manipulation',
                  WebkitTapHighlightColor: 'transparent',
                }}
              >
                <RotateCcw size={20} />
                Reset
              </button>
            </div>

            {/* Success Message */}
            {completed && (
              <div style={{
                background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.2) 0%, rgba(5, 150, 105, 0.2) 100%)',
                border: '2px solid #10b981',
                borderRadius: '12px',
                padding: '16px',
                textAlign: 'center',
              }}>
                <div style={{ fontSize: '48px', marginBottom: '8px' }}>🎉</div>
                <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#10b981', marginBottom: '8px' }}>
                  Challenge Complete!
                </h3>
                <p style={{ fontSize: '14px', color: 'var(--text)', marginBottom: '16px' }}>
                  You earned {starsEarned} star{starsEarned > 1 ? 's' : ''}!
                </p>
                {currentChallenge < CHALLENGES.length - 1 ? (
                  <button
                    onClick={nextChallenge}
                    style={{
                      background: 'linear-gradient(135deg, #7c3aed 0%, #ec4899 100%)',
                      border: 'none',
                      borderRadius: '8px',
                      padding: '12px 24px',
                      color: 'white',
                      fontSize: '14px',
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    Next Challenge →
                  </button>
                ) : (
                  <button
                    onClick={() => router.push('/dashboard/parent/robotics')}
                    style={{
                      background: 'linear-gradient(135deg, #7c3aed 0%, #ec4899 100%)',
                      border: 'none',
                      borderRadius: '8px',
                      padding: '12px 24px',
                      color: 'white',
                      fontSize: '14px',
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    Complete Module! 🎓
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
