# Archived Daily.co Custom Implementations

## Overview

This folder contains the original custom Daily.co implementations that were used before the Daily Prebuilt integration.

## Files Archived

- **ClassLessonCall.tsx** - Custom video call UI with participant grid, chat, hand raise, and teacher controls
- **DailyCallInterface.tsx** - 1-on-1 call interface for voice and video calls
- **GroupCallProvider.tsx** - React context provider for managing Daily.co call state

## Archival Date

These components were archived on 2025-11-29 in favor of Daily Prebuilt iframe integration.

## Reason for Archival

The Daily Prebuilt integration was chosen to provide:
- Simplified maintenance with Daily's managed UI components
- Consistent updates from Daily.co with new features
- Better cross-browser and mobile compatibility
- Reduced bundle size and complexity

## Restoration

If Daily Prebuilt doesn't meet EduDash Pro standards, these components can be restored:

1. Copy files back to the parent `calls/` directory
2. Update `index.ts` to export these components instead of the Prebuilt versions
3. Remove the `_archived/` folder or keep for reference

## Original Features

### ClassLessonCall.tsx
- Grid/speaker view modes
- Screen sharing
- Real-time chat via Supabase broadcast
- Hand raise feature
- Recording controls (teacher only)
- Participant management (mute, remove)
- Mobile responsive design

### DailyCallInterface.tsx
- Voice and video call support
- Picture-in-picture (PiP) video
- Network quality monitoring
- Auto-reconnection on network issues
- Call timeout handling
- Minimized view

### GroupCallProvider.tsx
- Centralized call state management
- Room creation via API
- Token-based authentication
- Participant tracking
- Audio/video/screen share controls
- Recording controls
