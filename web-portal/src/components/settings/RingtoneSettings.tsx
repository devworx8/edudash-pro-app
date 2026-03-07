'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Bell, Phone, Upload, Volume2, X, Check } from 'lucide-react';
import RingtoneService from '@/lib/services/ringtoneService';
import type { RingtonePreferences, RingtoneType } from '@/lib/types/ringtone';
import { RINGTONE_OPTIONS, DEFAULT_RINGTONE_PREFERENCES } from '@/lib/types/ringtone';

interface RingtoneSettingsProps {
  onClose?: () => void;
}

export default function RingtoneSettings({ onClose }: RingtoneSettingsProps) {
  const [preferences, setPreferences] = useState<RingtonePreferences>(DEFAULT_RINGTONE_PREFERENCES);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingIncoming, setUploadingIncoming] = useState(false);
  const [uploadingOutgoing, setUploadingOutgoing] = useState(false);
  const [previewingType, setPreviewingType] = useState<'incoming' | 'outgoing' | null>(null);
  const fileInputIncomingRef = useRef<HTMLInputElement>(null);
  const fileInputOutgoingRef = useRef<HTMLInputElement>(null);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);

  // Load preferences on mount
  useEffect(() => {
    loadPreferences();
  }, []);

  const loadPreferences = async () => {
    try {
      setLoading(true);
      const prefs = await RingtoneService.getRingtonePreferences();
      setPreferences(prefs);
    } catch (error) {
      console.error('Failed to load ringtone preferences:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdate = async (updates: Partial<RingtonePreferences>) => {
    try {
      setSaving(true);
      const updated = await RingtoneService.updateRingtonePreferences(updates);
      setPreferences(updated);
    } catch (error) {
      console.error('Failed to update ringtone preferences:', error);
      alert('Failed to save settings. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleFileUpload = async (type: 'incoming' | 'outgoing', file: File) => {
    const setUploading = type === 'incoming' ? setUploadingIncoming : setUploadingOutgoing;
    
    try {
      setUploading(true);
      
      // Upload file
      const url = await RingtoneService.uploadCustomRingtone(file);
      
      // Update preferences
      if (type === 'incoming') {
        await handleUpdate({
          incomingRingtone: 'custom',
          incomingCustomUrl: url,
        });
      } else {
        await handleUpdate({
          outgoingRingback: 'custom',
          outgoingCustomUrl: url,
        });
      }
      
      alert('Custom ringtone uploaded successfully!');
    } catch (error: any) {
      console.error('Failed to upload ringtone:', error);
      alert(error.message || 'Failed to upload ringtone');
    } finally {
      setUploading(false);
    }
  };

  const handlePreview = async (type: 'incoming' | 'outgoing') => {
    try {
      // Stop any currently playing preview
      if (previewAudioRef.current) {
        previewAudioRef.current.pause();
        previewAudioRef.current = null;
      }
      
      setPreviewingType(type);
      
      const ringtoneType = type === 'incoming' ? preferences.incomingRingtone : preferences.outgoingRingback;
      const customUrl = type === 'incoming' ? preferences.incomingCustomUrl : preferences.outgoingCustomUrl;
      const volume = type === 'incoming' ? preferences.incomingVolume : preferences.outgoingVolume;
      
      await RingtoneService.previewRingtone(ringtoneType, customUrl, volume);
      
      // Reset preview state after 3 seconds
      setTimeout(() => setPreviewingType(null), 3000);
    } catch (error) {
      console.error('Failed to preview ringtone:', error);
      setPreviewingType(null);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <div className="spinner" />
        <p>Loading ringtone settings...</p>
      </div>
    );
  }

  return (
    <div style={{ 
      maxWidth: '800px', 
      margin: '0 auto', 
      padding: '1.5rem',
      fontFamily: 'system-ui, -apple-system, sans-serif'
    }}>
      {/* Header */}
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'space-between',
        marginBottom: '2rem' 
      }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.75rem', fontWeight: 600, color: 'var(--text-primary)' }}>
            Ringtone Settings
          </h1>
          <p style={{ margin: '0.5rem 0 0', color: 'var(--text-secondary)', fontSize: '0.95rem' }}>
            Customize your call ringtones and sounds
          </p>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            style={{
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              padding: '0.5rem',
              color: 'var(--text-primary)',
            }}
            aria-label="Close"
          >
            <X size={24} />
          </button>
        )}
      </div>

      {/* Incoming Call Ringtone */}
      <section style={{ marginBottom: '2.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
          <Phone size={20} style={{ color: '#10b981' }} />
          <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600, color: 'var(--text-primary)' }}>
            Incoming Call Ringtone
          </h2>
        </div>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '1rem' }}>
          The sound you hear when someone calls you
        </p>

        <div style={{ display: 'grid', gap: '0.75rem' }}>
          {RINGTONE_OPTIONS.map(option => (
            <label
              key={option.type}
              style={{
                display: 'flex',
                alignItems: 'center',
                padding: '1rem',
                border: preferences.incomingRingtone === option.type 
                  ? '2px solid #10b981' 
                  : '1px solid var(--border)',
                borderRadius: '8px',
                cursor: 'pointer',
                transition: 'all 0.2s',
                background: preferences.incomingRingtone === option.type ? 'var(--success-light, #f0fdf4)' : 'var(--surface-1)',
              }}
            >
              <input
                type="radio"
                name="incomingRingtone"
                value={option.type}
                checked={preferences.incomingRingtone === option.type}
                onChange={e => handleUpdate({ incomingRingtone: e.target.value as RingtoneType })}
                style={{ marginRight: '0.75rem' }}
              />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 500, marginBottom: '0.25rem', color: 'var(--text-primary)' }}>
                  {option.label}
                </div>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                  {option.description}
                </div>
              </div>
              {preferences.incomingRingtone === option.type && (
                <Check size={20} style={{ color: '#10b981' }} />
              )}
            </label>
          ))}
        </div>

        {/* Custom upload for incoming */}
        {preferences.incomingRingtone === 'custom' && (
          <div style={{ marginTop: '1rem', padding: '1rem', background: 'var(--surface-2)', borderRadius: '8px' }}>
            <input
              ref={fileInputIncomingRef}
              type="file"
              accept="audio/*"
              onChange={e => {
                const file = e.target.files?.[0];
                if (file) handleFileUpload('incoming', file);
              }}
              style={{ display: 'none' }}
            />
            <button
              onClick={() => fileInputIncomingRef.current?.click()}
              disabled={uploadingIncoming}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.75rem 1rem',
                border: '1px dashed var(--border)',
                borderRadius: '6px',
                background: 'var(--surface-1)',
                cursor: uploadingIncoming ? 'not-allowed' : 'pointer',
                width: '100%',
                justifyContent: 'center',
                opacity: uploadingIncoming ? 0.6 : 1,
                color: 'var(--text-primary)',
              }}
            >
              <Upload size={18} />
              {uploadingIncoming ? 'Uploading...' : 'Upload Custom Ringtone'}
            </button>
            {preferences.incomingCustomUrl && (
              <p style={{ margin: '0.5rem 0 0', fontSize: '0.85rem', color: '#10b981' }}>
                ✓ Custom ringtone uploaded
              </p>
            )}
          </div>
        )}

        {/* Volume control */}
        <div style={{ marginTop: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
            <Volume2 size={18} style={{ color: 'var(--text-secondary)' }} />
            <label style={{ fontSize: '0.9rem', fontWeight: 500, color: 'var(--text-primary)' }}>
              Volume: {Math.round(preferences.incomingVolume * 100)}%
            </label>
          </div>
          <input
            type="range"
            min="0"
            max="100"
            value={preferences.incomingVolume * 100}
            onChange={e => handleUpdate({ incomingVolume: parseInt(e.target.value) / 100 })}
            style={{ width: '100%' }}
          />
        </div>

        {/* Vibration toggle */}
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '1rem', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={preferences.vibrateOnIncoming}
            onChange={e => handleUpdate({ vibrateOnIncoming: e.target.checked })}
          />
          <span style={{ fontSize: '0.95rem', color: 'var(--text-primary)' }}>Vibrate on incoming calls</span>
        </label>

        {/* Preview button */}
        <button
          onClick={() => handlePreview('incoming')}
          disabled={previewingType === 'incoming'}
          style={{
            marginTop: '1rem',
            padding: '0.75rem 1.5rem',
            border: '1px solid #10b981',
            borderRadius: '6px',
            background: 'var(--surface-1)',
            color: '#10b981',
            cursor: previewingType === 'incoming' ? 'not-allowed' : 'pointer',
            fontWeight: 500,
            opacity: previewingType === 'incoming' ? 0.6 : 1,
          }}
        >
          {previewingType === 'incoming' ? 'Playing...' : 'Preview Ringtone'}
        </button>
      </section>

      {/* Outgoing Call Ringback */}
      <section style={{ marginBottom: '2.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
          <Bell size={20} style={{ color: '#3b82f6' }} />
          <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600, color: 'var(--text-primary)' }}>
            Outgoing Call Ringback
          </h2>
        </div>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '1rem' }}>
          The sound you hear while waiting for someone to answer (KRING-KRING)
        </p>

        <div style={{ display: 'grid', gap: '0.75rem' }}>
          {RINGTONE_OPTIONS.map(option => (
            <label
              key={option.type}
              style={{
                display: 'flex',
                alignItems: 'center',
                padding: '1rem',
                border: preferences.outgoingRingback === option.type 
                  ? '2px solid #3b82f6' 
                  : '1px solid var(--border)',
                borderRadius: '8px',
                cursor: 'pointer',
                transition: 'all 0.2s',
                background: preferences.outgoingRingback === option.type ? 'var(--info-light, #eff6ff)' : 'var(--surface-1)',
              }}
            >
              <input
                type="radio"
                name="outgoingRingback"
                value={option.type}
                checked={preferences.outgoingRingback === option.type}
                onChange={e => handleUpdate({ outgoingRingback: e.target.value as RingtoneType })}
                style={{ marginRight: '0.75rem' }}
              />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 500, marginBottom: '0.25rem', color: 'var(--text-primary)' }}>
                  {option.label}
                </div>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                  {option.description}
                </div>
              </div>
              {preferences.outgoingRingback === option.type && (
                <Check size={20} style={{ color: '#3b82f6' }} />
              )}
            </label>
          ))}
        </div>

        {/* Custom upload for outgoing */}
        {preferences.outgoingRingback === 'custom' && (
          <div style={{ marginTop: '1rem', padding: '1rem', background: 'var(--surface-2)', borderRadius: '8px' }}>
            <input
              ref={fileInputOutgoingRef}
              type="file"
              accept="audio/*"
              onChange={e => {
                const file = e.target.files?.[0];
                if (file) handleFileUpload('outgoing', file);
              }}
              style={{ display: 'none' }}
            />
            <button
              onClick={() => fileInputOutgoingRef.current?.click()}
              disabled={uploadingOutgoing}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.75rem 1rem',
                border: '1px dashed var(--border)',
                borderRadius: '6px',
                background: 'var(--surface-1)',
                cursor: uploadingOutgoing ? 'not-allowed' : 'pointer',
                width: '100%',
                justifyContent: 'center',
                opacity: uploadingOutgoing ? 0.6 : 1,
                color: 'var(--text-primary)',
              }}
            >
              <Upload size={18} />
              {uploadingOutgoing ? 'Uploading...' : 'Upload Custom Ringback'}
            </button>
            {preferences.outgoingCustomUrl && (
              <p style={{ margin: '0.5rem 0 0', fontSize: '0.85rem', color: '#3b82f6' }}>
                ✓ Custom ringback uploaded
              </p>
            )}
          </div>
        )}

        {/* Volume control */}
        <div style={{ marginTop: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
            <Volume2 size={18} style={{ color: 'var(--text-secondary)' }} />
            <label style={{ fontSize: '0.9rem', fontWeight: 500, color: 'var(--text-primary)' }}>
              Volume: {Math.round(preferences.outgoingVolume * 100)}%
            </label>
          </div>
          <input
            type="range"
            min="0"
            max="100"
            value={preferences.outgoingVolume * 100}
            onChange={e => handleUpdate({ outgoingVolume: parseInt(e.target.value) / 100 })}
            style={{ width: '100%' }}
          />
        </div>

        {/* Vibration toggle */}
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '1rem', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={preferences.vibrateOnOutgoing}
            onChange={e => handleUpdate({ vibrateOnOutgoing: e.target.checked })}
          />
          <span style={{ fontSize: '0.95rem', color: 'var(--text-primary)' }}>Vibrate when dialing</span>
        </label>

        {/* Preview button */}
        <button
          onClick={() => handlePreview('outgoing')}
          disabled={previewingType === 'outgoing'}
          style={{
            marginTop: '1rem',
            padding: '0.75rem 1.5rem',
            border: '1px solid #3b82f6',
            borderRadius: '6px',
            background: 'var(--surface-1)',
            color: '#3b82f6',
            cursor: previewingType === 'outgoing' ? 'not-allowed' : 'pointer',
            fontWeight: 500,
            opacity: previewingType === 'outgoing' ? 0.6 : 1,
          }}
        >
          {previewingType === 'outgoing' ? 'Playing...' : 'Preview Ringback'}
        </button>
      </section>

      {/* Info note */}
      <div style={{ 
        padding: '1rem', 
        background: 'var(--info-light, #f0f9ff)', 
        border: '1px solid var(--info-border, #bae6fd)', 
        borderRadius: '8px',
        fontSize: '0.9rem',
        color: 'var(--info-text, #075985)'
      }}>
        <strong>Note:</strong> Custom ringtones are stored in your account and will sync across your devices. 
        Supported formats: MP3, WAV, M4A, OGG. Maximum file size: 5MB.
      </div>

      {/* Save indicator */}
      {saving && (
        <div style={{ 
          position: 'fixed', 
          bottom: '2rem', 
          right: '2rem', 
          padding: '1rem 1.5rem',
          background: '#10b981',
          color: 'white',
          borderRadius: '8px',
          boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem'
        }}>
          <div className="spinner" style={{ borderColor: 'white', borderRightColor: 'transparent' }} />
          Saving...
        </div>
      )}
    </div>
  );
}
