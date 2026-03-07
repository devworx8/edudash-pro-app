import type { CallState, DailyParticipant } from './types';

export const formatCallDuration = (seconds: number): string => {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

export const getParticipantVideoTrack = (participant?: DailyParticipant | null): any =>
  participant?.tracks?.video?.persistentTrack || participant?.tracks?.video?.track || null;

export const getParticipantAudioTrack = (participant?: DailyParticipant | null): any =>
  participant?.tracks?.audio?.persistentTrack || participant?.tracks?.audio?.track || null;

export const getParticipantScreenTrack = (participant?: DailyParticipant | null): any =>
  participant?.tracks?.screenVideo?.persistentTrack || participant?.tracks?.screenVideo?.track || null;

interface ResolveMainVideoTrackParams {
  screenSharingParticipant: DailyParticipant | undefined;
  preferLocalView: boolean;
  hasLocalVideo: boolean;
  hasRemoteVideo: boolean;
  localVideoTrack: any;
  remoteParticipants: DailyParticipant[];
  showLocalInMainView: boolean;
}

export const resolveMainVideoTrack = ({
  screenSharingParticipant,
  preferLocalView,
  hasLocalVideo,
  hasRemoteVideo,
  localVideoTrack,
  remoteParticipants,
  showLocalInMainView,
}: ResolveMainVideoTrackParams): any => {
  if (screenSharingParticipant) {
    return getParticipantScreenTrack(screenSharingParticipant);
  }
  if (preferLocalView && hasLocalVideo && hasRemoteVideo) {
    return localVideoTrack;
  }
  if (hasRemoteVideo) {
    return getParticipantVideoTrack(remoteParticipants[0]);
  }
  if (showLocalInMainView) {
    return localVideoTrack;
  }
  return null;
};

interface LogRenderDecisionParams {
  hasRemoteVideo: boolean;
  hasLocalVideo: boolean;
  hasRemoteParticipant: boolean;
  showLocalInMainView: boolean;
  isVideoEnabled: boolean;
  screenSharing: boolean;
  dailyMediaViewAvailable: boolean;
  localParticipant: DailyParticipant | null;
  localVideoTrack: any;
  remoteParticipants: DailyParticipant[];
}

export const logRenderDecision = ({
  hasRemoteVideo,
  hasLocalVideo,
  hasRemoteParticipant,
  showLocalInMainView,
  isVideoEnabled,
  screenSharing,
  dailyMediaViewAvailable,
  localParticipant,
  localVideoTrack,
  remoteParticipants,
}: LogRenderDecisionParams): void => {
  console.log('[VideoCall] Render decision:', {
    hasRemoteVideo,
    hasLocalVideo,
    hasRemoteParticipant,
    showLocalInMainView,
    isVideoEnabled,
    screenSharing,
    DailyMediaViewAvailable: dailyMediaViewAvailable,
    localParticipantExists: !!localParticipant,
    localVideoState: localParticipant?.tracks?.video?.state,
    localHasPersistentTrack: !!localParticipant?.tracks?.video?.persistentTrack,
    localHasTrack: !!localParticipant?.tracks?.video?.track,
    localVideoTrackExists: !!localVideoTrack,
    remoteParticipantsCount: remoteParticipants.length,
    remoteVideoState: remoteParticipants[0]?.tracks?.video?.state,
  });
};

export const getNoVideoStatus = (callState: CallState, remoteParticipantCount: number): string => {
  if (callState === 'connecting') return 'Connecting...';
  if (callState === 'ringing') return 'Ringing...';
  if (remoteParticipantCount === 0) return 'Waiting for participant...';
  return 'Camera off';
};
