'use client';

import { useTranslation } from 'react-i18next';
import { UserPlus, BookOpen, GraduationCap, Home, Sparkles } from 'lucide-react';

interface EmptyChildrenStateProps {
  usageType?: 'preschool' | 'k12_school' | 'homeschool' | 'aftercare' | 'supplemental' | 'exploring' | 'independent';
  onAddChild: () => void;
}

export function EmptyChildrenState({ usageType, onAddChild }: EmptyChildrenStateProps) {
  const { t } = useTranslation();

  const getContent = () => {
    switch (usageType) {
      case 'homeschool':
        return {
          icon: Home,
          title: t('dashboard.parent.empty_children.homeschool.title', { defaultValue: 'Start Your Homeschool Journey' }),
          description: t('dashboard.parent.empty_children.homeschool.description', { defaultValue: 'Add your children to begin tracking their learning progress, accessing CAPS-aligned curriculum, and using our AI-powered tools.' }),
          cta: t('dashboard.parent.empty_children.homeschool.cta', { defaultValue: 'Add Your First Learner' }),
          color: '#10b981'
        };
      
      case 'supplemental':
        return {
          icon: Sparkles,
          title: t('dashboard.parent.empty_children.supplemental.title', { defaultValue: "Boost Your Child's Learning" }),
          description: t('dashboard.parent.empty_children.supplemental.description', { defaultValue: 'Add your children to access extra lessons, practice exams, and personalized learning support.' }),
          cta: t('dashboard.parent.empty_children.supplemental.cta', { defaultValue: 'Add Child' }),
          color: '#f59e0b'
        };
      
      case 'exploring':
        return {
          icon: BookOpen,
          title: t('dashboard.parent.empty_children.exploring.title', { defaultValue: 'Welcome to Digital Learning' }),
          description: t('dashboard.parent.empty_children.exploring.description', { defaultValue: 'Join EduDashPro Community School - explore Robotics, AI, Data Science, Frontend & Backend Development. Build digital literacy with ad-supported free access.' }),
          cta: t('dashboard.parent.empty_children.exploring.cta', { defaultValue: 'Get Started' }),
          color: '#06b6d4'
        };
      
      case 'k12_school':
      case 'preschool':
        return {
          icon: GraduationCap,
          title: t('dashboard.parent.empty_children.school.title', { defaultValue: 'Add Your Children' }),
          description: t('dashboard.parent.empty_children.school.description', { defaultValue: 'Connect your children to start viewing their progress, communicating with teachers, and staying updated with school activities.' }),
          cta: t('dashboard.parent.empty_children.school.cta', { defaultValue: 'Add Child' }),
          color: '#8b5cf6'
        };
      
      case 'aftercare':
        return {
          icon: UserPlus,
          title: t('dashboard.parent.empty_children.aftercare.title', { defaultValue: 'Register Your Children' }),
          description: t('dashboard.parent.empty_children.aftercare.description', { defaultValue: 'Add your children to access aftercare schedules, daily updates, and communication with staff.' }),
          cta: t('dashboard.parent.empty_children.aftercare.cta', { defaultValue: 'Add Child' }),
          color: '#ec4899'
        };
      
      default:
        return {
          icon: UserPlus,
          title: t('dashboard.parent.empty_children.default.title', { defaultValue: 'Join Our Digital Community' }),
          description: t('dashboard.parent.empty_children.default.description', { defaultValue: 'Start learning Robotics, AI, Data Science, and Software Development. Instant access with free tier (ad-supported daily AI limits).' }),
          cta: t('dashboard.parent.empty_children.default.cta', { defaultValue: 'Add Child' }),
          color: '#667eea'
        };
    }
  };

  const content = getContent();
  const Icon = content.icon;

  return (
    <div className="section">
      <div 
        className="card" 
        style={{ 
          background: `linear-gradient(135deg, ${content.color}22 0%, ${content.color}11 100%)`,
          border: `2px dashed ${content.color}44`,
          padding: 'var(--space-6)',
          textAlign: 'center'
        }}
      >
        <div style={{ 
          display: 'inline-flex', 
          alignItems: 'center', 
          justifyContent: 'center',
          width: 80, 
          height: 80,
          borderRadius: '50%',
          background: `${content.color}22`,
          marginBottom: 24
        }}>
          <Icon size={40} style={{ color: content.color }} />
        </div>
        
        <h2 style={{ 
          margin: 0, 
          marginBottom: 12, 
          fontSize: 24, 
          fontWeight: 700,
          color: content.color
        }}>
          {content.title}
        </h2>
        
        <p style={{ 
          margin: 0, 
          marginBottom: 24, 
          fontSize: 15, 
          lineHeight: 1.6,
          color: 'var(--text-secondary)',
          maxWidth: 500,
          marginLeft: 'auto',
          marginRight: 'auto'
        }}>
          {content.description}
        </p>
        
        <button
          onClick={onAddChild}
          className="btn"
          style={{
            background: `linear-gradient(135deg, ${content.color} 0%, ${content.color}dd 100%)`,
            color: 'white',
            fontWeight: 700,
            padding: '14px 32px',
            fontSize: 16,
            border: 'none',
            borderRadius: 12,
            cursor: 'pointer',
            boxShadow: `0 4px 12px ${content.color}44`,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 10
          }}
        >
          <UserPlus size={20} />
          {content.cta}
        </button>
      </div>
    </div>
  );
}
