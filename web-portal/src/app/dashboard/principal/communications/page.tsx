'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useUserProfile } from '@/lib/hooks/useUserProfile';
import { useTenantSlug } from '@/lib/tenant/useTenantSlug';
import { PrincipalShell } from '@/components/dashboard/principal/PrincipalShell';
import { 
  MessageSquare,
  Send,
  Bell,
  Search,
  Plus,
  X,
  Clock,
  Megaphone,
  Mail,
  Phone,
  FileText,
  Calendar,
  ChevronDown,
  Loader2,
  Eye,
} from 'lucide-react';

type TargetAudience = 'all' | 'teachers' | 'parents' | 'students';
type PriorityLevel = 'low' | 'medium' | 'high' | 'urgent';

interface Announcement {
  id: string;
  title: string;
  content: string;
  priority: PriorityLevel;
  target_audience: TargetAudience;
  is_published: boolean;
  scheduled_for: string | null;
  published_at: string | null;
  created_at: string;
  view_count?: number;
}

interface MessageTemplate {
  id: string;
  name: string;
  subject: string;
  content: string;
  category: string;
}

const TEMPLATES: MessageTemplate[] = [
  {
    id: 'welcome',
    name: 'Welcome New Parent',
    subject: 'Welcome to {school_name}!',
    content: `Dear {parent_name},

Welcome to the {school_name} family! We are thrilled to have {child_name} join our community.

Please find attached important information about our school policies and your child's class schedule.

If you have any questions, don't hesitate to reach out.

Warm regards,
{principal_name}
Principal`,
    category: 'onboarding',
  },
  {
    id: 'event_reminder',
    name: 'Event Reminder',
    subject: 'Reminder: {event_name} - {event_date}',
    content: `Dear Parents,

This is a friendly reminder about our upcoming {event_name} on {event_date} at {event_time}.

Location: {location}

Please ensure your child arrives on time. We look forward to seeing you there!

Best regards,
{school_name}`,
    category: 'events',
  },
  {
    id: 'fee_reminder',
    name: 'Fee Payment Reminder',
    subject: 'School Fees Reminder - {month}',
    content: `Dear {parent_name},

This is a gentle reminder that school fees for {month} are due by {due_date}.

Amount: R{amount}
Reference: {reference}

Please contact the office if you need to discuss payment arrangements.

Thank you for your continued support.

Administration`,
    category: 'finance',
  },
  {
    id: 'sick_policy',
    name: 'Illness Policy Reminder',
    subject: 'Health & Safety: Illness Policy',
    content: `Dear Parents,

As we approach the cold and flu season, please remember our illness policy:

• Children with fever should stay home for 24 hours after fever subsides
• Please notify us if your child has any contagious illness
• Wash hands frequently and teach good hygiene habits

Let's work together to keep all our children healthy!

Thank you,
{school_name}`,
    category: 'health',
  },
  {
    id: 'closure',
    name: 'School Closure Notice',
    subject: 'Important: School Closure - {date}',
    content: `Dear Parents,

Please note that {school_name} will be CLOSED on {date} due to {reason}.

Normal classes will resume on {resume_date}.

Please make alternative arrangements for childcare. We apologize for any inconvenience.

{school_name} Administration`,
    category: 'urgent',
  },
];

const AUDIENCE_OPTIONS: { value: TargetAudience; label: string; icon: string }[] = [
  { value: 'all', label: 'Everyone', icon: '👨‍👩‍👧‍👦' },
  { value: 'parents', label: 'Parents', icon: '👪' },
  { value: 'teachers', label: 'Teachers', icon: '👩‍🏫' },
  { value: 'students', label: 'Students', icon: '🧒' },
];

const PRIORITY_OPTIONS: { value: PriorityLevel; label: string; color: string }[] = [
  { value: 'low', label: 'Low', color: '#6b7280' },
  { value: 'medium', label: 'Medium', color: '#3b82f6' },
  { value: 'high', label: 'High', color: '#f59e0b' },
  { value: 'urgent', label: 'Urgent', color: '#ef4444' },
];

