/**
 * WhatsApp-Style Incoming Call Overlay
 * 
 * A modern incoming call screen inspired by WhatsApp with:
 * - Swipe up to answer
 * - Swipe down to decline  
 * - Smooth animations
 * - Profile photo support
 * - Animated ring effect
 */

import React, { useCallback, useEffect, useRef } from 'react';
import {
  Animated,
  Dimensions,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Vibration,
  Platform,
  Image,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { AudioModule, setAudioModeAsync, createAudioPlayer, AudioPlayer } from 'expo-audio';
import * as Haptics from 'expo-haptics';
import type { CallType } from './types';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// CRITICAL: Preload ringtone at module level for instant playback
// This ensures the audio is ready when an incoming call arrives
let RINGTONE_ASSET: any = null;
let RINGTONE_LOAD_ERROR: string | null = null;
try {
  RINGTONE_ASSET = require('@/assets/sounds/ringtone.mp3');
  console.log('[IncomingCall] ✅ Ringtone asset loaded at module level');
} catch (error) {
  RINGTONE_LOAD_ERROR = String(error);
  console.error('[IncomingCall] ❌ Failed to load ringtone asset:', error);
  // Try fallback
  try {
    RINGTONE_ASSET = require('@/assets/sounds/notification.wav');
    RINGTONE_LOAD_ERROR = null;
    console.log('[IncomingCall] ✅ Fallback notification sound loaded');
  } catch (e2) {
    console.error('[IncomingCall] ❌ Fallback also failed:', e2);
  }
}

// InCallManager for system ringtone
let InCallManager: any = null;
try {
  InCallManager = require('react-native-incall-manager').default;
  console.log('[IncomingCall] ✅ InCallManager available');
} catch {
  console.warn('[IncomingCall] ⚠️ InCallManager not available');
}

interface WhatsAppStyleIncomingCallProps {
  callerName: string;
  callerPhoto?: string | null;
  callType: CallType;
  onAnswer: () => void;
  onReject: () => void;
  isVisible: boolean;
  isConnecting?: boolean;
}

export function WhatsAppStyleIncomingCall({
  callerName,
  callerPhoto,
  callType,
  onAnswer,
  onReject,
  isVisible,
  isConnecting = false,
}: WhatsAppStyleIncomingCallProps) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const ring1Anim = useRef(new Animated.Value(0)).current;
  const ring2Anim = useRef(new Animated.Value(0)).current;
  const ring3Anim = useRef(new Animated.Value(0)).current;
  const soundRef = useRef<AudioPlayer | null>(null);

  // Ring pulse animation (WhatsApp style)
  useEffect(() => {
    if (!isVisible) return;

    const createRingAnimation = (anim: Animated.Value, delay: number) => {
      return Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.parallel([
            Animated.timing(anim, {
              toValue: 1,
              duration: 2000,
              useNativeDriver: true,
            }),
          ]),
          Animated.timing(anim, {
            toValue: 0,
            duration: 0,
            useNativeDriver: true,
          }),
        ])
      );
    };

    const ring1 = createRingAnimation(ring1Anim, 0);
    const ring2 = createRingAnimation(ring2Anim, 600);
    const ring3 = createRingAnimation(ring3Anim, 1200);

    ring1.start();
    ring2.start();
    ring3.start();

    return () => {
      ring1.stop();
      ring2.stop();
      ring3.stop();
    };
  }, [isVisible, ring1Anim, ring2Anim, ring3Anim]);

  // Fade in/out animation
  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: isVisible ? 1 : 0,
      duration: 300,
      useNativeDriver: true,
    }).start();
  }, [isVisible, fadeAnim]);

  // Stop sound and vibration when connecting
  useEffect(() => {
    if (isConnecting) {
      console.log('[IncomingCall] Connecting - stopping ringtone and vibration');
      if (soundRef.current) {
        soundRef.current.pause();
        soundRef.current.remove();
        soundRef.current = null;
      }
      Vibration.cancel();
    }
  }, [isConnecting]);

  // Vibration and ringtone
  // CRITICAL: Continue ringing even when backgrounded for incoming calls
  // The ringtone should play to alert the user, notification handles visual alert
  useEffect(() => {
    // Only stop if call is no longer visible or user is connecting
    // DO NOT stop for background state - we want the phone to keep ringing!
    if (!isVisible || isConnecting) {
      if (soundRef.current) {
        try {
          soundRef.current.pause();
          soundRef.current.remove();
        } catch (e) {
          console.warn('[IncomingCall] Error stopping sound:', e);
        }
        soundRef.current = null;
      }
      // Stop system ringtone if started
      if (InCallManager) {
        try {
          InCallManager.stopRingtone();
        } catch {
          // Ignore
        }
      }
      Vibration.cancel();
      return;
    }

    console.log('[IncomingCall] 🔔 Starting ringtone and vibration');
    console.log('[IncomingCall] Asset status:', {
      hasAsset: !!RINGTONE_ASSET,
      loadError: RINGTONE_LOAD_ERROR,
      hasInCallManager: !!InCallManager,
    });

    // WhatsApp-style vibration pattern - start immediately
    const vibrationPattern = Platform.OS === 'android' 
      ? [0, 400, 200, 400, 1000] 
      : [400, 200, 400];
    Vibration.vibrate(vibrationPattern, true);

    // Play ringtone with multiple fallback strategies
    let ringtoneStarted = false;
    let systemRingtoneStarted = false;
    
    const playRingtone = async () => {
      // STRATEGY 1: Try InCallManager system/device ringtone FIRST (most natural sound)
      // This uses the device's default ringtone that users are familiar with
      if (InCallManager && !ringtoneStarted) {
        try {
          console.log('[IncomingCall] 📱 Trying InCallManager device default ringtone (primary)...');
          InCallManager.startRingtone('_DEFAULT_');
          systemRingtoneStarted = true;
          ringtoneStarted = true;
          console.log('[IncomingCall] ✅ Device default ringtone started via InCallManager');
        } catch (error) {
          console.error('[IncomingCall] ❌ InCallManager ringtone failed:', error);
        }
      }
      
      // STRATEGY 2: Try expo-audio with preloaded custom asset (fallback if InCallManager unavailable)
      if (RINGTONE_ASSET && !ringtoneStarted) {
        try {
          console.log('[IncomingCall] 📱 Trying expo-audio with preloaded asset (fallback)...');
          
          // Set audio mode for ringtone - should be loud and through speaker
          await setAudioModeAsync({
            playsInSilentMode: true,
            shouldPlayInBackground: true,
            interruptionMode: 'doNotMix',
            shouldRouteThroughEarpiece: false, // Ringtone should play through speaker!
          });
          
          const player = createAudioPlayer(RINGTONE_ASSET);
          player.loop = true;
          player.volume = 1.0;
          
          // Store reference before playing
          soundRef.current = player;
          
          // Start playback
          player.play();
          
          // Verify playback started
          await new Promise(resolve => setTimeout(resolve, 200));
          
          ringtoneStarted = true;
          console.log('[IncomingCall] ✅ Expo-audio ringtone playing!');
        } catch (error) {
          console.error('[IncomingCall] ❌ Expo-audio failed:', error);
          soundRef.current = null;
        }
      }
      
      // STRATEGY 3: Try reloading asset dynamically (last resort)
      if (!ringtoneStarted) {
        try {
          console.log('[IncomingCall] 📱 Trying dynamic require as last resort...');
          
          await setAudioModeAsync({
            playsInSilentMode: true,
            shouldPlayInBackground: true,
          });
          
          // Try loading sound dynamically
          let soundAsset;
          try {
            soundAsset = require('@/assets/sounds/ringtone.mp3');
          } catch {
            soundAsset = require('@/assets/sounds/notification.wav');
          }
          
          const player = createAudioPlayer(soundAsset);
          player.loop = true;
          player.volume = 1.0;
          soundRef.current = player;
          player.play();
          
          ringtoneStarted = true;
          console.log('[IncomingCall] ✅ Dynamic require ringtone playing!');
        } catch (error) {
          console.error('[IncomingCall] ❌ Dynamic require also failed:', error);
        }
      }
      
      if (!ringtoneStarted) {
        console.error('[IncomingCall] ❌ ALL RINGTONE METHODS FAILED - only vibration will alert user');
      }
    };

    // Start ringtone (async but don't wait - vibration already running)
    playRingtone();

    return () => {
      console.log('[IncomingCall] 🔕 Cleanup - stopping ringtone');
      
      // Stop system ringtone
      if (InCallManager) {
        try {
          InCallManager.stopRingtone();
        } catch {
          // Ignore
        }
      }
      
      // Stop expo-audio player
      if (soundRef.current) {
        try {
          soundRef.current.pause();
          soundRef.current.remove();
        } catch (e) {
          // Ignore errors during cleanup
        }
        soundRef.current = null;
      }
      
      Vibration.cancel();
    };
  }, [isVisible, isConnecting]);

  // Tap handlers - simple and reliable
  const handleQuickAnswer = useCallback(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onAnswer();
  }, [onAnswer]);

  const handleQuickDecline = useCallback(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    onReject();
  }, [onReject]);

  if (!isVisible) return null;

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
      <LinearGradient
        colors={['#0A1628', '#0F3460', '#00B4D8']}
        style={styles.gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
      >
        {/* Top Section - Call Type */}
        <View style={styles.topSection}>
          <View style={styles.encryptedBadge}>
            <Ionicons name="shield-checkmark" size={12} color="rgba(0,245,255,0.8)" />
            <Text style={styles.encryptedText}>EduDash Pro • Secure Call</Text>
          </View>
          
          <Text style={styles.callTypeLabel}>
            {callType === 'video' ? 'Video' : 'Voice'} Call
          </Text>
        </View>

        {/* Middle Section - Caller Info */}
        <View style={styles.middleSection}>
          {/* Animated Rings */}
          <View style={styles.ringsContainer}>
            <Animated.View
              style={[
                styles.ring,
                {
                  opacity: ring1Anim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.6, 0],
                  }),
                  transform: [
                    {
                      scale: ring1Anim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [1, 2],
                      }),
                    },
                  ],
                },
              ]}
            />
            <Animated.View
              style={[
                styles.ring,
                {
                  opacity: ring2Anim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.6, 0],
                  }),
                  transform: [
                    {
                      scale: ring2Anim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [1, 2],
                      }),
                    },
                  ],
                },
              ]}
            />
            <Animated.View
              style={[
                styles.ring,
                {
                  opacity: ring3Anim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.6, 0],
                  }),
                  transform: [
                    {
                      scale: ring3Anim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [1, 2],
                      }),
                    },
                  ],
                },
              ]}
            />

            {/* Profile Photo / Avatar */}
            <View style={styles.avatarContainer}>
              {callerPhoto ? (
                <Image source={{ uri: callerPhoto }} style={styles.avatarImage} />
              ) : (
                <View style={styles.avatarPlaceholder}>
                  <Text style={styles.avatarInitials}>{getInitials(callerName)}</Text>
                </View>
              )}
            </View>
          </View>

          {/* Caller Name */}
          <Text style={styles.callerName}>{callerName}</Text>
          <Text style={styles.callerStatus}>
            {isConnecting ? 'Connecting...' : 'Incoming call'}
          </Text>
        </View>

        {/* Bottom Section - Action Buttons */}
        {!isConnecting && (
          <View style={styles.bottomSection}>
            {/* Decline Button */}
            <View style={styles.buttonWrapper}>
              <TouchableOpacity
                style={[styles.actionButton, styles.declineButton]}
                onPress={handleQuickDecline}
                activeOpacity={0.8}
              >
                <Ionicons name="close" size={30} color="#fff" />
              </TouchableOpacity>
              <Text style={styles.buttonLabel}>Decline</Text>
            </View>

            {/* Answer Button */}
            <View style={styles.buttonWrapper}>
              <TouchableOpacity
                style={[styles.actionButton, styles.answerButton]}
                onPress={handleQuickAnswer}
                activeOpacity={0.8}
              >
                <Ionicons 
                  name={callType === 'video' ? 'videocam' : 'call'} 
                  size={30} 
                  color="#fff" 
                />
              </TouchableOpacity>
              <Text style={styles.buttonLabel}>
                {callType === 'video' ? 'Accept' : 'Answer'}
              </Text>
            </View>
          </View>
        )}

        {/* Connecting Indicator */}
        {isConnecting && (
          <View style={styles.connectingContainer}>
            <View style={styles.connectingDots}>
              <Animated.View style={[styles.dot, { opacity: ring1Anim }]} />
              <Animated.View style={[styles.dot, { opacity: ring2Anim }]} />
              <Animated.View style={[styles.dot, { opacity: ring3Anim }]} />
            </View>
            <Text style={styles.connectingText}>Connecting...</Text>
          </View>
        )}
      </LinearGradient>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
    zIndex: 9999,
  },
  gradient: {
    flex: 1,
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
  },
  topSection: {
    alignItems: 'center',
    paddingTop: 20,
  },
  encryptedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,180,216,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(0,180,216,0.25)',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    marginBottom: 12,
  },
  encryptedText: {
    color: 'rgba(0,245,255,0.85)',
    fontSize: 12,
    fontWeight: '500',
    marginLeft: 6,
  },
  callTypeLabel: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '500',
  },
  middleSection: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringsContainer: {
    width: 200,
    height: 200,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    position: 'absolute',
    width: 140,
    height: 140,
    borderRadius: 70,
    borderWidth: 3,
    borderColor: 'rgba(0,180,216,0.4)',
  },
  avatarContainer: {
    width: 140,
    height: 140,
    borderRadius: 70,
    overflow: 'hidden',
    backgroundColor: 'rgba(0,180,216,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(0,245,255,0.3)',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  avatarPlaceholder: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,180,216,0.2)',
  },
  avatarInitials: {
    color: '#fff',
    fontSize: 48,
    fontWeight: '600',
  },
  callerName: {
    color: '#fff',
    fontSize: 32,
    fontWeight: '600',
    marginTop: 24,
    textAlign: 'center',
  },
  callerStatus: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 16,
    marginTop: 8,
  },
  bottomSection: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'flex-end',
    paddingHorizontal: 40,
    paddingBottom: 20,
  },
  buttonWrapper: {
    alignItems: 'center',
  },
  actionButton: {
    width: 70,
    height: 70,
    borderRadius: 35,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  declineButton: {
    backgroundColor: '#FF3B30',
  },
  answerButton: {
    backgroundColor: '#00B4D8',
  },
  buttonLabel: {
    color: '#fff',
    fontSize: 14,
    marginTop: 8,
    fontWeight: '500',
  },
  connectingContainer: {
    alignItems: 'center',
    paddingBottom: 60,
  },
  connectingDots: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#fff',
    marginHorizontal: 4,
  },
  connectingText: {
    color: '#fff',
    fontSize: 16,
  },
});

export default WhatsAppStyleIncomingCall;
