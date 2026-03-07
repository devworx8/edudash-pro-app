'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Phone, Video, X, Search, User, Loader2 } from 'lucide-react';

interface Contact {
  id: string;
  first_name: string | null;
  last_name: string | null;
  role: string | null;
}

interface QuickCallModalProps {
  isOpen: boolean;
  onClose: () => void;
  onVoiceCall: (userId: string, userName: string) => void;
  onVideoCall: (userId: string, userName: string) => void;
  currentUserId?: string;
  preschoolId?: string;
  organizationId?: string;
}

export function QuickCallModal({
  isOpen,
  onClose,
  onVoiceCall,
  onVideoCall,
  currentUserId,
  preschoolId,
  organizationId,
}: QuickCallModalProps) {
  const supabase = createClient();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const tenantFilter = useMemo(() => {
    const tenantIds = Array.from(
      new Set([preschoolId, organizationId].filter((value): value is string => Boolean(value)))
    );

    if (tenantIds.length === 0) return null;

    return tenantIds
      .flatMap((id) => [`preschool_id.eq.${id}`, `organization_id.eq.${id}`])
      .join(',');
  }, [organizationId, preschoolId]);

  // Fetch contacts when modal opens
  // PRIVACY FIX: Parents should only see teachers/principals, not other parents
  const fetchContacts = useCallback(async () => {
    if (!currentUserId || !tenantFilter) {
      setContacts([]);
      return;
    }
    
    setLoading(true);
    try {
      // Get current user's role first
      const { data: currentUser } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', currentUserId)
        .maybeSingle();

      // Determine allowed roles based on current user's role
      let allowedRoles: string[];
      if (currentUser?.role === 'parent') {
        // Parents can ONLY call teachers and principals (NOT other parents)
        allowedRoles = ['teacher', 'principal', 'principal_admin', 'admin'];
      } else if (currentUser?.role === 'teacher') {
        // Teachers can call principals, other teachers, and parents
        allowedRoles = ['teacher', 'parent', 'principal', 'principal_admin', 'admin'];
      } else {
        // Principals/admins can call everyone
        allowedRoles = ['teacher', 'parent', 'principal', 'principal_admin', 'admin'];
      }
      
      // Fetch profiles from the same preschool (excluding current user)
      const { data, error } = await supabase
        .from('profiles')
        .select('id, first_name, last_name, role')
        .or(tenantFilter)
        .neq('id', currentUserId)
        .in('role', allowedRoles)
        .order('first_name', { ascending: true });
      
      if (error) throw error;
      setContacts(data || []);
    } catch (err) {
      console.error('Error fetching contacts:', err);
      setContacts([]);
    } finally {
      setLoading(false);
    }
  }, [supabase, currentUserId, tenantFilter]);

  useEffect(() => {
    if (isOpen) {
      fetchContacts();
      setSearchQuery('');
      setSelectedContact(null);
    }
  }, [isOpen, fetchContacts]);

  const filteredContacts = contacts.filter(contact => {
    if (!searchQuery) return true;
    const fullName = `${contact.first_name || ''} ${contact.last_name || ''}`.toLowerCase();
    return fullName.includes(searchQuery.toLowerCase());
  });

  const getContactName = (contact: Contact) => {
    const name = `${contact.first_name || ''} ${contact.last_name || ''}`.trim();
    return name || 'Unknown';
  };

  const getInitials = (contact: Contact) => {
    const name = getContactName(contact);
    const parts = name.split(' ').filter(Boolean);
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    }
    return parts[0]?.[0]?.toUpperCase() || '?';
  };

  const getRoleBadgeColor = (role: string | null) => {
    switch (role) {
      case 'teacher':
        return { bg: 'rgba(59, 130, 246, 0.15)', text: '#3b82f6' };
      case 'parent':
        return { bg: 'rgba(34, 197, 94, 0.15)', text: '#22c55e' };
      case 'principal':
        return { bg: 'rgba(168, 85, 247, 0.15)', text: '#a855f7' };
      default:
        return { bg: 'rgba(148, 163, 184, 0.15)', text: '#94a3b8' };
    }
  };

  const handleVoiceCall = (contact: Contact) => {
    onVoiceCall(contact.id, getContactName(contact));
    onClose();
  };

  const handleVideoCall = (contact: Contact) => {
    onVideoCall(contact.id, getContactName(contact));
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.6)',
        backdropFilter: 'blur(8px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 420,
          maxHeight: '80vh',
          background: 'linear-gradient(180deg, #1e293b 0%, #0f172a 100%)',
          borderRadius: 20,
          border: '1px solid rgba(255, 255, 255, 0.1)',
          boxShadow: '0 24px 64px rgba(0, 0, 0, 0.4)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '20px 20px 16px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 20,
                background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 4px 12px rgba(34, 197, 94, 0.4)',
              }}
            >
              <Phone size={20} color="white" />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'white' }}>
                Quick Call
              </h3>
              <p style={{ margin: 0, fontSize: 13, color: 'rgba(255, 255, 255, 0.6)' }}>
                Select a contact to call
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              width: 36,
              height: 36,
              borderRadius: 18,
              background: 'rgba(255, 255, 255, 0.1)',
              border: 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              color: 'rgba(255, 255, 255, 0.7)',
              transition: 'all 0.2s ease',
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Search */}
        <div style={{ padding: '16px 20px' }}>
          <div style={{ position: 'relative' }}>
            <input
              type="text"
              placeholder="Search contacts..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                padding: '12px 12px 12px 44px',
                borderRadius: 12,
                border: '1px solid rgba(255, 255, 255, 0.1)',
                background: 'rgba(255, 255, 255, 0.05)',
                color: 'white',
                fontSize: 15,
                outline: 'none',
              }}
            />
            <Search
              size={18}
              style={{
                position: 'absolute',
                left: 14,
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'rgba(255, 255, 255, 0.4)',
              }}
            />
          </div>
        </div>

        {/* Contact List */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '0 12px 16px',
          }}
        >
          {loading ? (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 40,
                gap: 12,
              }}
            >
              <Loader2 size={32} color="#3b82f6" style={{ animation: 'spin 1s linear infinite' }} />
              <p style={{ color: 'rgba(255, 255, 255, 0.6)', fontSize: 14 }}>
                Loading contacts...
              </p>
            </div>
          ) : filteredContacts.length === 0 ? (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 40,
                gap: 12,
              }}
            >
              <User size={40} color="rgba(255, 255, 255, 0.3)" />
              <p style={{ color: 'rgba(255, 255, 255, 0.6)', fontSize: 14, textAlign: 'center' }}>
                {searchQuery ? 'No contacts found' : 'No contacts available'}
              </p>
            </div>
          ) : (
            filteredContacts.map((contact) => {
              const roleColors = getRoleBadgeColor(contact.role);
              return (
                <div
                  key={contact.id}
                  style={{
                    padding: '12px 12px',
                    margin: '4px 0',
                    borderRadius: 14,
                    background: selectedContact?.id === contact.id
                      ? 'rgba(59, 130, 246, 0.15)'
                      : 'rgba(255, 255, 255, 0.03)',
                    border: selectedContact?.id === contact.id
                      ? '1px solid rgba(59, 130, 246, 0.3)'
                      : '1px solid transparent',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                  }}
                  onClick={() => setSelectedContact(contact)}
                  onMouseEnter={(e) => {
                    if (selectedContact?.id !== contact.id) {
                      e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (selectedContact?.id !== contact.id) {
                      e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)';
                    }
                  }}
                >
                  {/* Avatar */}
                  <div
                    style={{
                      width: 48,
                      height: 48,
                      borderRadius: 24,
                      background: 'linear-gradient(135deg, #3b82f6 0%, #6366f1 100%)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'white',
                      fontWeight: 600,
                      fontSize: 16,
                      flexShrink: 0,
                    }}
                  >
                    {getInitials(contact)}
                  </div>

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
                        {getContactName(contact)}
                      </span>
                      {contact.role && (
                        <span
                          style={{
                            fontSize: 10,
                            fontWeight: 600,
                            color: roleColors.text,
                            background: roleColors.bg,
                            padding: '2px 6px',
                            borderRadius: 4,
                            textTransform: 'capitalize',
                          }}
                        >
                          {contact.role}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Call buttons */}
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleVoiceCall(contact);
                      }}
                      style={{
                        width: 44,
                        height: 44,
                        borderRadius: 22,
                        background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
                        border: 'none',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                        boxShadow: '0 4px 12px rgba(34, 197, 94, 0.3)',
                        transition: 'all 0.2s ease',
                      }}
                      title="Voice Call"
                    >
                      <Phone size={18} color="white" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleVideoCall(contact);
                      }}
                      style={{
                        width: 44,
                        height: 44,
                        borderRadius: 22,
                        background: 'linear-gradient(135deg, #3b82f6 0%, #6366f1 100%)',
                        border: 'none',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                        boxShadow: '0 4px 12px rgba(59, 130, 246, 0.3)',
                        transition: 'all 0.2s ease',
                      }}
                      title="Video Call"
                    >
                      <Video size={18} color="white" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer with selected contact actions */}
        {selectedContact && (
          <div
            style={{
              padding: '16px 20px',
              borderTop: '1px solid rgba(255, 255, 255, 0.1)',
              background: 'rgba(0, 0, 0, 0.2)',
              display: 'flex',
              gap: 12,
            }}
          >
            <button
              onClick={() => handleVoiceCall(selectedContact)}
              style={{
                flex: 1,
                padding: '14px 20px',
                borderRadius: 12,
                background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
                border: 'none',
                color: 'white',
                fontSize: 15,
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                boxShadow: '0 4px 16px rgba(34, 197, 94, 0.4)',
                transition: 'transform 0.2s ease',
              }}
            >
              <Phone size={18} />
              Voice Call
            </button>
            <button
              onClick={() => handleVideoCall(selectedContact)}
              style={{
                flex: 1,
                padding: '14px 20px',
                borderRadius: 12,
                background: 'linear-gradient(135deg, #3b82f6 0%, #6366f1 100%)',
                border: 'none',
                color: 'white',
                fontSize: 15,
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                boxShadow: '0 4px 16px rgba(59, 130, 246, 0.4)',
                transition: 'transform 0.2s ease',
              }}
            >
              <Video size={18} />
              Video Call
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
