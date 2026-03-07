'use client';

import { useState, useEffect, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { 
  X, 
  Search,
  UserPlus,
  MessageCircle,
  Users,
  Sparkles,
  ChevronRight,
  GraduationCap,
  User
} from 'lucide-react';
import { DashAIAvatar } from '@/components/dash/DashAIAvatar';

interface Contact {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  avatar_url: string | null;
  role: string | null;
  preschool_name?: string;
}

interface NewChatModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectContact: (contact: Contact) => void;
  onSelectDashAI: () => void;
  onInviteNew: () => void;
  currentUserId: string | null;
  currentUserRole?: string;
  preschoolId?: string;
  organizationId?: string;
}

export function NewChatModal({
  isOpen,
  onClose,
  onSelectContact,
  onSelectDashAI,
  onInviteNew,
  currentUserId,
  currentUserRole,
  preschoolId,
  organizationId,
}: NewChatModalProps) {
  const supabase = createClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'all' | 'teachers' | 'parents' | 'community'>('all');
  const tenantFilter = useMemo(() => {
    const tenantIds = Array.from(
      new Set([preschoolId, organizationId].filter((value): value is string => Boolean(value)))
    );

    if (tenantIds.length === 0) return null;

    return tenantIds
      .flatMap((id) => [`preschool_id.eq.${id}`, `organization_id.eq.${id}`])
      .join(',');
  }, [organizationId, preschoolId]);

  // Fetch contacts based on user role
  useEffect(() => {
    if (!isOpen || !currentUserId) return;

    const fetchContacts = async () => {
      setLoading(true);
      try {
        if (!tenantFilter) {
          setContacts([]);
          return;
        }

        let allContacts: Contact[] = [];

        if (currentUserRole === 'parent') {
          // PRIVACY FIX: Parents see ONLY teachers and principals, NOT other parents
          
          // Get teachers, principals, and admins only
          const { data: schoolStaff } = await supabase
            .from('profiles')
            .select('id, first_name, last_name, email, phone, avatar_url, role')
            .or(tenantFilter)
            .in('role', ['teacher', 'principal', 'admin', 'principal_admin'])
            .neq('id', currentUserId);

          if (schoolStaff) {
            allContacts = [...allContacts, ...schoolStaff.map((t: Contact) => ({ ...t, preschool_name: undefined }))];
          }

          // DO NOT fetch other parents - privacy violation removed
        } else if (
          currentUserRole === 'teacher' ||
          currentUserRole === 'principal' ||
          currentUserRole === 'admin' ||
          currentUserRole === 'principal_admin'
        ) {
          // Teachers/principals see: all parents + all teachers at their school
          const { data: schoolUsers } = await supabase
            .from('profiles')
            .select('id, first_name, last_name, email, phone, avatar_url, role')
            .or(tenantFilter)
            .neq('id', currentUserId);

          if (schoolUsers) {
            allContacts = schoolUsers.map((u: Contact) => ({ ...u, preschool_name: undefined }));
          }
        }

        // Remove duplicates
        const uniqueContacts = allContacts.filter((contact, index, self) =>
          index === self.findIndex(c => c.id === contact.id)
        );

        setContacts(uniqueContacts);
      } catch (err) {
        console.error('Error fetching contacts:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchContacts();
  }, [isOpen, currentUserId, currentUserRole, supabase, tenantFilter]);

  // Filter contacts based on search and tab
  const filteredContacts = useMemo(() => {
    let filtered = contacts;

    // Filter by tab
    if (activeTab === 'teachers') {
      filtered = filtered.filter(
        c =>
          c.role === 'teacher' ||
          c.role === 'principal' ||
          c.role === 'admin' ||
          c.role === 'principal_admin'
      );
    } else if (activeTab === 'parents') {
      filtered = filtered.filter(c => c.role === 'parent');
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(c => {
        const name = `${c.first_name || ''} ${c.last_name || ''}`.toLowerCase();
        const email = (c.email || '').toLowerCase();
        return name.includes(query) || email.includes(query);
      });
    }

    return filtered;
  }, [contacts, searchQuery, activeTab]);

  // Get initials for avatar
  const getInitials = (contact: Contact) => {
    const first = contact.first_name?.[0] || '';
    const last = contact.last_name?.[0] || '';
    return (first + last).toUpperCase() || '?';
  };

  // Get role badge color
  const getRoleBadgeColor = (role: string | null) => {
    switch (role) {
      case 'teacher': return 'rgba(59, 130, 246, 0.3)';
      case 'principal': return 'rgba(168, 85, 247, 0.3)';
      case 'principal_admin': return 'rgba(168, 85, 247, 0.3)';
      case 'admin': return 'rgba(236, 72, 153, 0.3)';
      case 'parent': return 'rgba(34, 197, 94, 0.3)';
      default: return 'rgba(148, 163, 184, 0.3)';
    }
  };

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
      }}
    >
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.7)',
          backdropFilter: 'blur(4px)',
        }}
      />

      {/* Modal - slides up from bottom on mobile */}
      <div
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: 480,
          maxHeight: '85vh',
          background: 'linear-gradient(180deg, #1e293b 0%, #0f172a 100%)',
          borderRadius: '24px 24px 0 0',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderBottom: 'none',
          boxShadow: '0 -20px 60px rgba(0, 0, 0, 0.5)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          animation: 'slideUp 0.3s ease-out',
        }}
      >
        <style>{`
          @keyframes slideUp {
            from { transform: translateY(100%); opacity: 0; }
            to { transform: translateY(0); opacity: 1; }
          }
        `}</style>

        {/* Handle bar */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 8px' }}>
          <div
            style={{
              width: 40,
              height: 4,
              borderRadius: 2,
              background: 'rgba(255, 255, 255, 0.2)',
            }}
          />
        </div>

        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '8px 20px 16px',
          }}
        >
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: 'white' }}>
            New Chat
          </h2>
          <button
            onClick={onClose}
            style={{
              background: 'rgba(255, 255, 255, 0.1)',
              border: 'none',
              borderRadius: 10,
              padding: 8,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <X size={18} color="rgba(255,255,255,0.7)" />
          </button>
        </div>

        {/* Search */}
        <div style={{ padding: '0 20px 12px' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '12px 16px',
              background: 'rgba(255, 255, 255, 0.08)',
              borderRadius: 14,
              border: '1px solid rgba(255, 255, 255, 0.1)',
            }}
          >
            <Search size={18} color="rgba(255,255,255,0.4)" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search contacts..."
              style={{
                flex: 1,
                background: 'transparent',
                border: 'none',
                fontSize: 15,
                color: 'white',
                outline: 'none',
              }}
            />
          </div>
        </div>

        {/* Tabs */}
        <div
          style={{
            display: 'flex',
            gap: 8,
            padding: '0 20px 12px',
            overflowX: 'auto',
          }}
        >
          {[
            { id: 'all' as const, label: 'All', icon: Users },
            { id: 'teachers' as const, label: 'Teachers', icon: GraduationCap },
            { id: 'parents' as const, label: 'Parents', icon: User },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '8px 14px',
                background: activeTab === tab.id 
                  ? 'rgba(59, 130, 246, 0.2)' 
                  : 'rgba(255, 255, 255, 0.05)',
                border: activeTab === tab.id 
                  ? '1px solid rgba(59, 130, 246, 0.4)' 
                  : '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: 20,
                fontSize: 13,
                fontWeight: 600,
                color: activeTab === tab.id ? '#60a5fa' : 'rgba(255,255,255,0.6)',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              <tab.icon size={14} />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Dash AI Quick Action */}
        <div style={{ padding: '0 20px 8px' }}>
          <button
            onClick={() => {
              onSelectDashAI();
              onClose();
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              width: '100%',
              padding: '14px 16px',
              background: 'linear-gradient(135deg, rgba(168, 85, 247, 0.15) 0%, rgba(236, 72, 153, 0.15) 100%)',
              border: '1px solid rgba(168, 85, 247, 0.3)',
              borderRadius: 16,
              cursor: 'pointer',
              textAlign: 'left',
            }}
          >
            <DashAIAvatar size={44} />
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 15, fontWeight: 600, color: 'white' }}>
                  Dash AI
                </span>
                <Sparkles size={14} color="#f59e0b" />
              </div>
              <p style={{ margin: 0, fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>
                AI assistant for lesson planning & grading
              </p>
            </div>
            <ChevronRight size={18} color="rgba(255,255,255,0.4)" />
          </button>
        </div>

        {/* Contacts List */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '8px 20px 20px',
          }}
        >
          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
              <div
                style={{
                  width: 32,
                  height: 32,
                  border: '3px solid rgba(255,255,255,0.1)',
                  borderTopColor: '#3b82f6',
                  borderRadius: '50%',
                  animation: 'spin 0.8s linear infinite',
                }}
              />
              <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </div>
          ) : filteredContacts.length === 0 ? (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 12,
                padding: '40px 20px',
                textAlign: 'center',
              }}
            >
              <Users size={48} color="rgba(255,255,255,0.2)" />
              <p style={{ margin: 0, fontSize: 15, color: 'rgba(255,255,255,0.5)' }}>
                {searchQuery ? 'No contacts found' : 'No contacts yet'}
              </p>
              <p style={{ margin: 0, fontSize: 13, color: 'rgba(255,255,255,0.3)' }}>
                Invite someone to start chatting
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {filteredContacts.map((contact) => (
                <button
                  key={contact.id}
                  onClick={() => {
                    onSelectContact(contact);
                    onClose();
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 14,
                    width: '100%',
                    padding: '12px 14px',
                    background: 'transparent',
                    border: 'none',
                    borderRadius: 14,
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'background 0.2s ease',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'transparent';
                  }}
                >
                  {/* Avatar */}
                  {contact.avatar_url ? (
                    <img
                      src={contact.avatar_url}
                      alt=""
                      style={{
                        width: 48,
                        height: 48,
                        borderRadius: 24,
                        objectFit: 'cover',
                      }}
                    />
                  ) : (
                    <div
                      style={{
                        width: 48,
                        height: 48,
                        borderRadius: 24,
                        background: 'linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 16,
                        fontWeight: 700,
                        color: 'white',
                      }}
                    >
                      {getInitials(contact)}
                    </div>
                  )}

                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span
                        style={{
                          fontSize: 15,
                          fontWeight: 600,
                          color: 'white',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {contact.first_name || ''} {contact.last_name || ''}
                      </span>
                      <span
                        style={{
                          padding: '2px 8px',
                          background: getRoleBadgeColor(contact.role),
                          borderRadius: 10,
                          fontSize: 10,
                          fontWeight: 600,
                          color: 'rgba(255,255,255,0.8)',
                          textTransform: 'capitalize',
                        }}
                      >
                        {contact.role || 'User'}
                      </span>
                    </div>
                    {contact.email && (
                      <p
                        style={{
                          margin: 0,
                          fontSize: 13,
                          color: 'rgba(255,255,255,0.4)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {contact.email}
                      </p>
                    )}
                  </div>

                  {/* Chat icon */}
                  <MessageCircle size={18} color="rgba(255,255,255,0.3)" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Invite New User - Fixed at bottom */}
        <div
          style={{
            padding: '16px 20px',
            borderTop: '1px solid rgba(255, 255, 255, 0.1)',
            background: 'rgba(0, 0, 0, 0.3)',
          }}
        >
          <button
            onClick={() => {
              onInviteNew();
              onClose();
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 10,
              width: '100%',
              padding: '14px 20px',
              background: 'linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)',
              border: 'none',
              borderRadius: 14,
              fontSize: 15,
              fontWeight: 600,
              color: 'white',
              cursor: 'pointer',
            }}
          >
            <UserPlus size={18} />
            Invite New Contact
          </button>
        </div>
      </div>
    </div>
  );
}
