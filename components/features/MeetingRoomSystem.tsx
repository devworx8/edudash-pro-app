import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Modal, TextInput, Alert, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
// DateTimePicker removed for better cross-platform compatibility
import { useAuth } from '@/contexts/AuthContext';
import { assertSupabase } from '@/lib/supabase';

import EduDashSpinner from '@/components/ui/EduDashSpinner';
// Types for meeting room system
interface Meeting {
  id: string;
  title: string;
  description?: string;
  startTime: string;
  endTime: string;
  hostId: string;
  hostName: string;
  participants: Participant[];
  status: 'scheduled' | 'in-progress' | 'completed' | 'cancelled';
  meetingRoomId: string;
  isRecording: boolean;
  createdAt: string;
}

interface Participant {
  id: string;
  name: string;
  email: string;
  role: 'host' | 'teacher' | 'parent' | 'admin';
  status: 'invited' | 'accepted' | 'declined' | 'joined' | 'left';
  joinTime?: string;
  leaveTime?: string;
}

interface MeetingRoom {
  id: string;
  name: string;
  capacity: number;
  isActive: boolean;
  currentMeetingId?: string;
  features: {
    videoCall: boolean;
    screenShare: boolean;
    recording: boolean;
    chat: boolean;
    whiteboard: boolean;
  };
}

interface MeetingRoomSystemProps {
  onClose: () => void;
  schoolId: string;
}

