'use client';

import { Calendar, MapPin, Users, Clock } from 'lucide-react';

interface EventListProps {
  events: any[];
  onEventClick: (event: any) => void;
}

export function EventList({ events, onEventClick }: EventListProps) {
  const getEventColor = (type: string) => {
    const colors: Record<string, string> = {
      holiday: '#EF4444',
      parent_meeting: '#8B5CF6',
      field_trip: '#10B981',
      assembly: '#3B82F6',
      sports_day: '#F59E0B',
      graduation: '#EC4899',
      fundraiser: '#14B8A6',
      donation_drive: '#0EA5A4',
      other: '#6B7280',
    };
    return colors[type] || colors.other;
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { 
      weekday: 'short', 
      month: 'short', 
      day: 'numeric', 
      year: 'numeric' 
    });
  };

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  // Group events by month
  const eventsByMonth = events.reduce((acc: Record<string, any[]>, event) => {
    const date = new Date(event.start_date);
    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    if (!acc[monthKey]) acc[monthKey] = [];
    acc[monthKey].push(event);
    return acc;
  }, {});

  const sortedMonths = Object.keys(eventsByMonth).sort();

  if (events.length === 0) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: 48 }}>
        <Calendar size={48} style={{ color: 'var(--muted)', margin: '0 auto 16px' }} />
        <h3 style={{ marginBottom: 8 }}>No events scheduled</h3>
        <p style={{ color: 'var(--muted)' }}>Create your first event to get started</p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {sortedMonths.map(monthKey => {
        const [year, month] = monthKey.split('-');
        const monthName = new Date(parseInt(year), parseInt(month) - 1).toLocaleString('default', { 
          month: 'long', 
          year: 'numeric' 
        });
        const monthEvents = eventsByMonth[monthKey];

        return (
          <div key={monthKey}>
            <h3 style={{ marginBottom: 16, color: 'var(--text)' }}>{monthName}</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {monthEvents.map((event) => (
                <button
                  key={event.id}
                  onClick={() => onEventClick(event)}
                  className="card"
                  style={{
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    border: '2px solid transparent',
                    textAlign: 'left',
                    width: '100%',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = getEventColor(event.event_type);
                    e.currentTarget.style.transform = 'translateX(4px)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = 'transparent';
                    e.currentTarget.style.transform = 'translateX(0)';
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
                    {/* Date badge */}
                    <div
                      style={{
                        minWidth: 60,
                        padding: 12,
                        borderRadius: 8,
                        backgroundColor: `${getEventColor(event.event_type)}20`,
                        textAlign: 'center',
                      }}
                    >
                      <div style={{ 
                        fontSize: 24, 
                        fontWeight: 700, 
                        color: getEventColor(event.event_type) 
                      }}>
                        {new Date(event.start_date).getDate()}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase' }}>
                        {new Date(event.start_date).toLocaleString('default', { month: 'short' })}
                      </div>
                    </div>

                    {/* Event details */}
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <h4 style={{ margin: 0 }}>{event.title}</h4>
                        <span
                          style={{
                            fontSize: 11,
                            padding: '2px 8px',
                            borderRadius: 12,
                            backgroundColor: `${getEventColor(event.event_type)}20`,
                            color: getEventColor(event.event_type),
                            textTransform: 'capitalize',
                          }}
                        >
                          {event.event_type.replace('_', ' ')}
                        </span>
                      </div>

                      {event.description && (
                        <p style={{ 
                          color: 'var(--muted)', 
                          fontSize: 14, 
                          margin: '8px 0',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}>
                          {event.description}
                        </p>
                      )}

                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, marginTop: 8 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--muted)' }}>
                          <Clock size={14} />
                          {event.all_day ? 'All day' : `${formatTime(event.start_date)} - ${formatTime(event.end_date)}`}
                        </div>

                        {event.location && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--muted)' }}>
                            <MapPin size={14} />
                            {event.location}
                          </div>
                        )}

                        {event.rsvp_required && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--muted)' }}>
                            <Users size={14} />
                            RSVP Required
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
