'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronRight, LucideIcon } from 'lucide-react';

interface CollapsibleSectionProps {
  title: string;
  description?: string;
  children: React.ReactNode;
  defaultCollapsed?: boolean;
  icon?: LucideIcon;
  isOpen?: boolean;
  onToggle?: () => void;
}

export function CollapsibleSection({
  title,
  description,
  children,
  defaultCollapsed = false,
  icon: Icon,
  isOpen,
  onToggle,
}: CollapsibleSectionProps) {
  const [internalCollapsed, setInternalCollapsed] = useState(defaultCollapsed);
  
  // Use controlled state if provided, otherwise use internal state
  const collapsed = isOpen !== undefined ? !isOpen : internalCollapsed;
  
  const handleToggle = () => {
    if (onToggle) {
      onToggle();
    } else {
      setInternalCollapsed(!internalCollapsed);
    }
  };

  return (
    <div className="section overflow-hidden rounded-lg" style={{ width: '100%' }}>
      <button
        onClick={handleToggle}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'linear-gradient(135deg, rgba(18, 24, 38, 0.95), rgba(22, 30, 46, 0.9))',
          backdropFilter: 'blur(8px)',
          padding: 'var(--space-4)',
          borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--border)',
          cursor: 'pointer',
          transition: 'all 0.2s ease',
          WebkitTapHighlightColor: 'transparent',
          minHeight: '64px',
          textAlign: 'left',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = 'var(--primary)';
          e.currentTarget.style.background = 'linear-gradient(135deg, rgba(18, 24, 38, 1), rgba(22, 30, 46, 0.95))';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = 'var(--border)';
          e.currentTarget.style.background = 'linear-gradient(135deg, rgba(18, 24, 38, 0.95), rgba(22, 30, 46, 0.9))';
        }}
      >
        <div className="flex items-start gap-3" style={{ flex: 1 }}>
          {Icon && (
            <div style={{
              padding: 'var(--space-2)',
              background: 'rgba(124, 58, 237, 0.15)',
              borderRadius: 'var(--radius-md)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <Icon className="icon20" style={{ color: 'var(--primary)' }} />
            </div>
          )}
          <div style={{ display: 'grid', gap: 4, flex: 1 }}>
            <h2 className="h2" style={{ fontSize: 15, margin: 0 }}>
              {title}
            </h2>
            {description && (
              <p className="section-subtitle">
                {description}
              </p>
            )}
          </div>
        </div>
        <motion.div
          animate={{ rotate: collapsed ? 0 : 90 }}
          transition={{ duration: 0.2, ease: 'easeInOut' }}
        >
          <ChevronRight className="icon20" style={{ color: 'var(--muted)' }} />
        </motion.div>
      </button>
      <AnimatePresence initial={false}>
        {!collapsed && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: 'easeInOut' }}
            className="overflow-hidden"
            style={{ marginTop: 'var(--space-3)' }}
          >
            <div>
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
