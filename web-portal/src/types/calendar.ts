// Types for school calendar events
export interface SchoolEvent {
  id: string;
  preschool_id: string;
  created_by: string;
  
  // Event details
  title: string;
  description?: string;
  event_type: 'holiday' | 'parent_meeting' | 'field_trip' | 'assembly' | 
    'sports_day' | 'graduation' | 'fundraiser' | 'donation_drive' | 'workshop' | 
    'staff_meeting' | 'open_house' | 'other';
  
  // Date and time
  start_date: string;
  end_date: string;
  all_day: boolean;
  
  // Recurrence
  is_recurring: boolean;
  recurrence_rule?: {
    frequency: 'daily' | 'weekly' | 'monthly';
    interval: number;
    until?: string;
  };
  
  // Location
  location?: string;
  
  // Participants
  target_audience: string[];
  max_participants?: number;
  
  // RSVP
  rsvp_enabled: boolean;
  rsvp_deadline?: string;
  
  // Notifications
  send_notifications: boolean;
  notification_sent: boolean;
  reminder_sent: boolean;
  
  // Status
  status: 'scheduled' | 'ongoing' | 'completed' | 'cancelled';
  
  // Metadata
  color?: string;
  attachments?: Array<{
    url: string;
    name: string;
    type: string;
  }>;
  notes?: string;
  
  created_at: string;
  updated_at: string;
}

export interface EventRSVP {
  id: string;
  event_id: string;
  user_id: string;
  preschool_id: string;
  status: 'attending' | 'not_attending' | 'maybe' | 'pending';
  number_of_guests: number;
  notes?: string;
  responded_at?: string;
  created_at: string;
}

export interface CreateEventInput {
  title: string;
  description?: string;
  event_type: SchoolEvent['event_type'];
  start_date: string;
  end_date: string;
  all_day: boolean;
  is_recurring: boolean;
  recurrence_rule?: SchoolEvent['recurrence_rule'];
  location?: string;
  target_audience: string[];
  max_participants?: number;
  rsvp_enabled: boolean;
  rsvp_deadline?: string;
  send_notifications: boolean;
  color?: string;
  notes?: string;
}