export default function ParentCommunicationsPage() {
  const router = useRouter();
  const supabase = createClient();
  const [userId, setUserId] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [showComposeModal, setShowComposeModal] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [activeTab, setActiveTab] = useState<'inbox' | 'sent' | 'scheduled' | 'drafts'>('sent');
  const [filterPriority, setFilterPriority] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Compose state
  const [composeData, setComposeData] = useState({
    title: '',
    content: '',
    priority: 'medium' as PriorityLevel,
    target_audience: 'all' as TargetAudience,
    send_push: true,
    send_email: false,
    send_sms: false,
    schedule_for: '',
  });

  const { profile } = useUserProfile(userId);
  const { slug: tenantSlug } = useTenantSlug(userId);
  const preschoolName = profile?.preschoolName || 'Your School';
  const preschoolId = profile?.preschoolId || profile?.organizationId;
  const principalName = profile?.firstName && profile?.lastName 
    ? `${profile.firstName} ${profile.lastName}`
    : profile?.firstName || 'Principal';

  useEffect(() => {
    const initAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push('/sign-in');
        return;
      }
      setUserId(session.user.id);
    };
    initAuth();
  }, [router, supabase]);

  const loadAnnouncements = useCallback(async () => {
    if (!preschoolId) return;

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('announcements')
        .select('*')
        .eq('preschool_id', preschoolId)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) {
        console.error('Error loading announcements:', error);
      } else if (data && data.length > 0) {
        const announcementIds = data.map((a: any) => a.id);
        const { data: viewsData } = await supabase
          .from('announcement_views')
          .select('announcement_id')
          .in('announcement_id', announcementIds);

        const viewCounts = viewsData?.reduce((acc: Record<string, number>, view: any) => {
          acc[view.announcement_id] = (acc[view.announcement_id] || 0) + 1;
          return acc;
        }, {} as Record<string, number>) || {};

        setAnnouncements(
          (data || []).map((a: any) => ({ ...a, view_count: viewCounts[a.id] || 0 }))
        );
      } else {
        setAnnouncements([]);
      }
    } catch (err) {
      console.error('Error:', err);
    } finally {
      setLoading(false);
    }
  }, [preschoolId, supabase]);

  useEffect(() => {
    if (preschoolId) {
      loadAnnouncements();
    }
  }, [preschoolId, loadAnnouncements]);

  const handleSelectTemplate = (template: MessageTemplate) => {
    // Replace placeholders with actual values
    let subject = template.subject;
    let content = template.content;

    const replacements: Record<string, string> = {
      '{school_name}': preschoolName,
      '{principal_name}': principalName,
      '{parent_name}': '[Parent Name]',
      '{child_name}': '[Child Name]',
      '{event_name}': '[Event Name]',
      '{event_date}': '[Date]',
      '{event_time}': '[Time]',
      '{location}': '[Location]',
      '{month}': new Date().toLocaleString('en-ZA', { month: 'long' }),
      '{due_date}': '[Due Date]',
      '{amount}': '[Amount]',
      '{reference}': '[Reference]',
      '{date}': '[Date]',
      '{reason}': '[Reason]',
      '{resume_date}': '[Resume Date]',
    };

    Object.entries(replacements).forEach(([key, value]) => {
      subject = subject.replace(new RegExp(key, 'g'), value);
      content = content.replace(new RegExp(key, 'g'), value);
    });

    setComposeData(prev => ({
      ...prev,
      title: subject,
      content: content,
    }));
    setShowTemplates(false);
  };

  const handleSendAnnouncement = async () => {
    if (!preschoolId || !userId || !composeData.title.trim() || !composeData.content.trim()) return;

    setSending(true);
    try {
      const isScheduled = composeData.schedule_for && new Date(composeData.schedule_for) > new Date();

      const { error } = await supabase
        .from('announcements')
        .insert({
          preschool_id: preschoolId,
          author_id: userId,
          title: composeData.title,
          content: composeData.content,
          priority: composeData.priority,
          target_audience: composeData.target_audience,
          is_published: !isScheduled,
          scheduled_for: isScheduled ? composeData.schedule_for : null,
          published_at: isScheduled ? null : new Date().toISOString(),
        });

      if (error) throw error;

      // Reset form and reload
      setComposeData({
        title: '',
        content: '',
        priority: 'medium',
        target_audience: 'all',
        send_push: true,
        send_email: false,
        send_sms: false,
        schedule_for: '',
      });
      setShowComposeModal(false);
      loadAnnouncements();
    } catch (err: any) {
      console.error('Error sending announcement:', err);
      alert('Failed to send announcement. Please try again.');
    } finally {
      setSending(false);
    }
  };

  const handleSaveDraft = async () => {
    if (!preschoolId || !userId || !composeData.title.trim()) return;

    try {
      const { error } = await supabase
        .from('announcements')
        .insert({
          preschool_id: preschoolId,
          author_id: userId,
          title: composeData.title,
          content: composeData.content,
          priority: composeData.priority,
          target_audience: composeData.target_audience,
          is_published: false,
          scheduled_for: null,
          published_at: null,
        });

      if (error) throw error;

      setShowComposeModal(false);
      loadAnnouncements();
    } catch (err) {
      console.error('Error saving draft:', err);
    }
  };

  const getAnnouncementStatus = (announcement: Announcement) => {
    if (announcement.is_published) return 'sent' as const;
    if (announcement.scheduled_for) return 'scheduled' as const;
    return 'draft' as const;
  };

  const filteredAnnouncements = announcements.filter(a => {
    const status = getAnnouncementStatus(a);
    // Filter by tab
    if (activeTab === 'sent' && status !== 'sent') return false;
    if (activeTab === 'scheduled' && status !== 'scheduled') return false;
    if (activeTab === 'drafts' && status !== 'draft') return false;

    // Filter by priority
    if (filterPriority !== 'all' && a.priority !== filterPriority) return false;

    // Filter by search
    if (searchQuery && !a.title.toLowerCase().includes(searchQuery.toLowerCase())) return false;

    return true;
  });

  const getPriorityStyle = (priority: string) => {
    const option = PRIORITY_OPTIONS.find(o => o.value === priority);
    return {
      backgroundColor: `${option?.color}20`,
      color: option?.color,
    };
  };

  return (
    <PrincipalShell tenantSlug={tenantSlug} preschoolName={preschoolName} preschoolId={preschoolId} hideRightSidebar={true}>
      <div className="section" style={{ maxWidth: 1200, margin: '0 auto' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
          <div>
            <h1 className="h1" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <MessageSquare size={28} />
              Parent Communications
            </h1>
            <p style={{ color: 'var(--muted)' }}>
              Send announcements and messages to parents
            </p>
          </div>
          <button
            onClick={() => setShowComposeModal(true)}
            className="btn btnPrimary"
            style={{ display: 'flex', alignItems: 'center', gap: 8 }}
          >
            <Plus size={18} />
            New Announcement
          </button>
        </div>

        {/* Stats Cards */}
        <div className="grid4" style={{ marginBottom: 24 }}>
          <div className="card tile">
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ padding: 10, background: '#3b82f620', borderRadius: 8 }}>
                <Send size={20} color="#3b82f6" />
              </div>
              <div>
                <div style={{ fontSize: 24, fontWeight: 700 }}>
                  {announcements.filter(a => getAnnouncementStatus(a) === 'sent').length}
                </div>
                <div style={{ fontSize: 12, color: 'var(--muted)' }}>Sent This Month</div>
              </div>
            </div>
          </div>
          <div className="card tile">
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ padding: 10, background: '#f59e0b20', borderRadius: 8 }}>
                <Clock size={20} color="#f59e0b" />
              </div>
              <div>
                <div style={{ fontSize: 24, fontWeight: 700 }}>
                  {announcements.filter(a => getAnnouncementStatus(a) === 'scheduled').length}
                </div>
                <div style={{ fontSize: 12, color: 'var(--muted)' }}>Scheduled</div>
              </div>
            </div>
          </div>
          <div className="card tile">
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ padding: 10, background: '#6b728020', borderRadius: 8 }}>
                <FileText size={20} color="#6b7280" />
              </div>
              <div>
                <div style={{ fontSize: 24, fontWeight: 700 }}>
                  {announcements.filter(a => getAnnouncementStatus(a) === 'draft').length}
                </div>
                <div style={{ fontSize: 12, color: 'var(--muted)' }}>Drafts</div>
              </div>
            </div>
          </div>
          <div className="card tile">
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ padding: 10, background: '#10b98120', borderRadius: 8 }}>
                <Eye size={20} color="#10b981" />
              </div>
              <div>
                <div style={{ fontSize: 24, fontWeight: 700 }}>
                  {announcements.reduce((sum, a) => sum + (a.view_count || 0), 0)}
                </div>
                <div style={{ fontSize: 12, color: 'var(--muted)' }}>Total Reads</div>
              </div>
            </div>
          </div>
        </div>

        {/* Tabs and Filters */}
        <div className="card" style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
            {/* Tabs */}
            <div style={{ display: 'flex', gap: 4 }}>
              {[
                { key: 'sent', label: 'Sent', icon: Send },
                { key: 'scheduled', label: 'Scheduled', icon: Calendar },
                { key: 'drafts', label: 'Drafts', icon: FileText },
              ].map(tab => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key as any)}
                  style={{
                    padding: '8px 16px',
                    borderRadius: 8,
                    border: 'none',
                    background: activeTab === tab.key ? 'var(--primary)' : 'transparent',
                    color: activeTab === tab.key ? 'white' : 'var(--text)',
                    cursor: 'pointer',
                    fontWeight: 500,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <tab.icon size={16} />
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Filters */}
            <div style={{ display: 'flex', gap: 12 }}>
              <div style={{ position: 'relative' }}>
                <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }} />
                <input
                  type="text"
                  placeholder="Search announcements..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="input"
                  style={{ paddingLeft: 36, width: 200 }}
                />
              </div>
              <select
                value={filterPriority}
                onChange={(e) => setFilterPriority(e.target.value)}
                className="input"
              >
                <option value="all">All Priorities</option>
                {PRIORITY_OPTIONS.map(p => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Announcements List */}
        {loading ? (
          <div className="card" style={{ padding: 48, textAlign: 'center' }}>
            <Loader2 size={32} className="animate-spin" style={{ margin: '0 auto', color: 'var(--muted)' }} />
            <p style={{ color: 'var(--muted)', marginTop: 16 }}>Loading communications...</p>
          </div>
        ) : filteredAnnouncements.length === 0 ? (
          <div className="card" style={{ padding: 48, textAlign: 'center' }}>
            <Megaphone size={48} style={{ margin: '0 auto 16px', color: 'var(--muted)' }} />
            <h3 style={{ marginBottom: 8 }}>No announcements found</h3>
            <p style={{ color: 'var(--muted)', marginBottom: 24 }}>
              {activeTab === 'drafts' 
                ? 'You have no draft messages' 
                : activeTab === 'scheduled'
                ? 'No scheduled announcements'
                : 'Start communicating with parents'}
            </p>
            <button onClick={() => setShowComposeModal(true)} className="btn btnPrimary">
              <Plus size={18} style={{ marginRight: 8 }} />
              Create Announcement
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {filteredAnnouncements.map((announcement) => (
              <div key={announcement.id} className="card" style={{ padding: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                      <span style={{
                        ...getPriorityStyle(announcement.priority),
                        padding: '4px 10px',
                        borderRadius: 12,
                        fontSize: 11,
                        fontWeight: 600,
                        textTransform: 'uppercase',
                      }}>
                        {announcement.priority}
                      </span>
                      <span style={{
                        padding: '4px 10px',
                        borderRadius: 12,
                        fontSize: 11,
                        fontWeight: 600,
                        backgroundColor: getAnnouncementStatus(announcement) === 'sent'
                          ? '#10b98120'
                          : getAnnouncementStatus(announcement) === 'scheduled'
                          ? '#f59e0b20'
                          : '#6b728020',
                        color: getAnnouncementStatus(announcement) === 'sent'
                          ? '#10b981'
                          : getAnnouncementStatus(announcement) === 'scheduled'
                          ? '#f59e0b'
                          : '#6b7280',
                      }}>
                        {getAnnouncementStatus(announcement)}
                      </span>
                    </div>
                    <h3 style={{ fontWeight: 600, marginBottom: 4 }}>{announcement.title}</h3>
                    <p style={{ color: 'var(--muted)', fontSize: 14, lineHeight: 1.5 }}>
                      {announcement.content.substring(0, 150)}
                      {announcement.content.length > 150 ? '...' : ''}
                    </p>
                  </div>
                  <div style={{ textAlign: 'right', marginLeft: 24 }}>
                    <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                      {getAnnouncementStatus(announcement) === 'sent' && announcement.published_at
                        ? `Sent ${new Date(announcement.published_at).toLocaleDateString('en-ZA')}`
                        : getAnnouncementStatus(announcement) === 'scheduled' && announcement.scheduled_for
                        ? `Scheduled for ${new Date(announcement.scheduled_for).toLocaleDateString('en-ZA')}`
                        : `Created ${new Date(announcement.created_at).toLocaleDateString('en-ZA')}`
                      }
                    </div>
                    {announcement.view_count !== undefined && (
                      <div style={{ fontSize: 12, color: '#10b981', marginTop: 4 }}>
                        <Eye size={12} style={{ marginRight: 4, verticalAlign: 'middle' }} />
                        {announcement.view_count} reads
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Compose Modal */}
        {showComposeModal && (
          <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: 20,
          }}>
            <div className="card" style={{ 
              width: '100%', 
              maxWidth: 700, 
              maxHeight: '90vh', 
              overflow: 'auto',
              padding: 24,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
                <h2 style={{ fontSize: 20, fontWeight: 600 }}>New Announcement</h2>
                <button 
                  onClick={() => setShowComposeModal(false)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 8 }}
                >
                  <X size={24} />
                </button>
              </div>

              {/* Templates Button */}
              <div style={{ marginBottom: 20 }}>
                <button
                  onClick={() => setShowTemplates(!showTemplates)}
                  className="btn btnSecondary"
                  style={{ display: 'flex', alignItems: 'center', gap: 8 }}
                >
                  <FileText size={16} />
                  Use Template
                  <ChevronDown size={16} />
                </button>

                {showTemplates && (
                  <div style={{ 
                    marginTop: 12, 
                    border: '1px solid var(--border)', 
                    borderRadius: 8, 
                    maxHeight: 200, 
                    overflow: 'auto' 
                  }}>
                    {TEMPLATES.map(template => (
                      <button
                        key={template.id}
                        onClick={() => handleSelectTemplate(template)}
                        style={{
                          display: 'block',
                          width: '100%',
                          padding: '12px 16px',
                          textAlign: 'left',
                          background: 'none',
                          border: 'none',
                          borderBottom: '1px solid var(--border)',
                          cursor: 'pointer',
                        }}
                      >
                        <div style={{ fontWeight: 500 }}>{template.name}</div>
                        <div style={{ fontSize: 12, color: 'var(--muted)' }}>{template.category}</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Subject */}
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontWeight: 500, marginBottom: 8 }}>Subject *</label>
                <input
                  type="text"
                  value={composeData.title}
                  onChange={(e) => setComposeData(prev => ({ ...prev, title: e.target.value }))}
                  className="input"
                  style={{ width: '100%' }}
                  placeholder="Enter announcement subject"
                />
              </div>

              {/* Content */}
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontWeight: 500, marginBottom: 8 }}>Message *</label>
                <textarea
                  value={composeData.content}
                  onChange={(e) => setComposeData(prev => ({ ...prev, content: e.target.value }))}
                  className="input"
                  style={{ width: '100%', minHeight: 200, resize: 'vertical' }}
                  placeholder="Type your message here..."
                />
              </div>

              {/* Priority & Audience */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                <div>
                  <label style={{ display: 'block', fontWeight: 500, marginBottom: 8 }}>Priority</label>
                  <select
                    value={composeData.priority}
                    onChange={(e) => setComposeData(prev => ({ ...prev, priority: e.target.value as PriorityLevel }))}
                    className="input"
                    style={{ width: '100%' }}
                  >
                    {PRIORITY_OPTIONS.map(p => (
                      <option key={p.value} value={p.value}>{p.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontWeight: 500, marginBottom: 8 }}>Audience</label>
                  <select
                    value={composeData.target_audience}
                    onChange={(e) => setComposeData(prev => ({ ...prev, target_audience: e.target.value as TargetAudience }))}
                    className="input"
                    style={{ width: '100%' }}
                  >
                    {AUDIENCE_OPTIONS.map(a => (
                      <option key={a.value} value={a.value}>{a.icon} {a.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Delivery Options */}
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontWeight: 500, marginBottom: 12 }}>Delivery Methods</label>
                <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={composeData.send_push}
                      onChange={(e) => setComposeData(prev => ({ ...prev, send_push: e.target.checked }))}
                    />
                    <Bell size={16} />
                    Push Notification
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={composeData.send_email}
                      onChange={(e) => setComposeData(prev => ({ ...prev, send_email: e.target.checked }))}
                    />
                    <Mail size={16} />
                    Email
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={composeData.send_sms}
                      onChange={(e) => setComposeData(prev => ({ ...prev, send_sms: e.target.checked }))}
                    />
                    <Phone size={16} />
                    SMS (extra cost)
                  </label>
                </div>
              </div>

              {/* Schedule */}
              <div style={{ marginBottom: 24 }}>
                <label style={{ display: 'block', fontWeight: 500, marginBottom: 8 }}>
                  Schedule (optional)
                </label>
                <input
                  type="datetime-local"
                  value={composeData.schedule_for}
                  onChange={(e) => setComposeData(prev => ({ ...prev, schedule_for: e.target.value }))}
                  className="input"
                  style={{ width: '100%' }}
                />
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
                  Leave empty to send immediately
                </div>
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <button onClick={handleSaveDraft} className="btn btnSecondary">
                  Save as Draft
                </button>
                <div style={{ display: 'flex', gap: 12 }}>
                  <button onClick={() => setShowComposeModal(false)} className="btn btnSecondary">
                    Cancel
                  </button>
                  <button
                    onClick={handleSendAnnouncement}
                    disabled={sending || !composeData.title.trim() || !composeData.content.trim()}
                    className="btn btnPrimary"
                    style={{ display: 'flex', alignItems: 'center', gap: 8 }}
                  >
                    {sending ? (
                      <Loader2 size={18} className="animate-spin" />
                    ) : (
                      <Send size={18} />
                    )}
                    {composeData.schedule_for ? 'Schedule' : 'Send Now'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </PrincipalShell>
  );
}
