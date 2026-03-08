import React from 'react';
import {
  Animated,
  Image,
  StatusBar,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import type { CallState, DailyParticipant } from './types';
import { LOCAL_VIDEO_HEIGHT, LOCAL_VIDEO_WIDTH } from './WhatsAppStyleVideoCall.constants';
import { styles } from './WhatsAppStyleVideoCall.styles';
import {
  getNoVideoStatus,
  getParticipantAudioTrack,
  getParticipantVideoTrack,
} from './WhatsAppStyleVideoCall.helpers';

interface WhatsAppStyleVideoCallPresentationProps {
  isMinimized: boolean;
  minimizedPosition: Animated.ValueXY;
  localVideoPosition: Animated.ValueXY;
  localVideoPanHandlers: any;
  fadeAnim: Animated.Value;
  controlsAnim: Animated.Value;
  insetsTop: number;
  insetsBottom: number;
  DailyMediaView: any;
  remoteParticipants: DailyParticipant[];
  localParticipant: DailyParticipant | null;
  screenSharingParticipant?: DailyParticipant;
  remoteUserName: string;
  remoteUserPhoto?: string | null;
  callState: CallState;
  callDuration: number;
  error: string | null;
  isOwner: boolean;
  isRecording: boolean;
  isSpeakerOn: boolean;
  isScreenSharing: boolean;
  isVideoEnabled: boolean;
  isAudioEnabled: boolean;
  isFrontCamera: boolean;
  hasRemoteVideo: boolean;
  hasLocalVideo: boolean;
  showLocalInMainView: boolean;
  isShowingLocalInMain: boolean;
  getMainVideoTrack: () => any;
  formatDuration: (seconds: number) => string;
  onExpandFromMinimized: () => void;
  onScreenTap: () => void;
  onEndCall: () => void;
  onMinimize: () => void;
  onFlipCamera: () => void;
  onToggleSpeaker: () => void;
  onToggleScreenShare: () => void;
  onToggleViewPreference: () => void;
  onToggleRecording: () => void;
  onShowAddParticipants: () => void;
  onToggleVideo: () => void;
  onToggleAudio: () => void;
}

export function WhatsAppStyleVideoCallPresentation({
  isMinimized,
  minimizedPosition,
  localVideoPosition,
  localVideoPanHandlers,
  fadeAnim,
  controlsAnim,
  insetsTop,
  insetsBottom,
  DailyMediaView,
  remoteParticipants,
  localParticipant,
  screenSharingParticipant,
  remoteUserName,
  remoteUserPhoto,
  callState,
  callDuration,
  error,
  isOwner,
  isRecording,
  isSpeakerOn,
  isScreenSharing,
  isVideoEnabled,
  isAudioEnabled,
  isFrontCamera,
  hasRemoteVideo,
  hasLocalVideo,
  showLocalInMainView,
  isShowingLocalInMain,
  getMainVideoTrack,
  formatDuration,
  onExpandFromMinimized,
  onScreenTap,
  onEndCall,
  onMinimize,
  onFlipCamera,
  onToggleSpeaker,
  onToggleScreenShare,
  onToggleViewPreference,
  onToggleRecording,
  onShowAddParticipants,
  onToggleVideo,
  onToggleAudio,
}: WhatsAppStyleVideoCallPresentationProps) {
  if (isMinimized) {
    return (
      <Animated.View
        style={[
          styles.minimizedContainer,
          {
            transform: minimizedPosition.getTranslateTransform(),
          },
        ]}
      >
        <TouchableOpacity
          activeOpacity={0.9}
          onPress={onExpandFromMinimized}
          style={styles.minimizedContent}
        >
          {hasRemoteVideo && DailyMediaView ? (
            <DailyMediaView
              videoTrack={getParticipantVideoTrack(remoteParticipants[0])}
              audioTrack={getParticipantAudioTrack(remoteParticipants[0])}
              style={styles.minimizedVideo}
              objectFit="cover"
            />
          ) : (
            <View style={styles.minimizedPlaceholder}>
              <Ionicons name="videocam" size={24} color="#fff" />
            </View>
          )}
          <View style={styles.minimizedOverlay}>
            <Text style={styles.minimizedDuration}>{formatDuration(callDuration)}</Text>
          </View>
        </TouchableOpacity>
        <TouchableOpacity style={styles.minimizedEndButton} onPress={onEndCall}>
          <Ionicons name="call" size={16} color="#fff" />
        </TouchableOpacity>
      </Animated.View>
    );
  }

  return (
    <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
      <StatusBar barStyle="light-content" backgroundColor="#000" />

      <TouchableOpacity
        activeOpacity={1}
        onPress={onScreenTap}
        style={styles.mainVideoContainer}
      >
        {(screenSharingParticipant || hasRemoteVideo || showLocalInMainView) && DailyMediaView ? (
          <DailyMediaView
            videoTrack={getMainVideoTrack()}
            audioTrack={getParticipantAudioTrack(remoteParticipants[0])}
            style={styles.mainVideo}
            objectFit={screenSharingParticipant ? 'contain' : 'cover'}
            mirror={showLocalInMainView && !screenSharingParticipant ? isFrontCamera : false}
          />
        ) : (
          <LinearGradient
            colors={['#1a1a2e', '#16213e', '#0f3460']}
            style={styles.noVideoContainer}
          >
            {remoteUserPhoto ? (
              <Image source={{ uri: remoteUserPhoto }} style={styles.noVideoAvatar} />
            ) : (
              <View style={styles.noVideoAvatarPlaceholder}>
                <Ionicons name="person" size={80} color="rgba(255,255,255,0.5)" />
              </View>
            )}
            <Text style={styles.noVideoName}>{remoteUserName}</Text>
            <Text style={styles.noVideoStatus}>{getNoVideoStatus(callState, remoteParticipants.length)}</Text>
          </LinearGradient>
        )}
      </TouchableOpacity>

      {screenSharingParticipant && (
        <View style={styles.screenShareIndicator}>
          <Ionicons name="desktop-outline" size={16} color="#00f5ff" />
          <Text style={styles.screenShareText}>Screen sharing</Text>
        </View>
      )}

      {hasLocalVideo && DailyMediaView ? (
        <Animated.View
          style={[
            styles.localVideoContainer,
            { transform: localVideoPosition.getTranslateTransform() },
          ]}
          {...localVideoPanHandlers}
        >
          <DailyMediaView
            videoTrack={getParticipantVideoTrack(localParticipant)}
            audioTrack={null}
            style={[styles.localVideo, { width: LOCAL_VIDEO_WIDTH - 4, height: LOCAL_VIDEO_HEIGHT - 4 }]}
            objectFit="cover"
            mirror={isFrontCamera}
            zOrder={1}
          />
        </Animated.View>
      ) : (
        callState === 'connected' && !hasLocalVideo && DailyMediaView && (
          <View style={[styles.localVideoContainer, { backgroundColor: '#1a1a2e', justifyContent: 'center', alignItems: 'center' }]}>
            <Ionicons name={isVideoEnabled ? 'videocam' : 'videocam-off'} size={20} color="rgba(255,255,255,0.5)" />
            <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 9, marginTop: 4 }}>
              {isVideoEnabled ? 'Starting...' : 'Camera off'}
            </Text>
          </View>
        )
      )}

      <Animated.View style={[styles.topBar, { opacity: controlsAnim, paddingTop: insetsTop + 8 }]}>
        <TouchableOpacity style={styles.topButton} onPress={onMinimize}>
          <Ionicons name="chevron-down" size={28} color="#fff" />
        </TouchableOpacity>

        <View style={styles.callInfo}>
          <Text style={styles.callerName}>{remoteUserName}</Text>
          <Text style={styles.callDuration}>
            {callState === 'connected' ? formatDuration(callDuration) :
             callState === 'ringing' ? 'Ringing...' :
             callState === 'connecting' ? 'Connecting...' : ''}
          </Text>
        </View>

        <TouchableOpacity style={styles.topButton} onPress={onFlipCamera}>
          <Ionicons name="camera-reverse" size={24} color="#fff" />
        </TouchableOpacity>
      </Animated.View>

      {isRecording && (
        <View style={[styles.recordingIndicator, { top: insetsTop + 60 }]}>
          <View style={styles.recordingDot} />
          <Text style={styles.recordingText}>Recording</Text>
        </View>
      )}

      {error && (
        <View style={[styles.errorContainer, { top: insetsTop + (isRecording ? 100 : 60) }]}>
          <Ionicons name="alert-circle" size={18} color="#fff" />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      <Animated.View style={[styles.bottomControls, { opacity: controlsAnim, paddingBottom: insetsBottom + 16 }]}>
        <View style={styles.secondaryControls}>
          <TouchableOpacity style={styles.secondaryButton} onPress={onToggleSpeaker}>
            <Ionicons name={isSpeakerOn ? 'volume-high' : 'volume-mute'} size={24} color="#fff" />
            <Text style={styles.secondaryLabel}>Speaker</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.secondaryButton} onPress={onFlipCamera}>
            <Ionicons name="camera-reverse" size={24} color="#fff" />
            <Text style={styles.secondaryLabel}>Flip</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.secondaryButton, isScreenSharing && styles.secondaryButtonActive]}
            onPress={onToggleScreenShare}
          >
            <Ionicons
              name={isScreenSharing ? 'stop-circle' : 'share-outline'}
              size={24}
              color={isScreenSharing ? '#ef4444' : '#fff'}
            />
            <Text style={[styles.secondaryLabel, isScreenSharing && { color: '#ef4444' }]}>
              {isScreenSharing ? 'Stop' : 'Share'}
            </Text>
          </TouchableOpacity>

          {hasRemoteVideo && hasLocalVideo && (
            <TouchableOpacity style={styles.secondaryButton} onPress={onToggleViewPreference}>
              <Ionicons
                name={isShowingLocalInMain ? 'person-circle' : 'people-circle'}
                size={24}
                color="#fff"
              />
              <Text style={styles.secondaryLabel}>
                {isShowingLocalInMain ? 'Remote' : 'Local'}
              </Text>
            </TouchableOpacity>
          )}

          {isOwner && (
            <TouchableOpacity
              style={[styles.secondaryButton, isRecording && styles.secondaryButtonActive]}
              onPress={onToggleRecording}
            >
              <Ionicons
                name={isRecording ? 'stop-circle' : 'radio-button-on'}
                size={24}
                color={isRecording ? '#ef4444' : '#fff'}
              />
              <Text style={[styles.secondaryLabel, isRecording && { color: '#ef4444' }]}>
                {isRecording ? 'Stop Rec' : 'Record'}
              </Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity style={styles.secondaryButton} onPress={onShowAddParticipants}>
            <Ionicons name="person-add" size={24} color="#fff" />
            <Text style={styles.secondaryLabel}>Add</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.mainControls}>
          <TouchableOpacity
            style={[styles.controlButton, !isVideoEnabled && styles.controlButtonOff]}
            onPress={onToggleVideo}
          >
            <Ionicons name={isVideoEnabled ? 'videocam' : 'videocam-off'} size={28} color="#fff" />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.controlButton, !isAudioEnabled && styles.controlButtonOff]}
            onPress={onToggleAudio}
          >
            <Ionicons name={isAudioEnabled ? 'mic' : 'mic-off'} size={28} color="#fff" />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.controlButton, styles.endCallButton]}
            onPress={onEndCall}
          >
            <Ionicons name="call" size={32} color="#fff" style={{ transform: [{ rotate: '135deg' }] }} />
          </TouchableOpacity>
        </View>

        {remoteParticipants.length > 0 && (
          <View style={styles.participantCount}>
            <Ionicons name="people" size={16} color="#fff" />
            <Text style={styles.participantCountText}>{remoteParticipants.length + 1}</Text>
          </View>
        )}
      </Animated.View>
    </Animated.View>
  );
}

