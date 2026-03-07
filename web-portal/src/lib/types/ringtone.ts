// ================================================
// Ringtone Settings Types
// Types for managing call ringtones and ringback tones
// ================================================

export type RingtoneType = 'default' | 'default_chime' | 'default_old' | 'custom' | 'device';

export interface RingtonePreferences {
  // Incoming call ringtone (what callee hears)
  incomingRingtone: RingtoneType;
  incomingCustomUrl?: string;
  incomingVolume: number; // 0.0 to 1.0
  
  // Outgoing call ringback (what caller hears while waiting)
  outgoingRingback: RingtoneType;
  outgoingCustomUrl?: string;
  outgoingVolume: number; // 0.0 to 1.0
  
  // Vibration preferences
  vibrateOnIncoming: boolean;
  vibrateOnOutgoing: boolean;
  
  updatedAt: string;
}

export interface RingtoneOption {
  type: RingtoneType;
  label: string;
  description: string;
  url?: string; // For built-in ringtones
  icon: string;
}

// Default ringtone options
export const RINGTONE_OPTIONS: RingtoneOption[] = [
  {
    type: 'default',
    label: 'Default Ring',
    description: 'Classic phone ring',
    url: '/sounds/ringback.mp3',
    icon: 'phone',
  },
  {
    type: 'default_old',
    label: 'Classic Ring',
    description: 'Traditional phone ring',
    url: '/sounds/ringback_old.mp3',
    icon: 'phone-classic',
  },
  {
    type: 'default_chime',
    label: 'Chime',
    description: 'Soft chime tone',
    url: '/sounds/ringback_chime.mp3',
    icon: 'bell',
  },
  {
    type: 'custom',
    label: 'Custom Sound',
    description: 'Upload your own ringtone',
    icon: 'upload',
  },
  {
    type: 'device',
    label: 'Device Ringtone',
    description: 'Use your device\'s default ringtone',
    icon: 'smartphone',
  },
];

export const DEFAULT_RINGTONE_PREFERENCES: RingtonePreferences = {
  incomingRingtone: 'default_old',
  incomingVolume: 1.0,
  outgoingRingback: 'default',
  outgoingVolume: 0.8,
  vibrateOnIncoming: true,
  vibrateOnOutgoing: false,
  updatedAt: new Date().toISOString(),
};

// Helper to get URL for a ringtone type
export function getRingtoneUrl(type: RingtoneType, customUrl?: string): string | null {
  if (type === 'custom' && customUrl) {
    return customUrl;
  }
  
  const option = RINGTONE_OPTIONS.find(opt => opt.type === type);
  return option?.url || null;
}