const MeetingRoomSystem: React.FC<MeetingRoomSystemProps> = ({ onClose, schoolId }) => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'schedule' | 'meetings' | 'rooms'>('meetings');
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [meetingRooms, setMeetingRooms] = useState<MeetingRoom[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Meeting scheduling state
  const [newMeeting, setNewMeeting] = useState({
    title: '',
    description: '',
    startTime: new Date(),
    endTime: new Date(Date.now() + 60 * 60 * 1000), // 1 hour from now
    participantEmails: '',
    roomId: ''
  });
  const [showDatePicker, setShowDatePicker] = useState<'start' | 'end' | null>(null);

  // Video call state
  const [activeMeeting, setActiveMeeting] = useState<Meeting | null>(null);
  const [isInCall, setIsInCall] = useState(false);
  const [callControls, setCallControls] = useState({
    muted: false,
    videoOff: false,
    recording: false
  });

  const colors = {
    primary: '#007AFF',
    success: '#34C759',
    warning: '#FF9500',
    danger: '#FF3B30',
    background: '#F8F9FA',
    surface: '#FFFFFF',
    text: '#1D1D1F',
    textSecondary: '#8E8E93',
    border: '#E5E5EA'
  };

  // Load initial data
  useEffect(() => {
    loadMeetings();
    loadMeetingRooms();
  }, [schoolId]);

  const loadMeetings = useCallback(async () => {
    if (!user?.id) return;

    setLoading(true);
    try {
      const client = assertSupabase();
      const { data: meetingsData, error } = await client
        .from('meetings')
        .select(`
          *,
          meeting_participants(*)
        `)
        .eq('school_id', schoolId)
        .gte('start_time', new Date().toISOString())
        .order('start_time', { ascending: true });

      if (error) throw error;

      const formattedMeetings: Meeting[] = meetingsData?.map(meeting => ({
        id: meeting.id,
        title: meeting.title,
        description: meeting.description,
        startTime: meeting.start_time,
        endTime: meeting.end_time,
        hostId: meeting.host_id,
        hostName: meeting.host_name || 'Unknown Host',
        participants: meeting.meeting_participants?.map((p: any) => ({
          id: p.id,
          name: p.participant_name,
          email: p.participant_email,
          role: p.role,
          status: p.status,
          joinTime: p.join_time,
          leaveTime: p.leave_time
        })) || [],
        status: meeting.status,
        meetingRoomId: meeting.meeting_room_id,
        isRecording: meeting.is_recording || false,
        createdAt: meeting.created_at
      })) || [];

      setMeetings(formattedMeetings);
    } catch (error) {
      console.error('Failed to load meetings:', error);
      // Show empty state with error message instead of mock data
      setMeetings([]);
    } finally {
      setLoading(false);
    }
  }, [user?.id, schoolId]);

  const loadMeetingRooms = useCallback(async () => {
    try {
      const client = assertSupabase();
      const { data: roomsData, error } = await client
        .from('meeting_rooms')
        .select('*')
        .eq('school_id', schoolId)
        .order('name');

      if (error) throw error;

      const formattedRooms: MeetingRoom[] = roomsData?.map(room => ({
        id: room.id,
        name: room.name,
        capacity: room.capacity || 20,
        isActive: room.is_active,
        currentMeetingId: room.current_meeting_id,
        features: {
          videoCall: room.features?.videoCall ?? true,
          screenShare: room.features?.screenShare ?? true,
          recording: room.features?.recording ?? true,
          chat: room.features?.chat ?? true,
          whiteboard: room.features?.whiteboard ?? false
        }
      })) || [];

      setMeetingRooms(formattedRooms);
    } catch (error) {
      console.error('Failed to load meeting rooms:', error);
      // Show empty state with error message instead of mock data
      setMeetingRooms([]);
    }
  }, [schoolId]);


  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([loadMeetings(), loadMeetingRooms()]);
    setRefreshing(false);
  }, [loadMeetings, loadMeetingRooms]);

  const scheduleMeeting = async () => {
    if (!newMeeting.title.trim()) {
      Alert.alert('Error', 'Please enter a meeting title');
      return;
    }

    if (!newMeeting.roomId) {
      Alert.alert('Error', 'Please select a meeting room');
      return;
    }

    setLoading(true);
    try {
      if (user?.id) {
        const client = assertSupabase();
        const { data: meetingData, error: meetingError } = await client
          .from('meetings')
          .insert([
            {
              title: newMeeting.title,
              description: newMeeting.description,
              start_time: newMeeting.startTime.toISOString(),
              end_time: newMeeting.endTime.toISOString(),
              host_id: user.id,
              school_id: schoolId,
              meeting_room_id: newMeeting.roomId,
              status: 'scheduled'
            }
          ])
          .select()
          .single();

        if (meetingError) throw meetingError;

        // Add participants
        if (newMeeting.participantEmails.trim()) {
          const emails = newMeeting.participantEmails.split(',').map(e => e.trim());
          const participantInserts = emails.map(email => ({
            meeting_id: meetingData.id,
            participant_email: email,
            status: 'invited'
          }));

          const { error: participantError } = await client
            .from('meeting_participants')
            .insert(participantInserts);

          if (participantError) throw participantError;
        }
      }

      await loadMeetings();
      setActiveTab('meetings');
      resetNewMeetingForm();
      Alert.alert('Success', 'Meeting scheduled successfully!');
    } catch (error) {
      console.error('Failed to schedule meeting:', error);
      Alert.alert('Error', 'Failed to schedule meeting. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const resetNewMeetingForm = () => {
    setNewMeeting({
      title: '',
      description: '',
      startTime: new Date(),
      endTime: new Date(Date.now() + 60 * 60 * 1000),
      participantEmails: '',
      roomId: ''
    });
  };

  const joinMeeting = (meeting: Meeting) => {
    setActiveMeeting(meeting);
    setIsInCall(true);
    // In a real app, this would initialize the video call SDK
  };

  const leaveMeeting = () => {
    setIsInCall(false);
    setActiveMeeting(null);
    setCallControls({ muted: false, videoOff: false, recording: false });
  };

  const toggleMute = () => {
    setCallControls(prev => ({ ...prev, muted: !prev.muted }));
  };

  const toggleVideo = () => {
    setCallControls(prev => ({ ...prev, videoOff: !prev.videoOff }));
  };

  const toggleRecording = () => {
    setCallControls(prev => ({ ...prev, recording: !prev.recording }));
  };

  const formatDateTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-ZA', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'scheduled': return colors.primary;
      case 'in-progress': return colors.success;
      case 'completed': return colors.textSecondary;
      case 'cancelled': return colors.danger;
      default: return colors.textSecondary;
    }
  };

  const renderMeetingItem = ({ item }: { item: Meeting }) => (
    <View style={styles.meetingCard}>
      <View style={styles.meetingHeader}>
        <Text style={styles.meetingTitle}>{item.title}</Text>
        <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.status) }]}>
          <Text style={styles.statusText}>{item.status}</Text>
        </View>
      </View>
      
      <Text style={styles.meetingTime}>
        {formatDateTime(item.startTime)} - {new Date(item.endTime).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' })}
      </Text>
      
      {item.description && (
        <Text style={styles.meetingDescription}>{item.description}</Text>
      )}

      <View style={styles.participantInfo}>
        <Ionicons name="people" size={16} color={colors.textSecondary} />
        <Text style={styles.participantText}>
          {item.participants.length} participant{item.participants.length !== 1 ? 's' : ''}
        </Text>
      </View>

      <View style={styles.meetingActions}>
        {item.status === 'scheduled' && (
          <TouchableOpacity
            style={[styles.actionButton, styles.joinButton]}
            onPress={() => joinMeeting(item)}
          >
            <Ionicons name="videocam" size={18} color="white" />
            <Text style={styles.actionButtonText}>Join</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );

  const renderRoomItem = ({ item }: { item: MeetingRoom }) => (
    <View style={styles.roomCard}>
      <View style={styles.roomHeader}>
        <Text style={styles.roomName}>{item.name}</Text>
        <View style={[styles.roomStatus, { backgroundColor: item.isActive ? colors.success : colors.textSecondary }]}>
          <Text style={styles.roomStatusText}>
            {item.isActive ? 'In Use' : 'Available'}
          </Text>
        </View>
      </View>

      <Text style={styles.roomCapacity}>Capacity: {item.capacity} people</Text>

      <View style={styles.roomFeatures}>
        {Object.entries(item.features).map(([feature, enabled]) => (
          enabled && (
            <View key={feature} style={styles.featureTag}>
              <Text style={styles.featureText}>
                {feature === 'videoCall' ? 'Video' :
                 feature === 'screenShare' ? 'Screen Share' :
                 feature === 'whiteboard' ? 'Whiteboard' :
                 feature.charAt(0).toUpperCase() + feature.slice(1)}
              </Text>
            </View>
          )
        ))}
      </View>
    </View>
  );

  if (isInCall && activeMeeting) {
    return (
      <Modal visible={true} animationType="slide" statusBarTranslucent>
        <View style={styles.callContainer}>
          {/* Video Call Interface */}
          <View style={styles.videoContainer}>
            <View style={styles.mainVideo}>
              <Text style={styles.videoPlaceholder}>Video Call Area</Text>
              <Text style={styles.meetingTitleInCall}>{activeMeeting.title}</Text>
            </View>
            
            <ScrollView horizontal style={styles.participantVideos}>
              {activeMeeting.participants.map((participant) => (
                <View key={participant.id} style={styles.participantVideo}>
                  <Text style={styles.participantName}>{participant.name}</Text>
                </View>
              ))}
            </ScrollView>
          </View>

          {/* Call Controls */}
          <View style={styles.callControls}>
            <TouchableOpacity
              style={[styles.controlButton, callControls.muted && styles.controlButtonActive]}
              onPress={toggleMute}
            >
              <Ionicons 
                name={callControls.muted ? 'mic-off' : 'mic'} 
                size={24} 
                color={callControls.muted ? colors.danger : 'white'} 
              />
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.controlButton, callControls.videoOff && styles.controlButtonActive]}
              onPress={toggleVideo}
            >
              <Ionicons 
                name={callControls.videoOff ? 'videocam-off' : 'videocam'} 
                size={24} 
                color={callControls.videoOff ? colors.danger : 'white'} 
              />
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.controlButton, callControls.recording && styles.controlButtonActive]}
              onPress={toggleRecording}
            >
              <Ionicons 
                name="radio-button-on" 
                size={24} 
                color={callControls.recording ? colors.danger : 'white'} 
              />
            </TouchableOpacity>

            <TouchableOpacity style={[styles.controlButton, styles.endCallButton]} onPress={leaveMeeting}>
              <Ionicons name="call" size={24} color="white" />
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    );
  }

  return (
    <Modal visible={true} animationType="slide" statusBarTranslucent>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <Ionicons name="close" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.title}>Meeting Rooms</Text>
          <TouchableOpacity 
            style={styles.addButton}
            onPress={() => setActiveTab('schedule')}
          >
            <Ionicons name="add" size={24} color={colors.primary} />
          </TouchableOpacity>
        </View>

        {/* Tabs */}
        <View style={styles.tabContainer}>
          {[
            { key: 'meetings', label: 'Meetings', icon: 'calendar' },
            { key: 'rooms', label: 'Rooms', icon: 'business' },
            { key: 'schedule', label: 'Schedule', icon: 'add-circle' }
          ].map(tab => (
            <TouchableOpacity
              key={tab.key}
              style={[styles.tab, activeTab === tab.key && styles.activeTab]}
              onPress={() => setActiveTab(tab.key as any)}
            >
              <Ionicons 
                name={tab.icon as any} 
                size={20} 
                color={activeTab === tab.key ? colors.primary : colors.textSecondary} 
              />
              <Text style={[
                styles.tabText,
                activeTab === tab.key && styles.activeTabText
              ]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Content */}
        <View style={styles.content}>
          {activeTab === 'meetings' && (
            <ScrollView
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.listContainer}
            >
              {meetings.map(item => (
                <React.Fragment key={item.id}>
                  {renderMeetingItem({ item } as any)}
                </React.Fragment>
              ))}
            </ScrollView>
          )}

          {activeTab === 'rooms' && (
            <ScrollView
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.listContainer}
            >
              {meetingRooms.map(item => (
                <React.Fragment key={item.id}>
                  {renderRoomItem({ item } as any)}
                </React.Fragment>
              ))}
            </ScrollView>
          )}

          {activeTab === 'schedule' && (
            <ScrollView style={styles.scheduleContent}>
              <Text style={styles.scheduleTitle}>Schedule New Meeting</Text>
              
              <View style={styles.formGroup}>
                <Text style={styles.label}>Meeting Title *</Text>
                <TextInput
                  style={styles.textInput}
                  value={newMeeting.title}
                  onChangeText={(text) => setNewMeeting(prev => ({ ...prev, title: text }))}
                  placeholder="Enter meeting title"
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.label}>Description</Text>
                <TextInput
                  style={[styles.textInput, styles.textArea]}
                  value={newMeeting.description}
                  onChangeText={(text) => setNewMeeting(prev => ({ ...prev, description: text }))}
                  placeholder="Meeting description (optional)"
                  multiline
                  numberOfLines={3}
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.label}>Meeting Room *</Text>
                <ScrollView horizontal style={styles.roomSelector}>
                  {meetingRooms.map(room => (
                    <TouchableOpacity
                      key={room.id}
                      style={[
                        styles.roomOption,
                        newMeeting.roomId === room.id && styles.selectedRoom,
                        room.isActive && styles.disabledRoom
                      ]}
                      onPress={() => !room.isActive && setNewMeeting(prev => ({ ...prev, roomId: room.id }))}
                      disabled={room.isActive}
                    >
                      <Text style={[
                        styles.roomOptionText,
                        newMeeting.roomId === room.id && styles.selectedRoomText,
                        room.isActive && styles.disabledRoomText
                      ]}>
                        {room.name}
                      </Text>
                      {room.isActive && <Text style={styles.inUseText}>In Use</Text>}
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>

              <View style={styles.dateTimeContainer}>
                <View style={styles.dateTimeGroup}>
                  <Text style={styles.label}>Start Time</Text>
                  <TouchableOpacity
                    style={styles.dateTimeButton}
                    onPress={() => setShowDatePicker('start')}
                  >
                    <Text>{newMeeting.startTime.toLocaleString('en-ZA')}</Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.dateTimeGroup}>
                  <Text style={styles.label}>End Time</Text>
                  <TouchableOpacity
                    style={styles.dateTimeButton}
                    onPress={() => setShowDatePicker('end')}
                  >
                    <Text>{newMeeting.endTime.toLocaleString('en-ZA')}</Text>
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.label}>Participant Emails</Text>
                <TextInput
                  style={styles.textInput}
                  value={newMeeting.participantEmails}
                  onChangeText={(text) => setNewMeeting(prev => ({ ...prev, participantEmails: text }))}
                  placeholder="email1@example.com, email2@example.com"
                  multiline
                />
              </View>

              <TouchableOpacity
                style={[styles.scheduleButton, loading && styles.disabledButton]}
                onPress={scheduleMeeting}
                disabled={loading}
              >
                {loading ? (
                  <EduDashSpinner color="white" />
                ) : (
                  <>
                    <Ionicons name="calendar" size={20} color="white" />
                    <Text style={styles.scheduleButtonText}>Schedule Meeting</Text>
                  </>
                )}
              </TouchableOpacity>
            </ScrollView>
          )}
        </View>

        {/* Date Time Input Modal */}
        {showDatePicker && (
          <Modal visible={true} transparent animationType="slide">
            <View style={styles.datePickerOverlay}>
              <View style={styles.datePickerModal}>
                <Text style={styles.datePickerTitle}>
                  Select {showDatePicker === 'start' ? 'Start' : 'End'} Time
                </Text>
                
                <View style={styles.dateTimeInputContainer}>
                  <Text style={styles.inputLabel}>Date (YYYY-MM-DD)</Text>
                  <TextInput
                    style={styles.dateTimeInput}
                    value={(showDatePicker === 'start' ? newMeeting.startTime : newMeeting.endTime)
                      .toISOString().split('T')[0]}
                    onChangeText={(text) => {
                      const currentTime = showDatePicker === 'start' ? newMeeting.startTime : newMeeting.endTime;
                      const newDate = new Date(text + 'T' + currentTime.toTimeString().slice(0, 5));
                      if (!isNaN(newDate.getTime())) {
                        if (showDatePicker === 'start') {
                          setNewMeeting(prev => ({ ...prev, startTime: newDate }));
                        } else {
                          setNewMeeting(prev => ({ ...prev, endTime: newDate }));
                        }
                      }
                    }}
                    placeholder="2024-01-01"
                  />
                  
                  <Text style={styles.inputLabel}>Time (HH:MM)</Text>
                  <TextInput
                    style={styles.dateTimeInput}
                    value={(showDatePicker === 'start' ? newMeeting.startTime : newMeeting.endTime)
                      .toTimeString().slice(0, 5)}
                    onChangeText={(text) => {
                      const currentDate = showDatePicker === 'start' ? newMeeting.startTime : newMeeting.endTime;
                      const newTime = new Date(currentDate.toDateString() + ' ' + text);
                      if (!isNaN(newTime.getTime())) {
                        if (showDatePicker === 'start') {
                          setNewMeeting(prev => ({ ...prev, startTime: newTime }));
                        } else {
                          setNewMeeting(prev => ({ ...prev, endTime: newTime }));
                        }
                      }
                    }}
                    placeholder="09:00"
                  />
                </View>
                
                <View style={styles.datePickerActions}>
                  <TouchableOpacity
                    style={[styles.datePickerButton, styles.cancelButton]}
                    onPress={() => setShowDatePicker(null)}
                  >
                    <Text style={styles.cancelButtonText}>Cancel</Text>
                  </TouchableOpacity>
                  
                  <TouchableOpacity
                    style={[styles.datePickerButton, styles.confirmButton]}
                    onPress={() => setShowDatePicker(null)}
                  >
                    <Text style={styles.confirmButtonText}>Confirm</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </Modal>
        )}
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    paddingTop: 50,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  closeButton: {
    padding: 4,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1D1D1F',
  },
  addButton: {
    padding: 4,
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    marginHorizontal: 4,
    borderRadius: 8,
  },
  activeTab: {
    backgroundColor: '#E3F2FD',
  },
  tabText: {
    marginLeft: 6,
    fontSize: 14,
    color: '#8E8E93',
  },
  activeTabText: {
    color: '#007AFF',
    fontWeight: '500',
  },
  content: {
    flex: 1,
  },
  listContainer: {
    padding: 20,
  },
  meetingCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  meetingHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  meetingTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: '#1D1D1F',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    marginLeft: 8,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#FFFFFF',
    textTransform: 'capitalize',
  },
  meetingTime: {
    fontSize: 14,
    color: '#8E8E93',
    marginBottom: 8,
  },
  meetingDescription: {
    fontSize: 14,
    color: '#1D1D1F',
    marginBottom: 12,
  },
  participantInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  participantText: {
    marginLeft: 6,
    fontSize: 14,
    color: '#8E8E93',
  },
  meetingActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  joinButton: {
    backgroundColor: '#007AFF',
  },
  actionButtonText: {
    marginLeft: 6,
    fontSize: 14,
    fontWeight: '500',
    color: '#FFFFFF',
  },
  roomCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  roomHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  roomName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1D1D1F',
  },
  roomStatus: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  roomStatusText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#FFFFFF',
  },
  roomCapacity: {
    fontSize: 14,
    color: '#8E8E93',
    marginBottom: 12,
  },
  roomFeatures: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  featureTag: {
    backgroundColor: '#E3F2FD',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    marginRight: 8,
    marginBottom: 4,
  },
  featureText: {
    fontSize: 12,
    color: '#007AFF',
  },
  scheduleContent: {
    flex: 1,
    padding: 20,
  },
  scheduleTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1D1D1F',
    marginBottom: 24,
  },
  formGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 16,
    fontWeight: '500',
    color: '#1D1D1F',
    marginBottom: 8,
  },
  textInput: {
    borderWidth: 1,
    borderColor: '#E5E5EA',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: '#FFFFFF',
  },
  textArea: {
    height: 80,
    textAlignVertical: 'top',
  },
  roomSelector: {
    flexDirection: 'row',
  },
  roomOption: {
    borderWidth: 1,
    borderColor: '#E5E5EA',
    borderRadius: 8,
    padding: 12,
    marginRight: 12,
    backgroundColor: '#FFFFFF',
  },
  selectedRoom: {
    borderColor: '#007AFF',
    backgroundColor: '#E3F2FD',
  },
  disabledRoom: {
    backgroundColor: '#F2F2F7',
    opacity: 0.6,
  },
  roomOptionText: {
    fontSize: 14,
    color: '#1D1D1F',
  },
  selectedRoomText: {
    color: '#007AFF',
    fontWeight: '500',
  },
  disabledRoomText: {
    color: '#8E8E93',
  },
  inUseText: {
    fontSize: 12,
    color: '#FF3B30',
    fontWeight: '500',
    marginTop: 4,
  },
  dateTimeContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  dateTimeGroup: {
    flex: 1,
    marginRight: 12,
  },
  dateTimeButton: {
    borderWidth: 1,
    borderColor: '#E5E5EA',
    borderRadius: 8,
    padding: 12,
    backgroundColor: '#FFFFFF',
  },
  scheduleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#007AFF',
    borderRadius: 12,
    padding: 16,
    marginTop: 20,
  },
  disabledButton: {
    opacity: 0.6,
  },
  scheduleButtonText: {
    marginLeft: 8,
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  callContainer: {
    flex: 1,
    backgroundColor: '#000000',
  },
  videoContainer: {
    flex: 1,
  },
  mainVideo: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  videoPlaceholder: {
    fontSize: 18,
    color: '#FFFFFF',
    opacity: 0.7,
  },
  meetingTitleInCall: {
    fontSize: 16,
    color: '#FFFFFF',
    marginTop: 8,
  },
  participantVideos: {
    height: 120,
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  participantVideo: {
    width: 80,
    height: 100,
    margin: 10,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 8,
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingBottom: 8,
  },
  participantName: {
    fontSize: 12,
    color: '#FFFFFF',
  },
  callControls: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 30,
    backgroundColor: 'rgba(0,0,0,0.8)',
  },
  controlButton: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 12,
  },
  controlButtonActive: {
    backgroundColor: 'rgba(255,59,48,0.8)',
  },
  endCallButton: {
    backgroundColor: '#FF3B30',
  },
  datePickerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  datePickerModal: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 24,
    width: '100%',
    maxWidth: 400,
  },
  datePickerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1D1D1F',
    marginBottom: 20,
    textAlign: 'center',
  },
  dateTimeInputContainer: {
    marginBottom: 24,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#1D1D1F',
    marginBottom: 8,
    marginTop: 12,
  },
  dateTimeInput: {
    borderWidth: 1,
    borderColor: '#E5E5EA',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: '#FFFFFF',
  },
  datePickerActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  datePickerButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    marginHorizontal: 6,
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: '#F2F2F7',
  },
  confirmButton: {
    backgroundColor: '#007AFF',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#8E8E93',
  },
  confirmButtonText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#FFFFFF',
  },
});

export default MeetingRoomSystem;
