'use client';

import type { SchoolEvent } from '@/types/calendar';

interface CalendarGridProps {
  currentDate: Date;
  events: SchoolEvent[];
  onEventClick: (event: SchoolEvent) => void;
}

export function CalendarGrid({ currentDate, events, onEventClick }: CalendarGridProps) {
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  
  // Get first day of month (0 = Sunday, 1 = Monday, etc.)
  const firstDay = new Date(year, month, 1).getDay();
  
  // Get number of days in month
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  
  // Get days from previous month to fill first week
  const daysInPrevMonth = new Date(year, month, 0).getDate();
  
  // Calculate total grid cells needed (6 rows x 7 days = 42)
  const totalCells = 42;
  
  // Build calendar days array
  const days: Array<{
    date: number;
    isCurrentMonth: boolean;
    dateStr: string;
    events: SchoolEvent[];
    isToday: boolean;
  }> = [];
  
  const today = new Date();
  const isCurrentMonthAndYear = 
    today.getFullYear() === year && today.getMonth() === month;
  const todayDate = isCurrentMonthAndYear ? today.getDate() : -1;
  
  // Previous month days
  for (let i = firstDay - 1; i >= 0; i--) {
    const date = daysInPrevMonth - i;
    const dateStr = new Date(year, month - 1, date).toISOString().split('T')[0];
    days.push({
      date,
      isCurrentMonth: false,
      dateStr,
      events: events.filter(e => e.start_date.startsWith(dateStr)),
      isToday: false,
    });
  }
  
  // Current month days
  for (let date = 1; date <= daysInMonth; date++) {
    const dateStr = new Date(year, month, date).toISOString().split('T')[0];
    days.push({
      date,
      isCurrentMonth: true,
      dateStr,
      events: events.filter(e => e.start_date.startsWith(dateStr)),
      isToday: date === todayDate,
    });
  }
  
  // Next month days
  const remainingCells = totalCells - days.length;
  for (let date = 1; date <= remainingCells; date++) {
    const dateStr = new Date(year, month + 1, date).toISOString().split('T')[0];
    days.push({
      date,
      isCurrentMonth: false,
      dateStr,
      events: events.filter(e => e.start_date.startsWith(dateStr)),
      isToday: false,
    });
  }
  
  const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  
  return (
    <div className="card overflow-hidden">
      {/* Week day headers */}
      <div className="grid grid-cols-7 border-b border-gray-700">
        {weekDays.map((day) => (
          <div
            key={day}
            className="text-center text-sm font-medium text-slate-400 py-3 border-r border-gray-700 last:border-r-0"
          >
            {day}
          </div>
        ))}
      </div>
      
      {/* Calendar grid */}
      <div className="grid grid-cols-7">
        {days.map((day, index) => (
          <div
            key={`${day.dateStr}-${index}`}
            className={`min-h-[120px] border-b border-r border-gray-700 last:border-r-0 p-2 ${
              !day.isCurrentMonth ? 'bg-gray-900/50' : ''
            } ${day.isToday ? 'bg-blue-900/20' : ''}`}
          >
            {/* Date number */}
            <div className="flex items-center justify-between mb-2">
              <span
                className={`text-sm font-medium ${
                  day.isCurrentMonth ? 'text-white' : 'text-slate-600'
                } ${day.isToday ? 'bg-blue-600 rounded-full w-6 h-6 flex items-center justify-center' : ''}`}
              >
                {day.date}
              </span>
              {day.events.length > 0 && (
                <span className="text-xs text-slate-500">
                  {day.events.length}
                </span>
              )}
            </div>
            
            {/* Events */}
            <div className="space-y-1">
              {day.events.slice(0, 3).map((event) => (
                <button
                  key={event.id}
                  onClick={() => onEventClick(event)}
                  className="w-full text-left text-xs px-2 py-1 rounded truncate hover:opacity-80 transition-opacity"
                  style={{ backgroundColor: event.color || '#3b82f6' }}
                  title={event.title}
                >
                  {event.title}
                </button>
              ))}
              {day.events.length > 3 && (
                <div className="text-xs text-slate-500 px-2">
                  +{day.events.length - 3} more
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
