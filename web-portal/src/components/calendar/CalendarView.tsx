'use client';

import { useMemo } from 'react';

interface CalendarViewProps {
  events: any[];
  currentDate: Date;
  onEventClick: (event: any) => void;
}

export function CalendarView({ events, currentDate, onEventClick }: CalendarViewProps) {
  const { days, firstDayOfWeek } = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const firstDayOfWeek = firstDay.getDay();

    const days: (Date | null)[] = [];
    
    // Add empty cells for days before month starts
    for (let i = 0; i < firstDayOfWeek; i++) {
      days.push(null);
    }
    
    // Add all days in month
    for (let day = 1; day <= daysInMonth; day++) {
      days.push(new Date(year, month, day));
    }

    return { days, firstDayOfWeek };
  }, [currentDate]);

  // Group events by date
  const eventsByDate = useMemo(() => {
    const grouped: Record<string, any[]> = {};
    events.forEach(event => {
      const dateKey = new Date(event.start_date).toISOString().split('T')[0];
      if (!grouped[dateKey]) grouped[dateKey] = [];
      grouped[dateKey].push(event);
    });
    return grouped;
  }, [events]);

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

  const isToday = (date: Date | null) => {
    if (!date) return false;
    const today = new Date();
    return date.toDateString() === today.toDateString();
  };

  return (
    <div className="card">
      {/* Weekday headers */}
      <div className="calendar-header">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day, index) => (
          <div
            key={day}
            className="calendar-weekday"
          >
            <span className="hide-mobile-inline">{day}</span>
            <span className="show-mobile-inline">{day.charAt(0)}</span>
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="calendar-grid">
        {days.map((date, index) => {
          if (!date) {
            return <div key={`empty-${index}`} className="calendar-day calendar-day-empty" />;
          }

          const dateKey = date.toISOString().split('T')[0];
          const dayEvents = eventsByDate[dateKey] || [];
          const today = isToday(date);

          return (
            <div
              key={dateKey}
              className="calendar-day"
              style={{
                cursor: dayEvents.length > 0 ? 'pointer' : 'default',
              }}
            >
              {/* Date number */}
              <div className={`calendar-date-number ${today ? 'calendar-date-today' : ''}`}>
                {date.getDate()}
              </div>

              {/* Events */}
              <div className="calendar-day-events">
                {dayEvents.slice(0, 3).map((event) => (
                  <button
                    key={event.id}
                    onClick={() => onEventClick(event)}
                    className="calendar-event"
                    style={{
                      backgroundColor: getEventColor(event.event_type),
                    }}
                    title={event.title}
                  >
                    {event.title}
                  </button>
                ))}
                {dayEvents.length > 3 && (
                  <div className="calendar-more-events">
                    +{dayEvents.length - 3} more
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="calendar-legend">
        {Object.entries({
          holiday: 'Holiday',
          parent_meeting: 'Parent Meeting',
          field_trip: 'Field Trip',
          assembly: 'Assembly',
          sports_day: 'Sports Day',
          graduation: 'Graduation',
          fundraiser: 'Fundraiser',
          donation_drive: 'Donation Drive',
        }).map(([type, label]) => (
          <div key={type} className="calendar-legend-item">
            <div
              className="calendar-legend-color"
              style={{
                backgroundColor: getEventColor(type),
              }}
            />
            <span className="calendar-legend-label">{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
