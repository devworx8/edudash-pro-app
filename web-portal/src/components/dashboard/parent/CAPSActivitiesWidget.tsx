'use client';

import { useState } from 'react';
import { BookOpen, Palette, Music, Calculator, Globe, Sparkles, Brain, Beaker, Microscope, Languages, PenTool, Target, X, Activity } from 'lucide-react';

interface ActivityItem {
  id: string;
  title: string;
  description: string;
  ageGroup: string;
  duration: string;
  skillsTarget: string[];
  icon: any;
  colorClass: string;
  subject: string;
}

interface CAPSActivitiesWidgetProps {
  childAge?: number;
  childName?: string;
  onAskDashAI?: (prompt: string, display: string) => void;
}

export function CAPSActivitiesWidget({ childAge = 5, childName = 'your child', onAskDashAI }: CAPSActivitiesWidgetProps) {
  const [selectedActivity, setSelectedActivity] = useState<ActivityItem | null>(null);

  const allActivities: ActivityItem[] = [
    { id: 'colors', title: 'Colors & Shapes', description: 'Learn colors and shapes', ageGroup: '3-4 years', duration: '15 min', skillsTarget: ['Visual discrimination'], icon: Palette, colorClass: 'warning', subject: 'Early Learning' },
    { id: 'counting', title: 'Counting Objects', description: 'Practice counting', ageGroup: '3-4 years', duration: '10 min', skillsTarget: ['Number recognition'], icon: Calculator, colorClass: 'primary', subject: 'Numeracy' },
    { id: 'phonics', title: 'Letter Sounds', description: 'Learn letter sounds', ageGroup: '4-5 years', duration: '20 min', skillsTarget: ['Phonemic awareness'], icon: BookOpen, colorClass: 'primary', subject: 'Literacy' },
    { id: 'patterns', title: 'Patterns', description: 'Recognize patterns', ageGroup: '4-5 years', duration: '15 min', skillsTarget: ['Pattern recognition'], icon: Target, colorClass: 'accent', subject: 'Mathematics' },
    { id: 'reading', title: 'Reading Readiness', description: 'Pre-reading skills', ageGroup: '5-6 years', duration: '25 min', skillsTarget: ['Sight words'], icon: BookOpen, colorClass: 'danger', subject: 'Home Language' },
    { id: 'arts', title: 'Creative Arts', description: 'Music and movement', ageGroup: '5-6 years', duration: '30 min', skillsTarget: ['Fine motor skills'], icon: Music, colorClass: 'accent', subject: 'Creative Arts' },
    { id: 'comprehension', title: 'Reading Comprehension', description: 'Develop fluency', ageGroup: '6-9 years', duration: '30 min', skillsTarget: ['Reading fluency'], icon: BookOpen, colorClass: 'primary', subject: 'Home Language' },
    { id: 'basicmath', title: 'Basic Math', description: 'Addition and subtraction', ageGroup: '6-9 years', duration: '25 min', skillsTarget: ['Addition'], icon: Calculator, colorClass: 'primary', subject: 'Mathematics' },
    { id: 'science', title: 'Science Exploration', description: 'Hands-on experiments', ageGroup: '6-9 years', duration: '35 min', skillsTarget: ['Observation'], icon: Beaker, colorClass: 'warning', subject: 'Natural Sciences' },
    { id: 'multiplication', title: 'Multiplication', description: 'Times tables', ageGroup: '9-12 years', duration: '30 min', skillsTarget: ['Multiplication'], icon: Calculator, colorClass: 'primary', subject: 'Mathematics' },
    { id: 'grammar', title: 'Grammar', description: 'Writing skills', ageGroup: '9-12 years', duration: '35 min', skillsTarget: ['Grammar'], icon: PenTool, colorClass: 'accent', subject: 'Home Language' },
    { id: 'experiments', title: 'Scientific Investigation', description: 'Experiments', ageGroup: '9-12 years', duration: '40 min', skillsTarget: ['Scientific method'], icon: Microscope, colorClass: 'warning', subject: 'Natural Sciences' },
    { id: 'history', title: 'SA History', description: 'History and geography', ageGroup: '9-12 years', duration: '35 min', skillsTarget: ['Historical knowledge'], icon: Globe, colorClass: 'warning', subject: 'Social Sciences' },
    { id: 'algebra', title: 'Algebra', description: 'Variables and equations', ageGroup: '12-15 years', duration: '40 min', skillsTarget: ['Algebra'], icon: Brain, colorClass: 'primary', subject: 'Mathematics' },
    { id: 'physical', title: 'Physical Sciences', description: 'Physics and chemistry', ageGroup: '12-15 years', duration: '45 min', skillsTarget: ['Physics'], icon: Beaker, colorClass: 'primary', subject: 'Physical Sciences' },
    { id: 'language', title: 'Additional Language', description: 'Second language', ageGroup: '12-15 years', duration: '35 min', skillsTarget: ['Language skills'], icon: Languages, colorClass: 'accent', subject: 'First Additional Language' },
    { id: 'advmath', title: 'Advanced Mathematics', description: 'Calculus and trigonometry', ageGroup: '15-18 years', duration: '50 min', skillsTarget: ['Calculus'], icon: Calculator, colorClass: 'primary', subject: 'Mathematics' },
    { id: 'life', title: 'Life Sciences', description: 'Biology and genetics', ageGroup: '15-18 years', duration: '50 min', skillsTarget: ['Biology'], icon: Activity, colorClass: 'warning', subject: 'Life Sciences' },
    { id: 'matric', title: 'Matric Prep', description: 'Exam preparation', ageGroup: '15-18 years', duration: '60 min', skillsTarget: ['Exam technique'], icon: Target, colorClass: 'danger', subject: 'Exam Preparation' },
  ];

  const getAgeGroup = (age: number) => {
    if (age >= 3 && age < 5) return '3-4 years';
    if (age >= 5 && age < 6) return '4-5 years';
    if (age >= 6 && age < 7) return '5-6 years';
    if (age >= 7 && age < 10) return '6-9 years';
    if (age >= 10 && age < 13) return '9-12 years';
    if (age >= 13 && age < 16) return '12-15 years';
    if (age >= 16) return '15-18 years';
    return '5-6 years';
  };

  const ageGroup = getAgeGroup(childAge);
  const relevantActivities = allActivities.filter(a => a.ageGroup === ageGroup);

  const handleStartActivity = (activity: ActivityItem) => {
    const prompt = `You are Dash, a classroom assistant for South African preschools following the CAPS curriculum.
Generate an interactive ${activity.duration} ${activity.subject} activity for ${childName} (${activity.ageGroup}) titled "${activity.title}".
Focus skills: ${activity.skillsTarget.join(', ')}.

Requirements:
- Align explicitly to CAPS outcomes for this age group and subject
- Use only safe, low-cost household materials where possible
- Write clear parent guidance and child-facing instructions
- Make it interactive: include call-and-response lines and checkpoints with [ ] checkboxes
- Include differentiated options for easier/harder variants
- Include multilingual cues where helpful (en-ZA primary, plus short af-ZA/zu-ZA words)
- Add a formative assessment rubric (1–4) and how to observe progress
- Provide 2–3 extension ideas and a quick clean-up routine
- Keep tone warm, encouraging, and playful

Output format in Markdown:
# Activity: ${activity.title}
- Age Group: ${activity.ageGroup}
- Subject: ${activity.subject} • Duration: ${activity.duration}

## Learning Objectives (CAPS)
- ...

## Materials
- ...

## Warm-up (1–2 min)
- ...

## Steps (Interactive)
- [ ] Step 1 — Parent says: "..." Child responds: "..."
- [ ] Step 2 — ...

## Check for Understanding
- ...

## Assessment (1–4)
| Level | What it looks like |
|---|---|
| 1 | ... |
| 2 | ... |
| 3 | ... |
| 4 | ... |

## Extensions
- ...

## Parent Tips & Safety
- ...`;
    if (onAskDashAI) {
      const display = `Activity: ${activity.title} • ${activity.ageGroup} • ${activity.subject} (${activity.duration})`;
      onAskDashAI(prompt, display);
      setSelectedActivity(null);
    }
  };

  return (
    <>
      <div className="sectionTitle">
        <Activity className="w-5 h-5" style={{ color: 'var(--primary)' }} />
        CAPS Learning Activities
      </div>
      <p className="muted" style={{ fontSize: 13, marginBottom: 'var(--space-4)' }}>
        {ageGroup} • {relevantActivities.length} activities
      </p>
      <div className="grid2 caps-activities-grid">
        {relevantActivities.map((activity) => {
          const Icon = activity.icon;
          return (
            <div key={activity.id} className="card" style={{ padding: 'var(--space-4)', cursor: 'pointer' }} onClick={() => setSelectedActivity(activity)}>
              <div style={{ display: 'flex', gap: 'var(--space-3)', marginBottom: 'var(--space-3)' }}>
                <div style={{ padding: 10, borderRadius: 'var(--radius-2)', background: `var(--${activity.colorClass})` }}>
                  <Icon className="icon20" style={{ color: '#fff' }} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, marginBottom: 4 }}>{activity.title}</div>
                  <div style={{ fontSize: 11 }} className="muted">{activity.subject} • {activity.duration}</div>
                </div>
              </div>
              <p className="muted" style={{ fontSize: 13, marginBottom: 'var(--space-3)' }}>{activity.description}</p>
              <button className="btn btnPrimary" style={{ width: '100%', fontSize: 13 }} onClick={(e) => { e.stopPropagation(); handleStartActivity(activity); }}>
                <Sparkles className="icon16" />
                Start with Dash AI
              </button>
            </div>
          );
        })}
      </div>
    </>
  );
}
