'use client';

import { useState, useEffect } from 'react';
import { Bot, Code, Cpu, Zap, Play, CheckCircle, Lock, BookOpen, UserPlus } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';

interface Child {
  id: string;
  first_name: string;
  last_name: string;
  date_of_birth: string;
  grade_level: string;
}

interface RoboticsModule {
  id: string;
  title: string;
  description: string;
  grade_range: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  topics: string[];
  activity_type: 'simulation' | 'block-coding' | 'challenge' | 'project';
  estimated_time: number; // minutes
  caps_aligned: boolean;
  prerequisites?: string[];
  learning_outcomes: string[];
  thumbnail_url?: string;
  is_premium: boolean;
  requires_parent_plus?: boolean;
}

const ROBOTICS_MODULES: RoboticsModule[] = [
  {
    id: 'intro-robotics-r-3',
    title: 'My First Robot Friend',
    description: 'Learn basic robot movements through storytelling and visual programming',
    grade_range: 'R-3',
    difficulty: 'beginner',
    topics: ['Movement', 'Directions', 'Sequences'],
    activity_type: 'simulation',
    estimated_time: 15,
    caps_aligned: true,
    learning_outcomes: [
      'Understand left, right, forward, backward',
      'Create simple movement sequences',
      'Solve basic navigation puzzles'
    ],
    is_premium: false // Requires Parent Plus or School tier
  },
  {
    id: 'block-coding-4-6',
    title: 'Block Coding Adventures',
    description: 'Drag-and-drop coding to control robots and solve puzzles',
    grade_range: '4-6',
    difficulty: 'beginner',
    topics: ['Loops', 'Conditions', 'Events'],
    activity_type: 'block-coding',
    estimated_time: 25,
    caps_aligned: true,
    learning_outcomes: [
      'Use loops to repeat actions',
      'Apply if-then conditions',
      'Combine blocks to solve problems'
    ],
    is_premium: false // Requires Parent Plus or School tier
  },
  {
    id: 'sensors-7-9',
    title: 'Robot Sensors & Logic',
    description: 'Program robots with sensors to navigate obstacles and make decisions',
    grade_range: '7-9',
    difficulty: 'intermediate',
    topics: ['Sensors', 'Decision Making', 'Logic Gates'],
    activity_type: 'simulation',
    estimated_time: 30,
    caps_aligned: true,
    prerequisites: ['block-coding-4-6'],
    learning_outcomes: [
      'Understand sensor inputs (touch, light, distance)',
      'Apply AND/OR/NOT logic',
      'Design autonomous robot behaviors'
    ],
    is_premium: true
  },
  {
    id: 'ai-robotics-10-12',
    title: 'AI-Powered Robotics',
    description: 'Introduction to machine learning concepts through robot training',
    grade_range: '10-12',
    difficulty: 'advanced',
    topics: ['Machine Learning', 'Pattern Recognition', 'Optimization'],
    activity_type: 'project',
    estimated_time: 45,
    caps_aligned: true,
    prerequisites: ['sensors-7-9'],
    learning_outcomes: [
      'Train robots using reinforcement learning',
      'Understand neural network basics',
      'Apply AI to solve real-world problems'
    ],
    is_premium: true
  },
  {
    id: 'line-follower-challenge',
    title: 'Line Follower Challenge',
    description: 'Program a robot to follow colored lines using sensor feedback',
    grade_range: '7-12',
    difficulty: 'intermediate',
    topics: ['PID Control', 'Sensor Calibration', 'Speed Control'],
    activity_type: 'challenge',
    estimated_time: 20,
    caps_aligned: true,
    learning_outcomes: [
      'Calibrate light sensors',
      'Implement basic PID control',
      'Optimize robot speed and accuracy'
    ],
    is_premium: true
  },
  {
    id: 'sorting-robot-project',
    title: 'Color Sorting Robot',
    description: 'Build and program a robot that sorts objects by color',
    grade_range: '8-12',
    difficulty: 'advanced',
    topics: ['Computer Vision', 'Automation', 'Efficiency'],
    activity_type: 'project',
    estimated_time: 60,
    caps_aligned: true,
    prerequisites: ['sensors-7-9'],
    learning_outcomes: [
      'Use color sensors for object detection',
      'Implement sorting algorithms',
      'Measure and improve efficiency'
    ],
    is_premium: true
  }
];

