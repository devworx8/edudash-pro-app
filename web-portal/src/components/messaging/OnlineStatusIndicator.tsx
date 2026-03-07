'use client';

/**
 * OnlineStatusIndicator
 * 
 * Shows user online/offline status with a colored dot indicator
 * and optional "Last seen X ago" text.
 */

import React from 'react';

export interface OnlineStatusIndicatorProps {
  /** Whether the user is online */
  isOnline: boolean;
  /** Status text (e.g., "Online", "Away", "Last seen 5 min ago") */
  statusText?: string;
  /** Size of the indicator dot */
  size?: 'sm' | 'md' | 'lg';
  /** Show only the dot, no text */
  dotOnly?: boolean;
  /** Custom className for styling */
  className?: string;
}

const sizeMap = {
  sm: { dot: 8, fontSize: 11 },
  md: { dot: 10, fontSize: 12 },
  lg: { dot: 12, fontSize: 13 },
};

export function OnlineStatusIndicator({
  isOnline,
  statusText,
  size = 'md',
  dotOnly = false,
  className = '',
}: OnlineStatusIndicatorProps) {
  const { dot: dotSize, fontSize } = sizeMap[size];
  
  const dotColor = isOnline ? '#22c55e' : '#6b7280'; // green-500 : gray-500
  const textColor = isOnline ? '#22c55e' : 'rgba(148, 163, 184, 0.8)';
  
  return (
    <div
      className={className}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: dotOnly ? 0 : 6,
      }}
    >
      {/* Status dot */}
      <div
        style={{
          width: dotSize,
          height: dotSize,
          borderRadius: '50%',
          backgroundColor: dotColor,
          flexShrink: 0,
          boxShadow: isOnline ? `0 0 ${dotSize / 2}px ${dotColor}` : 'none',
          transition: 'all 0.3s ease',
        }}
      />
      
      {/* Status text */}
      {!dotOnly && statusText && (
        <span
          style={{
            fontSize,
            color: textColor,
            fontWeight: isOnline ? 500 : 400,
            whiteSpace: 'nowrap',
          }}
        >
          {statusText}
        </span>
      )}
    </div>
  );
}

/**
 * Avatar with online status badge
 * Wraps an avatar with an online indicator dot positioned at bottom-right
 */
export interface AvatarWithStatusProps {
  /** Avatar content (image or initials) */
  children: React.ReactNode;
  /** Whether the user is online */
  isOnline: boolean;
  /** Size of the avatar container */
  size?: number;
  /** Size of the status dot */
  dotSize?: 'sm' | 'md' | 'lg';
}

export function AvatarWithStatus({
  children,
  isOnline,
  size = 48,
  dotSize = 'sm',
}: AvatarWithStatusProps) {
  const { dot } = sizeMap[dotSize];
  const dotColor = isOnline ? '#22c55e' : '#6b7280';
  
  return (
    <div
      style={{
        position: 'relative',
        width: size,
        height: size,
        flexShrink: 0,
      }}
    >
      {children}
      
      {/* Status dot badge */}
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          right: 0,
          width: dot + 4,
          height: dot + 4,
          borderRadius: '50%',
          backgroundColor: '#0a0a0f', // background color for border effect
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div
          style={{
            width: dot,
            height: dot,
            borderRadius: '50%',
            backgroundColor: dotColor,
            boxShadow: isOnline ? `0 0 ${dot / 2}px ${dotColor}` : 'none',
          }}
        />
      </div>
    </div>
  );
}

export default OnlineStatusIndicator;
