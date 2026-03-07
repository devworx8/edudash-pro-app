'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { 
  X, 
  Mail, 
  Phone, 
  Send, 
  UserPlus, 
  Copy, 
  Check,
  MessageSquare,
  Link as LinkIcon,
  Share2
} from 'lucide-react';

interface InviteContactModalProps {
  isOpen: boolean;
  onClose: () => void;
  preschoolId?: string;
  preschoolName?: string;
  inviterName?: string;
  inviterId?: string;
  inviteRole?: 'parent' | 'teacher' | 'staff' | 'member';
  invitePath?: string;
  inviteCode?: string;
  defaultEmail?: string;
  defaultPhone?: string;
}

type InviteMethod = 'email' | 'sms' | 'link' | 'whatsapp' | 'share';

export function InviteContactModal({
  isOpen,
  onClose,
  preschoolId,
  preschoolName,
  inviterName,
  inviterId,
  inviteRole = 'parent',
  invitePath,
  inviteCode,
  defaultEmail,
  defaultPhone,
}: InviteContactModalProps) {
  const supabase = createClient();
  const [inviteMethod, setInviteMethod] = useState<InviteMethod>('email');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [sending, setSending] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setInviteMethod('email');
    setEmail(defaultEmail || '');
    setPhone(defaultPhone || '');
    setError(null);
    setSuccess(false);
    setCopied(false);
  }, [defaultEmail, defaultPhone, isOpen]);

  const normalizedRole = inviteRole || 'parent';
  const roleLabel = normalizedRole === 'teacher'
    ? 'teacher'
    : normalizedRole === 'staff'
      ? 'staff member'
      : normalizedRole === 'member'
        ? 'member'
        : 'parent';
  const logMetadata = { role: normalizedRole, inviterId };
  const emailPlaceholder = normalizedRole === 'teacher' ? 'teacher@example.com' : 'parent@example.com';

  // Generate invite link
  const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
  const resolvedInvitePath = invitePath
    || (normalizedRole === 'teacher'
      ? '/sign-up/teacher'
      : '/sign-up/parent');
  const inviteLink = (() => {
    if (!baseUrl) {
      if (inviteCode) {
        return `${resolvedInvitePath}?invite=${encodeURIComponent(inviteCode)}`;
      }
      return resolvedInvitePath;
    }

    const url = new URL(resolvedInvitePath, baseUrl);
    if (inviteCode) {
      url.searchParams.set('invite', inviteCode);
    }
    if (preschoolId) {
      url.searchParams.set('ref', preschoolId);
    }
    url.searchParams.set('invited', 'true');
    return url.toString();
  })();

  const inviteMessage = `Hi! ${inviterName || 'Someone'} invited you to join ${preschoolName || 'EduDash Pro'} as a ${roleLabel}. Sign up here: ${inviteLink}`;
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  const handleSendEmail = async () => {
    if (!email.trim()) {
      setError('Please enter an email address');
      return;
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setError('Please enter a valid email address');
      return;
    }

    setSending(true);
    setError(null);

    try {
      // Check if user already exists
      const { data: existingUser } = await supabase
        .from('profiles')
        .select('id, email, first_name, last_name')
        .eq('email', email.toLowerCase())
        .maybeSingle();

      if (existingUser) {
        setError(`This user is already registered as ${existingUser.first_name || ''} ${existingUser.last_name || ''}. You can find them in your contacts.`);
        setSending(false);
        return;
      }

      // Log the invite
      await supabase.from('invite_logs').insert({
        preschool_id: preschoolId,
        invite_type: 'email',
        invite_target: email.toLowerCase(),
        invite_link: inviteLink,
        status: 'sent',
        sender_id: inviterId,
        metadata: logMetadata,
      }).then(() => {}).catch(() => {}); // Silent fail for logging

      // Send invite email via API
      const response = await fetch('/api/invites/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'email',
          email: email.toLowerCase(),
          inviteLink,
          preschoolName,
          inviterName,
          inviteRole: normalizedRole,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to send invite');
      }

      setSuccess(true);
      setEmail('');
      setTimeout(() => {
        setSuccess(false);
        onClose();
      }, 2000);
    } catch (err: any) {
      console.error('Error sending invite:', err);
      setError(err.message || 'Failed to send invite. Please try again.');
    } finally {
      setSending(false);
    }
  };

  const handleSendSMS = async () => {
    if (!phone.trim()) {
      setError('Please enter a phone number');
      return;
    }

    // Basic phone validation (South African format)
    const cleanPhone = phone.replace(/\s+/g, '').replace(/^0/, '+27');
    
    setSending(true);
    setError(null);

    try {
      // Check if user already exists with this phone
      const { data: existingUser } = await supabase
        .from('profiles')
        .select('id, phone, first_name, last_name')
        .eq('phone', cleanPhone)
        .maybeSingle();

      if (existingUser) {
        setError(`This phone number is already registered to ${existingUser.first_name || ''} ${existingUser.last_name || ''}. You can find them in your contacts.`);
        setSending(false);
        return;
      }

      // Log the invite
      await supabase.from('invite_logs').insert({
        preschool_id: preschoolId,
        invite_type: 'sms',
        invite_target: cleanPhone,
        invite_link: inviteLink,
        status: 'sent',
        sender_id: inviterId,
        metadata: logMetadata,
      }).then(() => {}).catch(() => {});

      // For SMS, we'll open the native SMS app with pre-filled message
      const smsLink = `sms:${cleanPhone}?body=${encodeURIComponent(inviteMessage)}`;
      window.open(smsLink, '_blank');

      setSuccess(true);
      setPhone('');
      setTimeout(() => {
        setSuccess(false);
      }, 2000);
    } catch (err: any) {
      console.error('Error sending SMS invite:', err);
      setError(err.message || 'Failed to prepare SMS. Please try again.');
    } finally {
      setSending(false);
    }
  };

  const handleWhatsApp = () => {
    const cleanPhone = phone.replace(/\s+/g, '').replace(/^0/, '27');
    const waLink = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(inviteMessage)}`;
    window.open(waLink, '_blank');
    
    // Log the invite
    supabase.from('invite_logs').insert({
      preschool_id: preschoolId,
      invite_type: 'whatsapp',
      invite_target: cleanPhone,
      invite_link: inviteLink,
      status: 'sent',
      sender_id: inviterId,
      metadata: logMetadata,
    }).then(() => {}).catch(() => {});
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(inviteLink);
      setCopied(true);
      
      // Log the invite
      supabase.from('invite_logs').insert({
        preschool_id: preschoolId,
        invite_type: 'link',
        invite_target: 'clipboard',
        invite_link: inviteLink,
        status: 'copied',
        sender_id: inviterId,
        metadata: logMetadata,
      }).then(() => {}).catch(() => {});

      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const handleShare = async () => {
    if (!canShare) {
      await handleCopyLink();
      return;
    }

    try {
      await navigator.share({
        title: `${preschoolName || 'EduDash Pro'} Invite`,
        text: inviteMessage,
        url: inviteLink,
      });

      supabase.from('invite_logs').insert({
        preschool_id: preschoolId,
        invite_type: 'share',
        invite_target: 'share-sheet',
        invite_link: inviteLink,
        status: 'sent',
        sender_id: inviterId,
        metadata: logMetadata,
      }).then(() => {}).catch(() => {});

      setSuccess(true);
      setTimeout(() => {
        setSuccess(false);
        onClose();
      }, 2000);
    } catch (err) {
      // Ignore share sheet cancellations
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
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
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

      {/* Modal */}
      <div
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: 420,
          background: 'linear-gradient(180deg, #1e293b 0%, #0f172a 100%)',
          borderRadius: 20,
          border: '1px solid rgba(255, 255, 255, 0.1)',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '20px 24px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 12,
                background: 'linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <UserPlus size={20} color="white" />
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'white' }}>
                Invite {roleLabel}
              </h2>
              <p style={{ margin: 0, fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>
                Invite a {roleLabel} to join {preschoolName || 'EduDash Pro'}
              </p>
            </div>
          </div>
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

        {/* Method Tabs */}
        <div
          style={{
            display: 'flex',
            gap: 8,
            padding: '16px 24px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          }}
        >
          {[
            { id: 'email' as InviteMethod, icon: Mail, label: 'Email' },
            { id: 'sms' as InviteMethod, icon: Phone, label: 'SMS' },
            { id: 'whatsapp' as InviteMethod, icon: MessageSquare, label: 'WhatsApp' },
            { id: 'link' as InviteMethod, icon: LinkIcon, label: 'Copy Link' },
            ...(canShare ? [{ id: 'share' as InviteMethod, icon: Share2, label: 'Share' }] : []),
          ].map((method) => (
            <button
              key={method.id}
              onClick={() => {
                setInviteMethod(method.id);
                setError(null);
              }}
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 4,
                padding: '12px 8px',
                background: inviteMethod === method.id 
                  ? 'linear-gradient(135deg, rgba(59, 130, 246, 0.3) 0%, rgba(139, 92, 246, 0.3) 100%)' 
                  : 'rgba(255, 255, 255, 0.05)',
                border: inviteMethod === method.id 
                  ? '1px solid rgba(59, 130, 246, 0.5)' 
                  : '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: 12,
                cursor: 'pointer',
                transition: 'all 0.2s ease',
              }}
            >
              <method.icon 
                size={18} 
                color={inviteMethod === method.id ? '#3b82f6' : 'rgba(255,255,255,0.5)'} 
              />
              <span 
                style={{ 
                  fontSize: 11, 
                  fontWeight: 600,
                  color: inviteMethod === method.id ? 'white' : 'rgba(255,255,255,0.6)' 
                }}
              >
                {method.label}
              </span>
            </button>
          ))}
        </div>

        {/* Content */}
        <div style={{ padding: '20px 24px' }}>
          {success ? (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 12,
                padding: '24px 0',
              }}
            >
              <div
                style={{
                  width: 60,
                  height: 60,
                  borderRadius: 30,
                  background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Check size={28} color="white" />
              </div>
              <p style={{ margin: 0, fontSize: 16, fontWeight: 600, color: 'white' }}>
                Invite Sent!
              </p>
            </div>
          ) : (
            <>
              {inviteMethod === 'email' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div>
                    <label
                      style={{
                        display: 'block',
                        fontSize: 13,
                        fontWeight: 600,
                        color: 'rgba(255,255,255,0.7)',
                        marginBottom: 8,
                      }}
                    >
                      Email Address
                    </label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder={emailPlaceholder}
                      style={{
                        width: '100%',
                        padding: '14px 16px',
                        background: 'rgba(255, 255, 255, 0.08)',
                        border: '1px solid rgba(255, 255, 255, 0.15)',
                        borderRadius: 12,
                        fontSize: 15,
                        color: 'white',
                        outline: 'none',
                      }}
                    />
                  </div>
                  <button
                    onClick={handleSendEmail}
                    disabled={sending || !email.trim()}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 8,
                      width: '100%',
                      padding: '14px 20px',
                      background: sending || !email.trim()
                        ? 'rgba(255, 255, 255, 0.1)'
                        : 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                      border: 'none',
                      borderRadius: 12,
                      fontSize: 15,
                      fontWeight: 600,
                      color: 'white',
                      cursor: sending || !email.trim() ? 'not-allowed' : 'pointer',
                      opacity: sending || !email.trim() ? 0.5 : 1,
                    }}
                  >
                    {sending ? (
                      <>
                        <div className="spinner" style={{ width: 18, height: 18 }} />
                        Sending...
                      </>
                    ) : (
                      <>
                        <Send size={18} />
                        Send Email Invite
                      </>
                    )}
                  </button>
                </div>
              )}

              {inviteMethod === 'sms' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div>
                    <label
                      style={{
                        display: 'block',
                        fontSize: 13,
                        fontWeight: 600,
                        color: 'rgba(255,255,255,0.7)',
                        marginBottom: 8,
                      }}
                    >
                      Phone Number
                    </label>
                    <input
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="082 123 4567"
                      style={{
                        width: '100%',
                        padding: '14px 16px',
                        background: 'rgba(255, 255, 255, 0.08)',
                        border: '1px solid rgba(255, 255, 255, 0.15)',
                        borderRadius: 12,
                        fontSize: 15,
                        color: 'white',
                        outline: 'none',
                      }}
                    />
                  </div>
                  <button
                    onClick={handleSendSMS}
                    disabled={sending || !phone.trim()}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 8,
                      width: '100%',
                      padding: '14px 20px',
                      background: sending || !phone.trim()
                        ? 'rgba(255, 255, 255, 0.1)'
                        : 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
                      border: 'none',
                      borderRadius: 12,
                      fontSize: 15,
                      fontWeight: 600,
                      color: 'white',
                      cursor: sending || !phone.trim() ? 'not-allowed' : 'pointer',
                      opacity: sending || !phone.trim() ? 0.5 : 1,
                    }}
                  >
                    <Phone size={18} />
                    Open SMS App
                  </button>
                </div>
              )}

              {inviteMethod === 'whatsapp' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div>
                    <label
                      style={{
                        display: 'block',
                        fontSize: 13,
                        fontWeight: 600,
                        color: 'rgba(255,255,255,0.7)',
                        marginBottom: 8,
                      }}
                    >
                      WhatsApp Number
                    </label>
                    <input
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="082 123 4567"
                      style={{
                        width: '100%',
                        padding: '14px 16px',
                        background: 'rgba(255, 255, 255, 0.08)',
                        border: '1px solid rgba(255, 255, 255, 0.15)',
                        borderRadius: 12,
                        fontSize: 15,
                        color: 'white',
                        outline: 'none',
                      }}
                    />
                  </div>
                  <button
                    onClick={handleWhatsApp}
                    disabled={!phone.trim()}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 8,
                      width: '100%',
                      padding: '14px 20px',
                      background: !phone.trim()
                        ? 'rgba(255, 255, 255, 0.1)'
                        : 'linear-gradient(135deg, #25D366 0%, #128C7E 100%)',
                      border: 'none',
                      borderRadius: 12,
                      fontSize: 15,
                      fontWeight: 600,
                      color: 'white',
                      cursor: !phone.trim() ? 'not-allowed' : 'pointer',
                      opacity: !phone.trim() ? 0.5 : 1,
                    }}
                  >
                    <MessageSquare size={18} />
                    Open WhatsApp
                  </button>
                </div>
              )}

              {inviteMethod === 'link' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div>
                    <label
                      style={{
                        display: 'block',
                        fontSize: 13,
                        fontWeight: 600,
                        color: 'rgba(255,255,255,0.7)',
                        marginBottom: 8,
                      }}
                    >
                      Invite Link
                    </label>
                    <div
                      style={{
                        padding: '14px 16px',
                        background: 'rgba(255, 255, 255, 0.08)',
                        border: '1px solid rgba(255, 255, 255, 0.15)',
                        borderRadius: 12,
                        fontSize: 13,
                        color: 'rgba(255,255,255,0.7)',
                        wordBreak: 'break-all',
                      }}
                    >
                      {inviteLink}
                    </div>
                  </div>
                  <button
                    onClick={handleCopyLink}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 8,
                      width: '100%',
                      padding: '14px 20px',
                      background: copied
                        ? 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)'
                        : 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)',
                      border: 'none',
                      borderRadius: 12,
                      fontSize: 15,
                      fontWeight: 600,
                      color: 'white',
                      cursor: 'pointer',
                    }}
                  >
                    {copied ? (
                      <>
                        <Check size={18} />
                        Copied!
                      </>
                    ) : (
                      <>
                        <Copy size={18} />
                        Copy Link
                      </>
                    )}
                  </button>
                </div>
              )}

              {inviteMethod === 'share' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div>
                    <label
                      style={{
                        display: 'block',
                        fontSize: 13,
                        fontWeight: 600,
                        color: 'rgba(255,255,255,0.7)',
                        marginBottom: 8,
                      }}
                    >
                      Share Invite
                    </label>
                    <div
                      style={{
                        padding: '14px 16px',
                        background: 'rgba(255, 255, 255, 0.08)',
                        border: '1px solid rgba(255, 255, 255, 0.15)',
                        borderRadius: 12,
                        fontSize: 13,
                        color: 'rgba(255,255,255,0.7)',
                        wordBreak: 'break-word',
                      }}
                    >
                      {inviteMessage}
                    </div>
                  </div>
                  <button
                    onClick={handleShare}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 8,
                      width: '100%',
                      padding: '14px 20px',
                      background: 'linear-gradient(135deg, #0ea5e9 0%, #6366f1 100%)',
                      border: 'none',
                      borderRadius: 12,
                      fontSize: 15,
                      fontWeight: 600,
                      color: 'white',
                      cursor: 'pointer',
                    }}
                  >
                    <Share2 size={18} />
                    Open Share Sheet
                  </button>
                </div>
              )}

              {error && (
                <div
                  style={{
                    marginTop: 12,
                    padding: '12px 16px',
                    background: 'rgba(239, 68, 68, 0.15)',
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                    borderRadius: 10,
                    fontSize: 13,
                    color: '#f87171',
                  }}
                >
                  {error}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '16px 24px',
            borderTop: '1px solid rgba(255, 255, 255, 0.08)',
            background: 'rgba(0, 0, 0, 0.2)',
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
            alignItems: 'stretch',
          }}
        >
          <button
            type="button"
            onClick={onClose}
            style={{
              width: '100%',
              padding: '12px 20px',
              background: 'linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)',
              border: 'none',
              borderRadius: 12,
              fontSize: 15,
              fontWeight: 600,
              color: 'white',
              cursor: 'pointer',
            }}
          >
            Done
          </button>
          <p
            style={{
              margin: 0,
              fontSize: 12,
              color: 'rgba(255,255,255,0.4)',
              textAlign: 'center',
            }}
          >
            The invited user will be able to join your school after signing up
          </p>
        </div>
      </div>
    </div>
  );
}
