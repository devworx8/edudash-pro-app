'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { DailyParticipant } from '@daily-co/daily-js';
import { useGroupCall } from './GroupCallProvider';
import { createClient } from '@/lib/supabase/client';
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  PhoneOff,
  Monitor,
  MonitorOff,
  Users,
  Hand,
  MoreVertical,
  Maximize2,
  Minimize2,
  Settings,
  Circle,
  UserX,
  VolumeX,
  X,
  MessageCircle,
  Send,
} from 'lucide-react';

interface ChatMessage {
  id: string;
  sender: string;
  senderName: string;
  text: string;
  timestamp: number;
}

interface ClassLessonCallProps {
  roomUrl: string;
  lessonTitle: string;
  className?: string;
  teacherName?: string;
  isTeacher?: boolean;
  onLeave?: () => void;
}

export function ClassLessonCall({
  roomUrl,
  lessonTitle,
  className,
  teacherName,
  isTeacher = false,
  onLeave,
}: ClassLessonCallProps) {
  const {
    isInCall,
    isJoining,
    participants,
    localParticipant,
    isMuted,
    isVideoOff,
    isScreenSharing,
    isRecording,
    error,
    joinRoom,
    leaveRoom,
    toggleMute,
    toggleVideo,
    toggleScreenShare,
    startRecording,
    stopRecording,
    muteParticipant,
    removeParticipant,
    muteAll,
  } = useGroupCall();

  const [showParticipants, setShowParticipants] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'speaker'>('grid');
  const [activeSpeaker, setActiveSpeaker] = useState<string | null>(null);
  const [showControls, setShowControls] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showParticipantMenu, setShowParticipantMenu] = useState<string | null>(null);
  const [handRaised, setHandRaised] = useState(false);
  const [raisedHands, setRaisedHands] = useState<Set<string>>(new Set()); // Track all raised hands by session_id
  const [showChat, setShowChat] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [unreadMessages, setUnreadMessages] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const supabase = createClient();

  // Get current user ID for raise hand feature
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  
  useEffect(() => {
    const getUserId = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) setCurrentUserId(user.id);
    };
    getUserId();
  }, [supabase]);

  // Auto-join on mount
  useEffect(() => {
    if (roomUrl && !isInCall && !isJoining) {
      joinRoom(roomUrl);
    }
  }, [roomUrl, isInCall, isJoining, joinRoom]);

  // Get room name from URL for raise hand channel
  const roomName = roomUrl ? roomUrl.split('/').pop() || '' : '';
  
  // Ref to hold the raise hand channel for reuse
  const raiseHandChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  
  // Subscribe to raise hand events via realtime broadcast
  useEffect(() => {
    if (!isInCall || !roomName) return;
    
    const channel = supabase
      .channel(`raise-hand-${roomName}`)
      .on('broadcast', { event: 'hand-raised' }, ({ payload }: { payload: { sessionId: string; userName: string; raised: boolean } }) => {
        const { sessionId, raised } = payload;
        console.log('[ClassLessonCall] Hand raised event:', sessionId, raised);
        setRaisedHands(prev => {
          const updated = new Set(prev);
          if (raised) {
            updated.add(sessionId);
          } else {
            updated.delete(sessionId);
          }
          return updated;
        });
      })
      .subscribe();
    
    raiseHandChannelRef.current = channel;
    
    return () => {
      supabase.removeChannel(channel);
      raiseHandChannelRef.current = null;
    };
  }, [isInCall, roomName, supabase]);
  
  // Toggle raise hand with realtime broadcast
  const toggleRaiseHand = useCallback(async () => {
    if (!localParticipant || !raiseHandChannelRef.current) return;
    
    const newRaised = !handRaised;
    setHandRaised(newRaised);
    
    // Update local raised hands set
    setRaisedHands(prev => {
      const updated = new Set(prev);
      if (newRaised) {
        updated.add(localParticipant.session_id);
      } else {
        updated.delete(localParticipant.session_id);
      }
      return updated;
    });
    
    // Broadcast to other participants using existing channel
    await raiseHandChannelRef.current.send({
      type: 'broadcast',
      event: 'hand-raised',
      payload: {
        sessionId: localParticipant.session_id,
        userName: localParticipant.user_name || 'Participant',
        raised: newRaised,
      },
    });
  }, [localParticipant, handRaised]);

  // Ref to hold the chat channel for reuse
  const chatChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  
  // Ref to track showChat state without triggering re-subscriptions
  const showChatRef = useRef(showChat);
  useEffect(() => {
    showChatRef.current = showChat;
  }, [showChat]);
  
  // Subscribe to chat messages via realtime broadcast
  useEffect(() => {
    if (!isInCall || !roomName) return;
    
    const channel = supabase
      .channel(`chat-${roomName}`)
      .on('broadcast', { event: 'chat-message' }, ({ payload }: { payload: ChatMessage }) => {
        setChatMessages(prev => [...prev, payload]);
        
        // If chat panel is closed, increment unread count
        if (!showChatRef.current) {
          setUnreadMessages(prev => prev + 1);
        }
      })
      .subscribe();
    
    chatChannelRef.current = channel;
    
    return () => {
      supabase.removeChannel(channel);
      chatChannelRef.current = null;
    };
  }, [isInCall, roomName, supabase]);
  
  // Auto-scroll chat to bottom when new messages arrive
  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [chatMessages]);
  
  // Clear unread count when chat is opened
  useEffect(() => {
    if (showChat) {
      setUnreadMessages(0);
    }
  }, [showChat]);
  
  // Generate unique ID (with fallback for older browsers)
  const generateId = () => {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  };
  
  // Send chat message
  const sendChatMessage = useCallback(async () => {
    if (!chatInput.trim() || !localParticipant || !chatChannelRef.current) return;
    
    const message: ChatMessage = {
      id: generateId(),
      sender: localParticipant.session_id,
      senderName: localParticipant.user_name || 'Participant',
      text: chatInput.trim(),
      timestamp: Date.now(),
    };
    
    // Add to local messages immediately
    setChatMessages(prev => [...prev, message]);
    setChatInput('');
    
    // Broadcast to other participants
    await chatChannelRef.current.send({
      type: 'broadcast',
      event: 'chat-message',
      payload: message,
    });
  }, [chatInput, localParticipant]);

  // Handle leave - mark lesson as ended if teacher leaves
  const handleLeave = async () => {
    // If teacher is leaving, mark the video call as ended
    if (isTeacher && roomUrl) {
      try {
        // Update by meeting_url (full URL match)
        const { error: urlError } = await supabase
          .from('video_calls')
          .update({ 
            status: 'ended',
            actual_end: new Date().toISOString()
          })
          .eq('meeting_url', roomUrl);
        
        if (urlError) {
          console.error('Error updating by URL:', urlError);
          // Try updating by meeting_id (room name from URL)
          const meetingId = roomUrl.split('/').pop();
          if (meetingId) {
            await supabase
              .from('video_calls')
              .update({ 
                status: 'ended',
                actual_end: new Date().toISOString()
              })
              .eq('meeting_id', meetingId);
          }
        }
        console.log('[ClassLessonCall] Marked video call as ended');
      } catch (err) {
        console.error('Error updating video call status:', err);
      }
    }
    
    await leaveRoom();
    onLeave?.();
  };

  // Toggle fullscreen
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  // Get participant array sorted (teacher first, then by join time)
  const participantArray = Array.from(participants.values()).sort((a, b) => {
    if (a.owner && !b.owner) return -1;
    if (!a.owner && b.owner) return 1;
    return 0;
  });

  // Find screen sharer
  const screenSharer = participantArray.find(p => p.screen);

  // Render loading state
  if (isJoining) {
    return (
      <div className="fixed inset-0 bg-gray-900 flex flex-col items-center justify-center z-50">
        <div className="w-16 h-16 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-white text-lg">Joining {lessonTitle}...</p>
        {className && <p className="text-gray-400 mt-2">{className}</p>}
      </div>
    );
  }

  // Render error state
  if (error && !isInCall) {
    return (
      <div className="fixed inset-0 bg-gray-900 flex flex-col items-center justify-center z-50">
        <div className="text-red-500 text-6xl mb-4">⚠️</div>
        <p className="text-white text-lg mb-2">Unable to join lesson</p>
        <p className="text-gray-400 mb-6">{error}</p>
        <button
          onClick={() => joinRoom(roomUrl)}
          className="px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors"
        >
          Try Again
        </button>
      </div>
    );
  }

  if (!isInCall) return null;

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 bg-gray-900 flex flex-col z-50"
      onMouseMove={() => setShowControls(true)}
    >
      {/* Header - Mobile responsive */}
      <header className="flex items-center justify-between px-2 sm:px-4 py-2 sm:py-3 bg-gray-800/80 backdrop-blur-sm">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
          {isRecording && (
            <span className="flex items-center gap-1 sm:gap-1.5 px-1.5 sm:px-2 py-0.5 sm:py-1 bg-red-600 rounded text-white text-[10px] sm:text-xs font-medium flex-shrink-0">
              <Circle className="w-2 h-2 sm:w-3 sm:h-3 fill-current animate-pulse" />
              <span className="hidden sm:inline">Recording</span>
              <span className="sm:hidden">REC</span>
            </span>
          )}
          <div className="min-w-0">
            <h1 className="text-white font-semibold text-sm sm:text-base truncate">{lessonTitle}</h1>
            {className && (
              <p className="text-gray-400 text-xs sm:text-sm truncate">
                <span className="sm:hidden">{className}</span>
                <span className="hidden sm:inline">{className} • {teacherName && `Led by ${teacherName}`}</span>
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
          <span className="text-gray-400 text-xs sm:text-sm flex items-center">
            <Users className="w-3 h-3 sm:w-4 sm:h-4 mr-0.5 sm:mr-1" />
            {participants.size}
          </span>
          <button
            onClick={() => setShowParticipants(!showParticipants)}
            className={`p-1.5 sm:p-2 rounded-lg transition-colors ${
              showParticipants ? 'bg-purple-600 text-white' : 'text-gray-400 hover:bg-gray-700'
            }`}
          >
            <Users className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>
          <button
            onClick={toggleFullscreen}
            className="hidden sm:flex p-2 text-gray-400 hover:bg-gray-700 rounded-lg transition-colors"
          >
            {isFullscreen ? <Minimize2 className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />}
          </button>
        </div>
      </header>

      {/* Main content area */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Video grid - Mobile responsive padding and sidebar handling */}
        <div className={`flex-1 p-2 sm:p-4 transition-all duration-300 ${showParticipants ? 'sm:mr-72' : ''}`}>
          {/* Screen share takes priority */}
          {screenSharer ? (
            <div className="h-full flex flex-col gap-2 sm:gap-4">
              {/* Main screen share */}
              <div className="flex-1 bg-gray-800 rounded-lg sm:rounded-xl overflow-hidden relative min-h-0">
                <ParticipantVideo
                  participant={screenSharer}
                  isScreenShare
                  className="w-full h-full object-contain"
                />
                <div className="absolute bottom-2 sm:bottom-4 left-2 sm:left-4 px-2 sm:px-3 py-1 sm:py-1.5 bg-gray-900/80 rounded-lg text-white text-xs sm:text-sm">
                  {screenSharer.user_name || 'Participant'}&apos;s screen
                </div>
              </div>
              {/* Thumbnail strip - smaller on mobile */}
              <div className="h-20 sm:h-32 flex gap-1.5 sm:gap-2 overflow-x-auto pb-1 sm:pb-2">
                {participantArray.map((participant) => (
                  <div
                    key={participant.session_id}
                    className="w-24 sm:w-40 h-full flex-shrink-0 bg-gray-800 rounded-md sm:rounded-lg overflow-hidden relative"
                  >
                    <ParticipantVideo participant={participant} className="w-full h-full object-cover" />
                    <ParticipantOverlay participant={participant} compact hasHandRaised={raisedHands.has(participant.session_id)} />
                  </div>
                ))}
              </div>
            </div>
          ) : (
            /* Grid view - Mobile responsive grid */
            <div
              className={`h-full grid gap-1.5 sm:gap-3 ${
                participantArray.length === 1
                  ? 'grid-cols-1'
                  : participantArray.length === 2
                  ? 'grid-cols-1 sm:grid-cols-2'
                  : participantArray.length <= 4
                  ? 'grid-cols-2'
                  : participantArray.length <= 6
                  ? 'grid-cols-2 sm:grid-cols-3'
                  : participantArray.length <= 9
                  ? 'grid-cols-2 sm:grid-cols-3'
                  : 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 auto-rows-fr'
              }`}
            >
              {participantArray.map((participant) => (
                <div
                  key={participant.session_id}
                  className={`bg-gray-800 rounded-lg sm:rounded-xl overflow-hidden relative aspect-video sm:aspect-auto ${
                    participant.owner ? 'ring-2 ring-purple-500' : ''
                  } ${raisedHands.has(participant.session_id) ? 'ring-2 ring-yellow-500' : ''}`}
                >
                  <ParticipantVideo participant={participant} className="w-full h-full object-cover" />
                  <ParticipantOverlay participant={participant} hasHandRaised={raisedHands.has(participant.session_id)} />
                  {/* Teacher controls for other participants */}
                  {isTeacher && !participant.local && (
                    <div className="absolute top-2 right-2">
                      <button
                        onClick={() => setShowParticipantMenu(
                          showParticipantMenu === participant.session_id ? null : participant.session_id
                        )}
                        className="p-1.5 bg-gray-900/60 hover:bg-gray-900/80 rounded-lg text-white transition-colors"
                      >
                        <MoreVertical className="w-4 h-4" />
                      </button>
                      {showParticipantMenu === participant.session_id && (
                        <div className="absolute right-0 top-full mt-1 bg-gray-800 rounded-lg shadow-xl py-1 min-w-[140px] z-10">
                          <button
                            onClick={() => {
                              muteParticipant(participant.session_id);
                              setShowParticipantMenu(null);
                            }}
                            className="w-full px-3 py-2 text-left text-sm text-white hover:bg-gray-700 flex items-center gap-2"
                          >
                            <VolumeX className="w-4 h-4" /> Mute
                          </button>
                          <button
                            onClick={() => {
                              removeParticipant(participant.session_id);
                              setShowParticipantMenu(null);
                            }}
                            className="w-full px-3 py-2 text-left text-sm text-red-400 hover:bg-gray-700 flex items-center gap-2"
                          >
                            <UserX className="w-4 h-4" /> Remove
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Participants sidebar - Mobile overlay, desktop sidebar */}
        {showParticipants && (
          <aside className="absolute sm:relative inset-0 sm:inset-auto w-full sm:w-72 bg-gray-800/95 sm:bg-gray-800 backdrop-blur-sm sm:backdrop-blur-none border-l border-gray-700 flex flex-col z-20">
            <div className="p-4 border-b border-gray-700 flex items-center justify-between">
              <h2 className="text-white font-semibold">Participants ({participants.size})</h2>
              <button
                onClick={() => setShowParticipants(false)}
                className="p-1 text-gray-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-2">
              {participantArray.map((participant) => (
                <div
                  key={participant.session_id}
                  className={`flex items-center gap-3 p-3 rounded-lg hover:bg-gray-700/50 ${raisedHands.has(participant.session_id) ? 'bg-yellow-500/20 border border-yellow-500/50' : ''}`}
                >
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-semibold ${raisedHands.has(participant.session_id) ? 'bg-yellow-500' : 'bg-gradient-to-br from-purple-500 to-pink-500'}`}>
                    {raisedHands.has(participant.session_id) ? (
                      <Hand className="w-5 h-5" />
                    ) : (
                      (participant.user_name || 'P').charAt(0).toUpperCase()
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm font-medium truncate">
                      {participant.user_name || 'Participant'}
                      {participant.local && ' (You)'}
                      {raisedHands.has(participant.session_id) && ' ✋'}
                    </p>
                    <p className="text-gray-400 text-xs">
                      {participant.owner ? 'Teacher' : 'Student'}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    {raisedHands.has(participant.session_id) && <Hand className="w-4 h-4 text-yellow-400 animate-pulse" />}
                    {!participant.audio && <MicOff className="w-4 h-4 text-red-400" />}
                    {!participant.video && <VideoOff className="w-4 h-4 text-red-400" />}
                  </div>
                </div>
              ))}
            </div>
            {isTeacher && (
              <div className="p-4 border-t border-gray-700">
                <button
                  onClick={muteAll}
                  className="w-full py-2 px-4 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm transition-colors flex items-center justify-center gap-2"
                >
                  <VolumeX className="w-4 h-4" /> Mute All Students
                </button>
              </div>
            )}
          </aside>
        )}

        {/* Chat sidebar - Mobile overlay, desktop sidebar */}
        {showChat && (
          <aside className="absolute sm:relative inset-0 sm:inset-auto w-full sm:w-80 bg-gray-800/95 sm:bg-gray-800 backdrop-blur-sm sm:backdrop-blur-none border-l border-gray-700 flex flex-col z-20">
            <div className="p-4 border-b border-gray-700 flex items-center justify-between">
              <h2 className="text-white font-semibold flex items-center gap-2">
                <MessageCircle className="w-5 h-5" />
                Chat
              </h2>
              <button
                onClick={() => setShowChat(false)}
                className="p-1 text-gray-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            {/* Messages */}
            <div 
              ref={chatScrollRef}
              className="flex-1 overflow-y-auto p-3 space-y-3"
            >
              {chatMessages.length === 0 ? (
                <div className="text-center text-gray-500 py-8">
                  <MessageCircle className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No messages yet</p>
                  <p className="text-xs text-gray-600">Start the conversation!</p>
                </div>
              ) : (
                chatMessages.map((msg) => {
                  const isOwn = localParticipant?.session_id === msg.sender;
                  return (
                    <div
                      key={msg.id}
                      className={`flex flex-col ${isOwn ? 'items-end' : 'items-start'}`}
                    >
                      <div className={`max-w-[85%] rounded-2xl px-4 py-2 ${
                        isOwn 
                          ? 'bg-blue-600 text-white rounded-br-md' 
                          : 'bg-gray-700 text-white rounded-bl-md'
                      }`}>
                        {!isOwn && (
                          <p className="text-xs text-blue-300 font-medium mb-1">
                            {msg.senderName}
                          </p>
                        )}
                        <p className="text-sm break-words">{msg.text}</p>
                      </div>
                      <span className="text-xs text-gray-500 mt-1 px-1">
                        {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
            
            {/* Input */}
            <div className="p-3 border-t border-gray-700">
              <form 
                onSubmit={(e) => {
                  e.preventDefault();
                  sendChatMessage();
                }}
                className="flex gap-2"
              >
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder="Type a message..."
                  className="flex-1 bg-gray-700 border border-gray-600 rounded-xl px-4 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <button
                  type="submit"
                  disabled={!chatInput.trim()}
                  className="p-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white rounded-xl transition-colors"
                >
                  <Send className="w-5 h-5" />
                </button>
              </form>
            </div>
          </aside>
        )}
      </div>

      {/* Controls bar - Mobile responsive */}
      <footer
        className={`px-2 sm:px-4 py-2 sm:py-4 bg-gray-800/90 backdrop-blur-sm flex items-center justify-center gap-1.5 sm:gap-3 transition-opacity duration-300 safe-area-pb ${
          showControls ? 'opacity-100' : 'opacity-0'
        }`}
        style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}
      >
        {/* Mute */}
        <button
          onClick={toggleMute}
          className={`p-2.5 sm:p-4 rounded-full transition-colors ${
            isMuted ? 'bg-red-600 text-white' : 'bg-gray-700 text-white hover:bg-gray-600'
          }`}
          title={isMuted ? 'Unmute' : 'Mute'}
        >
          {isMuted ? <MicOff className="w-5 h-5 sm:w-6 sm:h-6" /> : <Mic className="w-5 h-5 sm:w-6 sm:h-6" />}
        </button>

        {/* Video */}
        <button
          onClick={toggleVideo}
          className={`p-2.5 sm:p-4 rounded-full transition-colors ${
            isVideoOff ? 'bg-red-600 text-white' : 'bg-gray-700 text-white hover:bg-gray-600'
          }`}
          title={isVideoOff ? 'Turn on camera' : 'Turn off camera'}
        >
          {isVideoOff ? <VideoOff className="w-5 h-5 sm:w-6 sm:h-6" /> : <Video className="w-5 h-5 sm:w-6 sm:h-6" />}
        </button>

        {/* Screen share - hidden on very small screens */}
        <button
          onClick={toggleScreenShare}
          className={`hidden xs:flex p-2.5 sm:p-4 rounded-full transition-colors ${
            isScreenSharing ? 'bg-green-600 text-white' : 'bg-gray-700 text-white hover:bg-gray-600'
          }`}
          title={isScreenSharing ? 'Stop sharing' : 'Share screen'}
        >
          {isScreenSharing ? <MonitorOff className="w-5 h-5 sm:w-6 sm:h-6" /> : <Monitor className="w-5 h-5 sm:w-6 sm:h-6" />}
        </button>

        {/* Hand raise (students) - with count badge for teachers */}
        {!isTeacher && (
          <button
            onClick={toggleRaiseHand}
            className={`p-2.5 sm:p-4 rounded-full transition-colors ${
              handRaised ? 'bg-yellow-500 text-white animate-pulse' : 'bg-gray-700 text-white hover:bg-gray-600'
            }`}
            title={handRaised ? 'Lower hand' : 'Raise hand'}
          >
            <Hand className="w-5 h-5 sm:w-6 sm:h-6" />
          </button>
        )}
        
        {/* Raised hands indicator for teachers */}
        {isTeacher && raisedHands.size > 0 && (
          <button
            onClick={() => setShowParticipants(true)}
            className="p-2.5 sm:p-4 rounded-full bg-yellow-500 text-white animate-pulse relative"
            title={`${raisedHands.size} hand${raisedHands.size > 1 ? 's' : ''} raised`}
          >
            <Hand className="w-5 h-5 sm:w-6 sm:h-6" />
            <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-600 rounded-full text-xs font-bold flex items-center justify-center">
              {raisedHands.size}
            </span>
          </button>
        )}

        {/* Chat button */}
        <button
          onClick={() => {
            setShowChat(!showChat);
            setShowParticipants(false);
          }}
          className={`p-2.5 sm:p-4 rounded-full transition-colors relative ${
            showChat ? 'bg-blue-600 text-white' : 'bg-gray-700 text-white hover:bg-gray-600'
          }`}
          title="Chat"
        >
          <MessageCircle className="w-5 h-5 sm:w-6 sm:h-6" />
          {unreadMessages > 0 && !showChat && (
            <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-600 rounded-full text-xs font-bold flex items-center justify-center">
              {unreadMessages > 9 ? '9+' : unreadMessages}
            </span>
          )}
        </button>

        {/* Recording (teacher only) - hidden on mobile */}
        {isTeacher && (
          <button
            onClick={isRecording ? stopRecording : startRecording}
            className={`hidden sm:flex p-4 rounded-full transition-colors ${
              isRecording ? 'bg-red-600 text-white animate-pulse' : 'bg-gray-700 text-white hover:bg-gray-600'
            }`}
            title={isRecording ? 'Stop recording' : 'Start recording'}
          >
            <Circle className={`w-6 h-6 ${isRecording ? 'fill-current' : ''}`} />
          </button>
        )}

        {/* Leave call */}
        <button
          onClick={handleLeave}
          className="p-2.5 sm:p-4 bg-red-600 hover:bg-red-700 text-white rounded-full transition-colors ml-2 sm:ml-4"
          title={isTeacher ? 'End lesson' : 'Leave lesson'}
        >
          <PhoneOff className="w-5 h-5 sm:w-6 sm:h-6" />
        </button>
      </footer>
    </div>
  );
}

// Participant video component
function ParticipantVideo({
  participant,
  isScreenShare = false,
  className = '',
}: {
  participant: DailyParticipant;
  isScreenShare?: boolean;
  className?: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current && participant) {
      const mediaStreamTracks: MediaStreamTrack[] = [];
      
      // Get video track
      const videoTracks = isScreenShare
        ? participant.tracks?.screenVideo
        : participant.tracks?.video;
      
      if (videoTracks?.track) {
        mediaStreamTracks.push(videoTracks.track);
      }
      
      // Get audio track (important for non-local participants)
      if (!participant.local && participant.tracks?.audio?.track) {
        mediaStreamTracks.push(participant.tracks.audio.track);
      }
      
      if (mediaStreamTracks.length > 0) {
        videoRef.current.srcObject = new MediaStream(mediaStreamTracks);
        // Ensure audio plays for remote participants
        if (!participant.local) {
          videoRef.current.muted = false;
          videoRef.current.volume = 1.0;
          // Try to play (may be blocked by autoplay policy)
          videoRef.current.play().catch(e => {
            console.warn('[ParticipantVideo] Autoplay blocked:', e);
          });
        }
      }
    }
  }, [participant, isScreenShare]);

  const showVideo = isScreenShare ? participant.screen : participant.video;

  if (!showVideo) {
    return (
      <div className={`flex items-center justify-center bg-gradient-to-br from-purple-600 to-pink-600 ${className}`}>
        <div className="w-20 h-20 rounded-full bg-white/20 flex items-center justify-center text-white text-3xl font-semibold">
          {(participant.user_name || 'P').charAt(0).toUpperCase()}
        </div>
      </div>
    );
  }

  return (
    <video
      ref={videoRef}
      autoPlay
      playsInline
      muted={participant.local}
      className={className}
      style={{ transform: participant.local && !isScreenShare ? 'scaleX(-1)' : undefined }}
    />
  );
}

// Participant overlay with name and status
function ParticipantOverlay({ participant, compact = false, hasHandRaised = false }: { participant: DailyParticipant; compact?: boolean; hasHandRaised?: boolean }) {
  return (
    <div className={`absolute bottom-0 left-0 right-0 ${compact ? 'p-1.5' : 'p-2 sm:p-3'} bg-gradient-to-t from-black/70 to-transparent`}>
      <div className="flex items-center justify-between">
        <span className={`text-white ${compact ? 'text-xs' : 'text-xs sm:text-sm'} font-medium truncate`}>
          {participant.user_name || 'Participant'}
          {participant.local && <span className="hidden sm:inline"> (You)</span>}
          {participant.owner && ' ⭐'}
        </span>
        <div className="flex items-center gap-0.5 sm:gap-1">
          {hasHandRaised && (
            <span className={`${compact ? 'p-0.5' : 'p-0.5 sm:p-1'} bg-yellow-500 rounded animate-pulse`}>
              <Hand className={`${compact ? 'w-2 h-2' : 'w-2.5 h-2.5 sm:w-3 sm:h-3'} text-white`} />
            </span>
          )}
          {!participant.audio && (
            <span className={`${compact ? 'p-0.5' : 'p-0.5 sm:p-1'} bg-red-600 rounded`}>
              <MicOff className={`${compact ? 'w-2 h-2' : 'w-2.5 h-2.5 sm:w-3 sm:h-3'} text-white`} />
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
