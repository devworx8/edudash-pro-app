/**
 * Voice Capability Preflight Module
 * 
 * Smart routing for voice UI based on:
 * - Language (indigenous SA languages always use recording)
 * - Native dependencies availability (Picovoice, react-native-webrtc)
 * - Subscription tier (streaming gated to premium)
 * - Device capabilities
 * 
 * Prevents native module errors by safely checking availability before use.
 */

import { Platform, NativeModules } from 'react-native';

export interface VoiceCapabilities {
  language: string;
  isIndigenousSA: boolean;
  recordingAvailable: boolean;
  streamingAvailable: boolean;
  streamingReasons: string[];
  preferred: 'recording' | 'streaming';
  hasPicovoice: boolean;
  hasWebRTC: boolean;
  isPremium: boolean;
}

interface CapabilityOptions {
  language?: string;
  tier?: string;
}

// Capability cache to avoid flicker
interface CacheEntry {
  capabilities: VoiceCapabilities;
  timestamp: number;
}

const capabilityCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 30000; // 30 seconds

/**
 * Check if language code is an indigenous South African language
 * (Zulu, Xhosa, Northern Sotho)
 */
export function isIndigenousSA(languageCode?: string): boolean {
  if (!languageCode) return false;
  const lowerCode = String(languageCode).toLowerCase();
  return (
    lowerCode.startsWith('zu') || // Zulu (zu, zu-ZA)
    lowerCode.startsWith('xh') || // Xhosa (xh, xh-ZA)
    lowerCode.startsWith('nso') || // Northern Sotho (nso, nso-ZA)
    lowerCode.startsWith('st') || // Sotho variant
    lowerCode === 'zu' ||
    lowerCode === 'xh' ||
    lowerCode === 'nso'
  );
}

/**
 * Safely check if Picovoice Voice Processor is available
 * Returns false if module missing or instance unavailable
 */
function checkPicovoiceAvailability(): boolean {
  try {
    // Check if NativeModules has any Picovoice reference
    const hasPicoNativeModule = !!NativeModules.PvAudio || !!NativeModules.VoiceProcessor;
    
    if (!hasPicoNativeModule) {
      // Silently return false - this is expected on most devices
      return false;
    }

    // Try to dynamically require the module
    try {
      const picoModule = require('@picovoice/react-native-voice-processor');
      
      // Check if VoiceProcessor class exists
      if (!picoModule || !picoModule.VoiceProcessor) {
        return false;
      }

      // Check if instance is accessible
      const instance = picoModule.VoiceProcessor.instance;
      if (!instance) {
        return false;
      }

      // Validate required methods exist
      const hasRequiredMethods = 
        typeof instance.start === 'function' &&
        typeof instance.stop === 'function' &&
        typeof instance.addFrameListener === 'function';

      if (!hasRequiredMethods) {
        return false;
      }

      if (__DEV__) console.log('[Capabilities] ✅ Picovoice is available and functional');
      return true;
    } catch (requireError) {
      // Silently handle - module not installed is expected
      return false;
    }
  } catch (error) {
    return false;
  }
}

/**
 * Safely check if react-native-webrtc is available
 * Returns false if module missing or mediaDevices unavailable
 */
function checkWebRTCAvailability(): boolean {
  // Suppress console errors during require by temporarily overriding console.error
  const originalError = console.error;
  try {
    // Temporarily silence console.error for the require call
    console.error = () => {};
    
    // Try to require the module
    const webrtcModule = require('react-native-webrtc');
    
    // Restore console.error
    console.error = originalError;
    
    // Check if mediaDevices exists
    if (!webrtcModule || !webrtcModule.mediaDevices) {
      return false;
    }

    // Check if getUserMedia exists
    if (typeof webrtcModule.mediaDevices.getUserMedia !== 'function') {
      return false;
    }

    if (__DEV__) console.log('[Capabilities] ✅ WebRTC is available and functional');
    return true;
  } catch (requireError: any) {
    // Restore console.error in case of exception
    console.error = originalError;
    // Silently handle - module not installed is expected on most setups
    return false;
  }
}

/**
 * Check if user has premium tier for streaming features
 */
function checkPremiumTier(tier?: string): boolean {
  if (!tier) return false;
  const lowerTier = String(tier).toLowerCase();
  const premiumTiers = ['premium', 'pro', 'enterprise'];
  const isPremium = premiumTiers.includes(lowerTier);
  if (__DEV__) console.log('[Capabilities] Tier check:', { tier, isPremium });
  return isPremium;
}

/**
 * Get voice capabilities with caching
 */
export async function getVoiceCapabilities(opts: CapabilityOptions = {}): Promise<VoiceCapabilities> {
  const { language = 'en', tier = 'free' } = opts;
  
  // Check cache
  const cacheKey = `${language}_${tier}`;
  const cached = capabilityCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    if (__DEV__) console.log('[Capabilities] Using cached result');
    return cached.capabilities;
  }

  // Compute capabilities
  const isIndigenous = isIndigenousSA(language);
  const hasPicovoice = Platform.OS !== 'web' && checkPicovoiceAvailability();
  const hasWebRTC = Platform.OS === 'web'
    ? (typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia)
    : checkWebRTCAvailability();
  const isPremium = checkPremiumTier(tier);

  const streamingReasons: string[] = [];
  let streamingAvailable = false;

  // Indigenous SA languages NEVER use streaming (OpenAI doesn't support them)
  if (isIndigenous) {
    streamingReasons.push('Indigenous SA language requires Azure Speech (recording modal)');
  } else {
    // Check if streaming is possible for non-indigenous languages
    if (!hasPicovoice && !hasWebRTC) {
      streamingReasons.push('No native audio dependencies (Picovoice/WebRTC) detected');
    }
    
    if (!isPremium) {
      streamingReasons.push('Premium subscription required for OpenAI Realtime streaming');
    }

    // Streaming available if has deps AND is premium
    streamingAvailable = (hasPicovoice || hasWebRTC) && isPremium && !isIndigenous;
  }

  const capabilities: VoiceCapabilities = {
    language,
    isIndigenousSA: isIndigenous,
    recordingAvailable: true, // Available when expo-speech-recognition is supported
    streamingAvailable,
    streamingReasons,
    preferred: isIndigenous ? 'recording' : (streamingAvailable ? 'streaming' : 'recording'),
    hasPicovoice,
    hasWebRTC,
    isPremium,
  };

  // Cache result
  capabilityCache.set(cacheKey, { capabilities, timestamp: Date.now() });

  if (__DEV__) {
    console.log('[Capabilities] Computed:', {
      language,
      preferred: capabilities.preferred,
      streaming: streamingAvailable,
      reasons: streamingReasons,
    });
  }

  return capabilities;
}

/**
 * Clear capability cache (useful for testing or after tier/dep changes)
 */
export function clearCapabilityCache(): void {
  capabilityCache.clear();
  if (__DEV__) console.log('[Capabilities] Cache cleared');
}
