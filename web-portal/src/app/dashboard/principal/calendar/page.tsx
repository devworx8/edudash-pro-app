'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useUserProfile } from '@/lib/hooks/useUserProfile';
import { useTenantSlug } from '@/lib/tenant/useTenantSlug';
import { PrincipalShell } from '@/components/dashboard/principal/PrincipalShell';
import { Calendar as CalendarIcon, Plus, ChevronLeft, ChevronRight, Filter, Grid, List, Eye } from 'lucide-react';
import { CalendarView } from '@/components/calendar/CalendarView';
import { EventList } from '@/components/calendar/EventList';
import { CreateEventModal } from '@/components/calendar/CreateEventModal';
import { EventDetailsModal } from '@/components/calendar/EventDetailsModal';

export default function PrincipalCalendarPage() {
  const router = useRouter();
  const supabase = createClient();
  const [userId, setUserId] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [events, setEvents] = useState<any[]>([]);
  const [viewMode, setViewMode] = useState<'month' | 'list'>('month');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<any>(null);
  const [filterType, setFilterType] = useState<string>('all');

  const { profile } = useUserProfile(userId);
  const { slug: tenantSlug } = useTenantSlug(userId);
  const preschoolName = profile?.preschoolName;
  const preschoolId = profile?.preschoolId || profile?.organizationId;

  // Initialize auth
  useEffect(() => {
    const initAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push('/sign-in');
        return;
      }
      setUserId(session.user.id);
      setLoading(false);
    };
    initAuth();
  }, [router, supabase]);

  // Load events
  useEffect(() => {
    if (!preschoolId) return;

    const loadEvents = async () => {
      try {
        let query = supabase
          .from('school_events')
          .select(`
            *,
            user_profiles_with_tier!school_events_created_by_fkey(first_name, last_name),
            rsvps:event_rsvps(count)
          `)
          .eq('preschool_id', preschoolId)
          .order('start_date', { ascending: true });

        if (filterType !== 'all') {
          query = query.eq('event_type', filterType);
        }

        const { data, error } = await query;

        if (error) {
          console.error('Error loading events:', error);
          return;
        }

        setEvents(data || []);
      } catch (err) {
        console.error('Failed to load events:', err);
      }
    };

    loadEvents();
  }, [preschoolId, filterType, supabase]);

  // Filter events by current month for calendar view
  const monthEvents = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    return events.filter(event => {
      const eventDate = new Date(event.start_date);
      return eventDate.getFullYear() === year && eventDate.getMonth() === month;
    });
  }, [events, currentDate]);

  const handlePrevMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1));
  };

  const handleNextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1));
  };

  const handleToday = () => {
    setCurrentDate(new Date());
  };

  const handleEventCreated = (newEvent: any) => {
    setEvents([...events, newEvent]);
    setShowCreateModal(false);
  };

  const handleEventUpdated = (updatedEvent: any) => {
    setEvents(events.map(e => e.id === updatedEvent.id ? updatedEvent : e));
    setSelectedEvent(null);
  };

  const handleEventDeleted = (eventId: string) => {
    setEvents(events.filter(e => e.id !== eventId));
    setSelectedEvent(null);
  };

  if (loading) {
    return (
      <PrincipalShell tenantSlug={tenantSlug} preschoolName={preschoolName} preschoolId={preschoolId}>
        <div className="flex items-center justify-center min-h-[400px]">
          <p className="text-slate-400">Loading calendar...</p>
        </div>
      </PrincipalShell>
    );
  }

  const monthName = currentDate.toLocaleString('default', { month: 'long', year: 'numeric' });

  return (
    <PrincipalShell tenantSlug={tenantSlug} preschoolName={preschoolName} preschoolId={preschoolId}>
      <div className="section">
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
          <h1 className="h1">School Calendar</h1>
          <button
            onClick={() => setShowCreateModal(true)}
            className="btn-primary"
            style={{ display: 'flex', alignItems: 'center', gap: 8 }}
          >
            <Plus size={20} />
            <span className="hide-mobile-inline">Create Event</span>
            <span className="show-mobile-inline">Create</span>
          </button>
        </div>

        {/* Controls */}
        <div className="card" style={{ marginBottom: 24 }}>
          <div className="calendar-controls">
            {/* View Toggle */}
            <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
              <button
                onClick={() => setViewMode('month')}
                className={viewMode === 'month' ? 'btn-primary' : 'btn-secondary'}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px' }}
              >
                <Grid size={16} />
                <span className="hide-mobile-inline">Month</span>
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={viewMode === 'list' ? 'btn-primary' : 'btn-secondary'}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px' }}
              >
                <List size={16} />
                <span className="hide-mobile-inline">List</span>
              </button>
            </div>

            {/* Month Navigation */}
            {viewMode === 'month' && (
              <div className="month-navigation">
                <button onClick={handlePrevMonth} className="btn-secondary" style={{ padding: '8px 12px' }}>
                  <ChevronLeft size={16} />
                </button>
                <h2 className="month-title">{monthName}</h2>
                <button onClick={handleNextMonth} className="btn-secondary" style={{ padding: '8px 12px' }}>
                  <ChevronRight size={16} />
                </button>
                <button onClick={handleToday} className="btn-secondary hide-mobile" style={{ padding: '8px 16px' }}>
                  Today
                </button>
              </div>
            )}

            {/* Filter */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 'fit-content' }}>
              <Filter size={16} style={{ color: 'var(--muted)' }} className="hide-mobile-inline" />
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
                className="select"
                style={{ minWidth: 120 }}
              >
                <option value="all">All Events</option>
                <option value="holiday">Holidays</option>
                <option value="parent_meeting">Parent Meetings</option>
                <option value="field_trip">Field Trips</option>
                <option value="assembly">Assemblies</option>
                <option value="sports_day">Sports Days</option>
                <option value="graduation">Graduations</option>
                <option value="fundraiser">Fundraisers</option>
                <option value="donation_drive">Donation Drives</option>
                <option value="other">Other</option>
              </select>
            </div>
          </div>
        </div>

        {/* Calendar or List View */}
        {viewMode === 'month' ? (
          <CalendarView
            events={monthEvents}
            currentDate={currentDate}
            onEventClick={setSelectedEvent}
          />
        ) : (
          <EventList
            events={events}
            onEventClick={setSelectedEvent}
          />
        )}

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginTop: 24 }}>
          <div className="card">
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <CalendarIcon size={24} style={{ color: 'var(--primary)' }} />
              <div>
                <div style={{ fontSize: 24, fontWeight: 600 }}>{events.length}</div>
                <div style={{ fontSize: 14, color: 'var(--muted)' }}>Total Events</div>
              </div>
            </div>
          </div>

          <div className="card">
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <Eye size={24} style={{ color: '#10B981' }} />
              <div>
                <div style={{ fontSize: 24, fontWeight: 600 }}>
                  {events.filter(e => new Date(e.start_date) > new Date()).length}
                </div>
                <div style={{ fontSize: 14, color: 'var(--muted)' }}>Upcoming</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Create Event Modal */}
      {showCreateModal && (
        <CreateEventModal
          preschoolId={preschoolId!}
          onClose={() => setShowCreateModal(false)}
          onEventCreated={handleEventCreated}
        />
      )}

      {/* Event Details Modal */}
      {selectedEvent && (
        <EventDetailsModal
          event={selectedEvent}
          onClose={() => setSelectedEvent(null)}
          onEventUpdated={handleEventUpdated}
          onEventDeleted={handleEventDeleted}
        />
      )}
    </PrincipalShell>
  );
}
