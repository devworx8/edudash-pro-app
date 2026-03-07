'use client';

/**
 * TeacherComingSoon
 *
 * Reusable placeholder for teacher web pages that exist in navigation
 * but haven't been fully implemented yet. Provides consistent UX
 * with a description and link back to the dashboard.
 *
 * @module web/src/components/dashboard/teacher/TeacherComingSoon
 */

import { ArrowLeft, Construction } from 'lucide-react';
import Link from 'next/link';

interface TeacherComingSoonProps {
  /** Page title displayed in the card */
  title: string;
  /** Brief description of what the page will do */
  description: string;
  /** Optional icon component from lucide-react */
  icon?: React.ElementType;
}

export function TeacherComingSoon({
  title,
  description,
  icon: Icon = Construction,
}: TeacherComingSoonProps) {
  return (
    <div style={{ maxWidth: 480, margin: '80px auto', padding: '0 24px' }}>
      <div
        className="card"
        style={{
          textAlign: 'center',
          padding: 40,
          display: 'grid',
          gap: 16,
          justifyItems: 'center',
        }}
      >
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: 16,
            background: 'rgba(59,130,246,0.1)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon style={{ width: 28, height: 28, color: 'var(--primary)' }} />
        </div>
        <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>{title}</h2>
        <p
          style={{
            fontSize: 14,
            color: 'var(--textLight)',
            margin: 0,
            lineHeight: 1.6,
            maxWidth: 360,
          }}
        >
          {description}
        </p>
        <div
          style={{
            marginTop: 8,
            padding: '6px 12px',
            borderRadius: 8,
            background: 'rgba(59,130,246,0.08)',
            fontSize: 12,
            fontWeight: 600,
            color: 'var(--primary)',
          }}
        >
          Coming Soon
        </div>
        <Link
          href="/dashboard/teacher"
          style={{
            marginTop: 8,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 13,
            color: 'var(--textLight)',
            textDecoration: 'none',
          }}
        >
          <ArrowLeft style={{ width: 14, height: 14 }} />
          Back to Dashboard
        </Link>
      </div>
    </div>
  );
}