export default function RoboticsLessonsPage() {
  const [selectedGrade, setSelectedGrade] = useState<string>('all');
  const [selectedDifficulty, setSelectedDifficulty] = useState<string>('all');
  const [userTier, setUserTier] = useState<string>('free');
  const [children, setChildren] = useState<Child[]>([]);
  const [selectedChild, setSelectedChild] = useState<string>('');
  const [loadingChildren, setLoadingChildren] = useState(true);
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    loadUserData();
  }, []);

  const loadUserData = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Load user tier from user_ai_tiers table
    const { data: tierData } = await supabase
      .from('user_ai_tiers')
      .select('tier')
      .eq('user_id', user.id)
      .single();

    if (tierData) {
      setUserTier(tierData.tier || 'free');
    } else {
      // Fallback to free if no tier record exists
      setUserTier('free');
    }

    // Load registered children
    // Check both parent_id and guardian_id
    const { data: childrenData } = await supabase
      .from('students')
      .select('id, first_name, last_name, date_of_birth, grade_level')
      .or(`parent_id.eq.${user.id},guardian_id.eq.${user.id}`)
      .order('first_name');

    if (childrenData && childrenData.length > 0) {
      setChildren(childrenData);
      setSelectedChild(childrenData[0].id); // Auto-select first child
    }
    
    setLoadingChildren(false);
  };

  // Calculate age from date of birth
  const getChildAge = (dateOfBirth: string): number => {
    const today = new Date();
    const birthDate = new Date(dateOfBirth);
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age;
  };

  // Get age-appropriate modules based on selected child
  const getAgeAppropriateModules = () => {
    if (!selectedChild || children.length === 0) return ROBOTICS_MODULES;
    
    const child = children.find(c => c.id === selectedChild);
    if (!child) return ROBOTICS_MODULES;

    const age = getChildAge(child.date_of_birth);
    
    // Filter modules by age appropriateness
    return ROBOTICS_MODULES.filter(module => {
      const [minGrade, maxGrade] = module.grade_range.split('-');
      
      // R-3 = ages 3-6
      if (minGrade === 'R' && age >= 3 && age <= 6) return true;
      
      // 4-6 = ages 9-11
      if (minGrade === '4' && age >= 9 && age <= 11) return true;
      
      // 7-9 = ages 12-14
      if (minGrade === '7' && age >= 12 && age <= 14) return true;
      
      // 10-12 = ages 15-17
      if (minGrade === '10' && age >= 15 && age <= 17) return true;
      
      // 8-12 = ages 13-17
      if (minGrade === '8' && age >= 13 && age <= 17) return true;
      
      return false;
    });
  };

  const filteredModules = getAgeAppropriateModules().filter(module => {
    if (selectedGrade !== 'all' && !module.grade_range.includes(selectedGrade)) return false;
    if (selectedDifficulty !== 'all' && module.difficulty !== selectedDifficulty) return false;
    return true;
  });

  const canAccessModule = (module: RoboticsModule) => {
    // Free tier users can't access any modules
    if (userTier === 'free') {
      return false;
    }
    
    if (!module.is_premium) {
      // Non-premium modules are available to parent_starter and above
      return userTier === 'parent_starter' || userTier === 'parent_plus' || userTier?.startsWith('school_') || userTier?.startsWith('teacher_');
    }
    
    // Premium modules require parent_plus or school/teacher tiers
    return userTier === 'parent_plus' || userTier?.startsWith('school_') || userTier?.startsWith('teacher_');
  };

  const getModuleLabel = (module: RoboticsModule) => {
    if (!module.is_premium) {
      // Non-premium modules
      if (userTier === 'free') return 'STARTER+';
      return 'INCLUDED';
    }
    // Premium modules
    if (userTier === 'parent_plus' || userTier?.startsWith('school_') || userTier?.startsWith('teacher_')) {
      return 'INCLUDED';
    }
    return 'PLUS+';
  };

  const handleModuleClick = (module: RoboticsModule) => {
    if (!canAccessModule(module)) {
      alert('🔒 This module requires a premium subscription. Upgrade to unlock all robotics lessons!');
      router.push('/dashboard/parent/upgrade');
      return;
    }
    // Navigate to the module page
    window.location.href = `/dashboard/parent/robotics/${module.id}`;
  };

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty) {
      case 'beginner': return '#10b981';
      case 'intermediate': return '#f59e0b';
      case 'advanced': return '#ef4444';
      default: return '#6b7280';
    }
  };

  const getActivityIcon = (type: string) => {
    switch (type) {
      case 'simulation': return <Bot size={20} />;
      case 'block-coding': return <Code size={20} />;
      case 'challenge': return <Zap size={20} />;
      case 'project': return <Cpu size={20} />;
      default: return <Play size={20} />;
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--background)',
      padding: '20px',
    }}>
      <div style={{
        maxWidth: '1400px',
        margin: '0 auto',
      }}>
        {/* Header */}
        <div style={{
          marginBottom: '32px',
        }}>
          <div style={{
            display: 'inline-block',
            padding: '6px 12px',
            background: 'linear-gradient(135deg, rgba(124, 58, 237, 0.2) 0%, rgba(236, 72, 153, 0.2) 100%)',
            border: '1px solid #7c3aed',
            borderRadius: '8px',
            fontSize: '12px',
            fontWeight: 600,
            color: '#c4b5fd',
            marginBottom: '16px',
          }}>
            🇿🇦 CAPS-Aligned STEM Education
          </div>
          <h1 style={{
            fontSize: '36px',
            fontWeight: 700,
            marginBottom: '8px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
          }}>
            <Bot size={40} color="#7c3aed" />
            Interactive Robotics & Coding
          </h1>
          <p style={{
            fontSize: '16px',
            color: 'var(--muted)',
            maxWidth: '700px',
          }}>
            Learn robotics, coding, and AI through interactive simulations and projects. 
            No physical robots needed - all activities run in your browser!
          </p>
        </div>

        {/* No Children Registered State */}
        {!loadingChildren && children.length === 0 && (
          <div style={{
            background: 'var(--card)',
            border: '2px dashed var(--border)',
            borderRadius: '16px',
            padding: '48px',
            textAlign: 'center',
            maxWidth: '600px',
            margin: '0 auto',
          }}>
            <UserPlus size={64} color="#7c3aed" style={{ marginBottom: '24px' }} />
            <h2 style={{
              fontSize: '24px',
              fontWeight: 700,
              marginBottom: '12px',
            }}>
              Register Your Child First
            </h2>
            <p style={{
              fontSize: '16px',
              color: 'var(--muted)',
              marginBottom: '24px',
              lineHeight: 1.6,
            }}>
              To show age-appropriate robotics modules, please register your child first. 
              We'll personalize the learning experience based on their age and grade level.
            </p>
            <button
              onClick={() => router.push('/dashboard/parent/register-child')}
              style={{
                background: 'linear-gradient(135deg, #7c3aed 0%, #ec4899 100%)',
                color: 'white',
                padding: '14px 32px',
                borderRadius: '12px',
                border: 'none',
                fontSize: '16px',
                fontWeight: 600,
                cursor: 'pointer',
                boxShadow: '0 4px 14px rgba(124, 58, 237, 0.4)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <UserPlus size={20} />
              Register Your Child
            </button>
          </div>
        )}

        {/* Child Selector & Content */}
        {!loadingChildren && children.length > 0 && (
          <>
            {/* Child Selector */}
            <div style={{
              background: 'var(--card)',
              border: '1px solid var(--border)',
              borderRadius: '12px',
              padding: '20px',
              marginBottom: '24px',
            }}>
              <label style={{
                fontSize: '14px',
                fontWeight: 600,
                marginBottom: '8px',
                display: 'block',
              }}>
                Select Child
              </label>
              <select
                value={selectedChild}
                onChange={(e) => setSelectedChild(e.target.value)}
                style={{
                  width: '100%',
                  maxWidth: '400px',
                  padding: '12px',
                  borderRadius: '8px',
                  border: '1px solid var(--border)',
                  background: 'var(--surface)',
                  fontSize: '15px',
                  cursor: 'pointer',
                }}
              >
                {children.map((child) => (
                  <option key={child.id} value={child.id}>
                    {child.first_name} {child.last_name} - Age {getChildAge(child.date_of_birth)} ({child.grade_level || 'No grade'})
                  </option>
                ))}
              </select>
              <p style={{
                fontSize: '13px',
                color: 'var(--muted)',
                marginTop: '8px',
              }}>
                📚 Showing age-appropriate modules for {children.find(c => c.id === selectedChild)?.first_name}
              </p>
            </div>

        {/* Filters */}
        <div style={{
          background: 'var(--surface)',
          borderRadius: '16px',
          padding: '24px',
          marginBottom: '24px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
        }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '16px',
          }}>
            <div>
              <label style={{
                display: 'block',
                fontSize: '14px',
                fontWeight: 500,
                marginBottom: '8px',
              }}>
                Grade Level
              </label>
              <select
                value={selectedGrade}
                onChange={(e) => setSelectedGrade(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: '8px',
                  border: '2px solid var(--border)',
                  background: 'var(--surface-2)',
                  color: 'var(--text)',
                  fontSize: '14px',
                }}
              >
                <option value="all">All Grades</option>
                <option value="R">Grade R</option>
                <option value="1">Grade 1-3</option>
                <option value="4">Grade 4-6</option>
                <option value="7">Grade 7-9</option>
                <option value="10">Grade 10-12</option>
              </select>
            </div>

            <div>
              <label style={{
                display: 'block',
                fontSize: '14px',
                fontWeight: 500,
                marginBottom: '8px',
              }}>
                Difficulty
              </label>
              <select
                value={selectedDifficulty}
                onChange={(e) => setSelectedDifficulty(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: '8px',
                  border: '2px solid var(--border)',
                  background: 'var(--surface-2)',
                  color: 'var(--text)',
                  fontSize: '14px',
                }}
              >
                <option value="all">All Levels</option>
                <option value="beginner">Beginner</option>
                <option value="intermediate">Intermediate</option>
                <option value="advanced">Advanced</option>
              </select>
            </div>
          </div>
        </div>

        {/* Modules Grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 340px), 1fr))',
          gap: '16px',
        }}>
          {filteredModules.map(module => {
            const hasAccess = canAccessModule(module);
            
            return (
              <div
                key={module.id}
                onClick={() => handleModuleClick(module)}
                style={{
                  background: hasAccess 
                    ? 'var(--surface)'
                    : 'linear-gradient(135deg, rgba(124, 58, 237, 0.05) 0%, rgba(236, 72, 153, 0.05) 100%)',
                  borderRadius: '16px',
                  overflow: 'hidden',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                  transition: 'all 0.2s ease',
                  cursor: 'pointer',
                  border: hasAccess ? '1px solid var(--border)' : '2px solid #7c3aed',
                  position: 'relative',
                  opacity: hasAccess ? 1 : 0.85,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-4px)';
                  e.currentTarget.style.boxShadow = hasAccess 
                    ? '0 8px 24px rgba(0,0,0,0.2)'
                    : '0 8px 24px rgba(124, 58, 237, 0.4)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)';
                }}
              >
                {/* Header */}
                <div style={{
                  padding: '20px',
                  background: hasAccess
                    ? 'linear-gradient(135deg, rgba(124, 58, 237, 0.1) 0%, rgba(236, 72, 153, 0.1) 100%)'
                    : 'linear-gradient(135deg, rgba(124, 58, 237, 0.2) 0%, rgba(236, 72, 153, 0.2) 100%)',
                  borderBottom: '1px solid var(--border)',
                }}>
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    marginBottom: '12px',
                  }}>
                    <div style={{
                      fontSize: '32px',
                    }}>
                      {getActivityIcon(module.activity_type)}
                    </div>
                    {!hasAccess && (
                      <div style={{
                        background: '#7c3aed',
                        color: 'white',
                        padding: '4px 8px',
                        borderRadius: '6px',
                        fontSize: '11px',
                        fontWeight: 600,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}>
                        <Lock size={12} />
                        {getModuleLabel(module)}
                      </div>
                    )}
                    {hasAccess && module.caps_aligned && (
                      <div style={{
                        background: '#10b981',
                        color: 'white',
                        padding: '4px 8px',
                        borderRadius: '6px',
                        fontSize: '11px',
                        fontWeight: 600,
                      }}>
                        CAPS ✓
                      </div>
                    )}
                  </div>
                  
                  <h3 style={{
                    fontSize: '18px',
                    fontWeight: 700,
                    marginBottom: '8px',
                    color: hasAccess ? 'var(--text)' : '#7c3aed',
                  }}>
                    {module.title}
                  </h3>
                  
                  <p style={{
                    fontSize: '14px',
                    color: 'var(--muted)',
                    lineHeight: 1.5,
                  }}>
                    {module.description}
                  </p>
                </div>

                {/* Body */}
                <div style={{ padding: '20px' }}>
                  {/* Meta Info */}
                  <div style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: '8px',
                    marginBottom: '16px',
                  }}>
                    <span style={{
                      fontSize: '12px',
                      padding: '4px 8px',
                      borderRadius: '6px',
                      background: 'var(--primary)',
                      color: 'white',
                      fontWeight: 600,
                    }}>
                      {module.grade_range}
                    </span>
                    <span style={{
                      fontSize: '12px',
                      padding: '4px 8px',
                      borderRadius: '6px',
                      background: getDifficultyColor(module.difficulty),
                      color: 'white',
                      fontWeight: 600,
                    }}>
                      {module.difficulty}
                    </span>
                    <span style={{
                      fontSize: '12px',
                      padding: '4px 8px',
                      borderRadius: '6px',
                      background: 'var(--surface-2)',
                      color: 'var(--text)',
                    }}>
                      ⏱️ {module.estimated_time} min
                    </span>
                  </div>

                  {/* Topics */}
                  <div style={{ marginBottom: '16px' }}>
                    <div style={{
                      fontSize: '12px',
                      fontWeight: 600,
                      color: 'var(--muted)',
                      marginBottom: '8px',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                    }}>
                      Topics Covered
                    </div>
                    <div style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: '6px',
                    }}>
                      {module.topics.map(topic => (
                        <span
                          key={topic}
                          style={{
                            fontSize: '11px',
                            padding: '4px 8px',
                            borderRadius: '6px',
                            background: 'rgba(124, 58, 237, 0.1)',
                            color: '#7c3aed',
                            border: '1px solid rgba(124, 58, 237, 0.3)',
                          }}
                        >
                          {topic}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Learning Outcomes */}
                  <div style={{ marginBottom: '16px' }}>
                    <div style={{
                      fontSize: '12px',
                      fontWeight: 600,
                      color: 'var(--muted)',
                      marginBottom: '8px',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                    }}>
                      You'll Learn
                    </div>
                    <ul style={{
                      fontSize: '13px',
                      color: 'var(--text)',
                      lineHeight: 1.6,
                      paddingLeft: '20px',
                      margin: 0,
                    }}>
                      {module.learning_outcomes.slice(0, 3).map((outcome, idx) => (
                        <li key={idx} style={{ marginBottom: '4px' }}>
                          <CheckCircle size={14} style={{ display: 'inline', marginRight: '6px', color: '#10b981' }} />
                          {outcome}
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Action Button */}
                  <button
                    style={{
                      width: '100%',
                      padding: '12px',
                      borderRadius: '8px',
                      border: 'none',
                      background: hasAccess
                        ? 'linear-gradient(135deg, #7c3aed 0%, #ec4899 100%)'
                        : 'linear-gradient(135deg, rgba(124, 58, 237, 0.2) 0%, rgba(236, 72, 153, 0.2) 100%)',
                      color: hasAccess ? 'white' : '#7c3aed',
                      fontSize: '14px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                    }}
                  >
                    {hasAccess ? (
                      <>
                        <Play size={16} />
                        Start Module
                      </>
                    ) : (
                      <>
                        <Lock size={16} />
                        Upgrade to Unlock
                      </>
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Empty State */}
        {filteredModules.length === 0 && (
          <div style={{
            textAlign: 'center',
            padding: '60px 20px',
            color: 'var(--muted)',
          }}>
            <Bot size={48} style={{ opacity: 0.3, marginBottom: '16px' }} />
            <p>No modules found. Try adjusting your filters.</p>
          </div>
        )}
          </>
        )}
      </div>
    </div>
  );
}
