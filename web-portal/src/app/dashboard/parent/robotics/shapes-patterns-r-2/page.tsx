'use client';

import { useState, useEffect } from 'react';
import { ParentShell } from '@/components/dashboard/parent/ParentShell';
import { SubPageHeader } from '@/components/dashboard/SubPageHeader';
import { Shapes, Circle, Square, Triangle, Star, CheckCircle, ArrowRight, Sparkles, Trophy } from 'lucide-react';

export default function ShapesPatternsRoboticsPage() {
  const [completedActivities, setCompletedActivities] = useState<number[]>([]);
  const [currentActivity, setCurrentActivity] = useState(1);
  const [showCelebration, setShowCelebration] = useState(false);

  const activities = [
    {
      id: 1,
      title: '🔵 Shape Recognition',
      description: 'Learn to identify and name basic shapes',
      tasks: ['Circle', 'Square', 'Triangle', 'Rectangle', 'Star']
    },
    {
      id: 2,
      title: '🎨 Color Patterns',
      description: 'Complete the pattern by choosing the next color',
      tasks: ['Red-Blue-Red-?', 'Yellow-Green-Yellow-?', 'Purple-Orange-Purple-?']
    },
    {
      id: 3,
      title: '🔢 Shape Counting',
      description: 'Count how many of each shape you see',
      tasks: ['Count circles', 'Count squares', 'Count triangles']
    },
    {
      id: 4,
      title: '🧩 Pattern Completion',
      description: 'Complete the missing shape in the pattern',
      tasks: ['Circle-Square-Circle-?', 'Triangle-Triangle-Square-?', 'Star-Circle-Star-?']
    }
  ];

  const completeActivity = (id: number) => {
    if (!completedActivities.includes(id)) {
      setCompletedActivities([...completedActivities, id]);
      if (currentActivity === id && id < activities.length) {
        setCurrentActivity(id + 1);
      }
      // Show celebration if all activities completed
      if (completedActivities.length + 1 === activities.length) {
        setTimeout(() => setShowCelebration(true), 300);
      }
    }
  };

  const progress = (completedActivities.length / activities.length) * 100;

  // Auto-hide celebration after 5 seconds
  useEffect(() => {
    if (showCelebration) {
      const timer = setTimeout(() => setShowCelebration(false), 5000);
      return () => clearTimeout(timer);
    }
  }, [showCelebration]);

  return (
    <ParentShell>
      <div style={{ margin: 'calc(var(--space-3) * -1) calc(var(--space-2) * -1)', padding: 0 }}>
        <SubPageHeader
          title="Shapes & Patterns"
          subtitle="Level R-2: Learn shapes, colors, and patterns through fun activities"
          icon={<Shapes size={28} color="white" />}
        />

        <div style={{ padding: 'var(--space-3)' }}>
          {/* Progress Bar */}
          <div className="card" style={{ padding: 24, marginBottom: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h3 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>Your Progress</h3>
              <span style={{ fontSize: 24, fontWeight: 700, color: 'var(--primary)' }}>
                {Math.round(progress)}%
              </span>
            </div>
            <div style={{
              width: '100%',
              height: 12,
              background: 'var(--surface-2)',
              borderRadius: 8,
              overflow: 'hidden'
            }}>
              <div style={{
                width: `${progress}%`,
                height: '100%',
                background: 'linear-gradient(90deg, #10b981 0%, #059669 100%)',
                transition: 'width 0.5s ease'
              }} />
            </div>
            <p style={{ marginTop: 12, fontSize: 14, color: 'var(--muted)', margin: '12px 0 0 0' }}>
              {completedActivities.length} of {activities.length} activities completed
            </p>
          </div>

          {/* Activities Grid */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: 20
          }}>
            {activities.map((activity) => {
              const isCompleted = completedActivities.includes(activity.id);
              const isCurrent = currentActivity === activity.id;
              const isLocked = activity.id > currentActivity;

              return (
                <div
                  key={activity.id}
                  className="card"
                  style={{
                    padding: 24,
                    opacity: isLocked ? 0.6 : 1,
                    border: isCurrent ? '2px solid var(--primary)' : '1px solid var(--border)',
                    position: 'relative',
                    cursor: isLocked ? 'not-allowed' : 'pointer',
                    transition: 'all 0.2s'
                  }}
                  onClick={() => !isLocked && !isCompleted && completeActivity(activity.id)}
                >
                  {isCompleted && (
                    <div style={{
                      position: 'absolute',
                      top: 12,
                      right: 12,
                      width: 32,
                      height: 32,
                      borderRadius: '50%',
                      background: '#10b981',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      boxShadow: '0 2px 8px rgba(16, 185, 129, 0.3)'
                    }}>
                      <CheckCircle size={20} color="white" />
                    </div>
                  )}

                  <div style={{
                    fontSize: 48,
                    marginBottom: 16,
                    textAlign: 'center'
                  }}>
                    {activity.title.split(' ')[0]}
                  </div>

                  <h4 style={{
                    fontSize: 18,
                    fontWeight: 700,
                    marginBottom: 8,
                    color: isCompleted ? '#10b981' : 'var(--text-primary)'
                  }}>
                    {activity.title.substring(3)}
                  </h4>

                  <p style={{
                    fontSize: 14,
                    color: 'var(--muted)',
                    marginBottom: 16,
                    lineHeight: 1.5
                  }}>
                    {activity.description}
                  </p>

                  {/* Task List */}
                  <div style={{ marginBottom: 16 }}>
                    {activity.tasks.map((task, idx) => (
                      <div
                        key={idx}
                        style={{
                          padding: '8px 12px',
                          background: 'var(--surface-2)',
                          borderRadius: 8,
                          marginBottom: 8,
                          fontSize: 13,
                          color: 'var(--text-primary)'
                        }}
                      >
                        {task}
                      </div>
                    ))}
                  </div>

                  {/* Action Button */}
                  {!isCompleted && !isLocked && (
                    <button
                      className="btn btnPrimary"
                      style={{
                        width: '100%',
                        padding: '10px 16px',
                        fontSize: 14,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 8
                      }}
                    >
                      Start Activity
                      <ArrowRight size={16} />
                    </button>
                  )}

                  {isCompleted && (
                    <div style={{
                      padding: '10px 16px',
                      background: 'rgba(16, 185, 129, 0.1)',
                      borderRadius: 8,
                      textAlign: 'center',
                      fontSize: 14,
                      fontWeight: 600,
                      color: '#10b981'
                    }}>
                      ✓ Completed!
                    </div>
                  )}

                  {isLocked && (
                    <div style={{
                      padding: '10px 16px',
                      background: 'var(--surface-2)',
                      borderRadius: 8,
                      textAlign: 'center',
                      fontSize: 14,
                      fontWeight: 600,
                      color: 'var(--muted)'
                    }}>
                      🔒 Complete previous activities first
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Completion Celebration */}
          {progress === 100 && (
            <div className="card" style={{
              padding: 40,
              marginTop: 24,
              textAlign: 'center',
              background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
              color: 'white'
            }}>
              <div style={{ fontSize: 64, marginBottom: 16 }}>🎉</div>
              <h2 style={{ fontSize: 28, fontWeight: 700, marginBottom: 12, color: 'white' }}>
                Amazing Work!
              </h2>
              <p style={{ fontSize: 16, marginBottom: 24, color: 'rgba(255,255,255,0.9)' }}>
                You've completed all Shapes & Patterns activities. Ready for the next level?
              </p>
              <button
                className="btn"
                style={{
                  padding: '12px 32px',
                  fontSize: 16,
                  background: 'white',
                  color: '#10b981',
                  fontWeight: 600
                }}
                onClick={() => window.location.href = '/dashboard/parent/robotics'}
              >
                Continue Learning
              </button>
            </div>
          )}

          {/* Tips Card */}
          <div className="card" style={{
            padding: 24,
            marginTop: 24,
            background: 'rgba(59, 130, 246, 0.1)',
            border: '1px solid rgba(59, 130, 246, 0.2)'
          }}>
            <h4 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12, color: 'var(--text-primary)' }}>
              💡 Learning Tips
            </h4>
            <ul style={{ margin: 0, paddingLeft: 20, fontSize: 14, color: 'var(--muted)', lineHeight: 1.8 }}>
              <li>Take breaks between activities to keep learning fun</li>
              <li>Use real objects around your home to practice shape recognition</li>
              <li>Create patterns with toys, blocks, or colored paper</li>
              <li>Celebrate small victories - every shape learned is progress!</li>
            </ul>
          </div>
        </div>

        {/* Floating Celebration Animation */}
        {showCelebration && (
          <div
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'rgba(0, 0, 0, 0.8)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 9999,
              animation: 'fadeIn 0.3s ease-in'
            }}
            onClick={() => setShowCelebration(false)}
          >
            <div
              style={{
                background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                borderRadius: 24,
                padding: 48,
                maxWidth: 500,
                textAlign: 'center',
                animation: 'scaleIn 0.5s cubic-bezier(0.68, -0.55, 0.265, 1.55)',
                boxShadow: '0 20px 60px rgba(16, 185, 129, 0.4)'
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <Trophy size={80} color="white" style={{ marginBottom: 24 }} />
              <h2 style={{ fontSize: 32, fontWeight: 700, marginBottom: 16, color: 'white' }}>
                🎊 Congratulations! 🎊
              </h2>
              <p style={{ fontSize: 18, marginBottom: 24, color: 'rgba(255,255,255,0.95)' }}>
                You've mastered all Shapes & Patterns activities!
              </p>
              <div style={{
                display: 'flex',
                gap: 12,
                justifyContent: 'center',
                marginBottom: 24
              }}>
                {[1, 2, 3, 4].map((i) => (
                  <Star key={i} size={32} fill="gold" color="gold" style={{
                    animation: `bounce 0.6s ease-in-out ${i * 0.1}s infinite`
                  }} />
                ))}
              </div>
              <button
                onClick={() => setShowCelebration(false)}
                style={{
                  background: 'white',
                  color: '#10b981',
                  border: 'none',
                  padding: '12px 32px',
                  borderRadius: 12,
                  fontSize: 16,
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8
                }}
              >
                <Sparkles size={20} />
                Continue Learning
              </button>
            </div>
          </div>
        )}

        <style jsx>{`
          @keyframes fadeIn {
            from {
              opacity: 0;
            }
            to {
              opacity: 1;
            }
          }

          @keyframes scaleIn {
            from {
              transform: scale(0.5);
              opacity: 0;
            }
            to {
              transform: scale(1);
              opacity: 1;
            }
          }

          @keyframes bounce {
            0%, 100% {
              transform: translateY(0);
            }
            50% {
              transform: translateY(-10px);
            }
          }
        `}</style>
      </div>
    </ParentShell>
  );
}
