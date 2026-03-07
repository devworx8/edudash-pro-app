'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { ParentShell } from '@/components/dashboard/parent/ParentShell';
import { SubPageHeader } from '@/components/dashboard/SubPageHeader';
import {
  Camera, Upload, CheckCircle, Star, Sparkles, Image as ImageIcon,
  BookOpen, Palette, FlaskConical, Music, Dumbbell, Loader2, Trophy, Tag,
} from 'lucide-react';
import { useVisionAnalysis } from '@/lib/hooks/parent/useVisionAnalysis';

const SUBJECTS = [
  { value: 'mathematics', label: '🔢 Mathematics' },
  { value: 'english', label: '📖 English' },
  { value: 'afrikaans', label: '🇿🇦 Afrikaans' },
  { value: 'art', label: '🎨 Art' },
  { value: 'science', label: '🔬 Science' },
  { value: 'physical_education', label: '🏃 Physical Education' },
  { value: 'life_skills', label: '🌱 Life Skills' },
  { value: 'music', label: '🎵 Music' },
  { value: 'reading', label: '📚 Reading' },
  { value: 'writing', label: '✏️ Writing' },
  { value: 'social_skills', label: '🤝 Social Skills' },
  { value: 'other', label: '📋 Other' },
];

const ACHIEVEMENT_LEVELS = [
  { value: 'excellent', label: '🌟 Excellent', color: '#10b981' },
  { value: 'good', label: '👍 Good', color: '#3b82f6' },
  { value: 'improving', label: '📈 Improving', color: '#f59e0b' },
  { value: 'needs_support', label: '🤗 Needs Support', color: '#f97316' },
  { value: 'milestone', label: '🎉 Milestone!', color: '#8b5cf6' },
];

export default function PictureOfProgressPage() {
  const router = useRouter();
  const supabase = createClient();

  const [userId, setUserId] = useState<string>();
  const [children, setChildren] = useState<any[]>([]);
  const [selectedChildId, setSelectedChildId] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [subject, setSubject] = useState('');
  const [achievementLevel, setAchievementLevel] = useState('');
  const [learningArea, setLearningArea] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [uploads, setUploads] = useState<any[]>([]);
  const [loadingUploads, setLoadingUploads] = useState(true);
  const [suggestedTags, setSuggestedTags] = useState<string[]>([]);

  // AI Vision Analysis
  const { analyze, result: visionResult, loading: analyzing } = useVisionAnalysis();

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/sign-in'); return; }
      setUserId(user.id);

      // Check both parent_id and guardian_id (in case user was linked via either)
      const { data: childrenData } = await supabase
        .from('students')
        .select('id, first_name, last_name')
        .or(`parent_id.eq.${user.id},guardian_id.eq.${user.id}`);

      if (childrenData && childrenData.length > 0) {
        setChildren(childrenData);
        setSelectedChildId(childrenData[0].id);
        loadUploads(childrenData.map((c: any) => c.id));
      }
      setLoadingUploads(false);
    };
    init();
  }, []);

  const loadUploads = async (childIds: string[]) => {
    const { data } = await supabase
      .from('pop_uploads')
      .select('*, student:students(first_name, last_name)')
      .in('student_id', childIds)
      .order('created_at', { ascending: false })
      .limit(20);
    if (data) setUploads(data);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    const reader = new FileReader();
    reader.onload = () => setPreview(reader.result as string);
    reader.readAsDataURL(f);

    // Trigger AI vision analysis
    analyze(f, description, subject).then((result) => {
      if (!result) return;
      if (result.suggestedTags?.length) {
        setSuggestedTags((prev) => [...new Set([...prev, ...result.suggestedTags])]);
      }
      if (result.caption && !description.trim()) {
        setDescription(result.caption);
      }
      if (result.suggestedSubject && !subject) {
        setSubject(result.suggestedSubject);
      }
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !userId || !selectedChildId || !title.trim() || !subject) return;

    setSubmitting(true);
    try {
      // Upload file to storage
      const ext = file.name.split('.').pop() || 'jpg';
      const storagePath = `${userId}/pop/${selectedChildId}/${Date.now()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from('pop-uploads')
        .upload(storagePath, file, { contentType: file.type });

      if (uploadError) throw uploadError;

      // Create database record
      const { error: dbError } = await supabase
        .from('pop_uploads')
        .insert({
          student_id: selectedChildId,
          upload_type: 'picture_of_progress',
          title: title.trim(),
          description: description.trim(),
          file_path: storagePath,
          file_name: file.name,
          subject,
          achievement_level: achievementLevel || null,
          learning_area: learningArea.trim() || null,
          uploaded_by: userId,
          tags: suggestedTags.length > 0 ? suggestedTags : null,
          is_milestone: visionResult?.milestoneDetected || false,
          milestone_type: visionResult?.milestoneType || null,
          ai_caption: visionResult?.caption || null,
          ai_insight: visionResult?.developmentalInsight || null,
        });

      if (dbError) throw dbError;

      setSubmitted(true);
      // Reset form
      setTitle('');
      setDescription('');
      setSubject('');
      setAchievementLevel('');
      setLearningArea('');
      setFile(null);
      setPreview('');
      // Refresh uploads
      loadUploads(children.map((c) => c.id));
    } catch (err: any) {
      alert(`Upload failed: ${err.message || 'Unknown error'}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ParentShell hideHeader={true}>
      <div style={{ margin: 'calc(var(--space-3) * -1) calc(var(--space-2) * -1)', padding: 0 }}>
        <SubPageHeader
          title="Picture of Progress"
          subtitle="Upload photos of your child's learning achievements"
          icon={<Camera size={28} color="white" />}
        />

        <div style={{ width: '100%', padding: 20, maxWidth: 800, margin: '0 auto' }}>
          {submitted && (
            <div className="card" style={{
              padding: 20, marginBottom: 20, background: 'rgba(16,185,129,0.1)',
              border: '1px solid rgba(16,185,129,0.3)', display: 'flex', alignItems: 'center', gap: 12,
            }}>
              <CheckCircle size={24} style={{ color: '#10b981', flexShrink: 0 }} />
              <div>
                <p style={{ margin: 0, fontWeight: 600 }}>Progress picture uploaded!</p>
                <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--muted)' }}>
                  This moment has been saved to your child&apos;s learning journey.
                </p>
              </div>
              <button onClick={() => setSubmitted(false)} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}>✕</button>
            </div>
          )}

          {/* Upload Form */}
          <form onSubmit={handleSubmit}>
            <div className="card" style={{ padding: 24, marginBottom: 20 }}>
              <h3 style={{ margin: '0 0 20px', fontSize: 18, fontWeight: 700 }}>📸 New Progress Upload</h3>

              {/* Child selector */}
              {children.length > 1 && (
                <div style={{ marginBottom: 16 }}>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Child</label>
                  <select
                    value={selectedChildId}
                    onChange={(e) => setSelectedChildId(e.target.value)}
                    style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: 14 }}
                  >
                    {children.map((c) => <option key={c.id} value={c.id}>{c.first_name} {c.last_name}</option>)}
                  </select>
                </div>
              )}

              {/* Title */}
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Title *</label>
                <input
                  type="text" value={title} onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g., First time writing their name"
                  required
                  style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: 14 }}
                />
              </div>

              {/* Subject */}
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Subject *</label>
                <select
                  value={subject} onChange={(e) => setSubject(e.target.value)} required
                  style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: 14 }}
                >
                  <option value="">Select a subject</option>
                  {SUBJECTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>

              {/* Achievement Level */}
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Achievement Level</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {ACHIEVEMENT_LEVELS.map((level) => (
                    <button
                      key={level.value} type="button"
                      onClick={() => setAchievementLevel(achievementLevel === level.value ? '' : level.value)}
                      style={{
                        padding: '8px 16px', borderRadius: 10, border: '2px solid',
                        borderColor: achievementLevel === level.value ? level.color : 'var(--border)',
                        background: achievementLevel === level.value ? `${level.color}15` : 'var(--surface)',
                        color: achievementLevel === level.value ? level.color : 'var(--text)',
                        cursor: 'pointer', fontSize: 13, fontWeight: 600, transition: 'all 0.2s',
                      }}
                    >
                      {level.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Learning Area */}
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Learning Area</label>
                <input
                  type="text" value={learningArea} onChange={(e) => setLearningArea(e.target.value)}
                  placeholder='e.g., "Counting to 20", "Letter recognition"'
                  style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: 14 }}
                />
              </div>

              {/* Description */}
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Description *</label>
                <textarea
                  value={description} onChange={(e) => setDescription(e.target.value)}
                  placeholder="What makes you proud of this work? What did your child learn?"
                  required rows={3}
                  style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: 14, resize: 'vertical' }}
                />
              </div>

              {/* File Upload */}
              <div style={{ marginBottom: 20 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Photo *</label>
                {!preview ? (
                  <label style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    border: '2px dashed var(--border)', borderRadius: 16, padding: 40, cursor: 'pointer',
                    background: 'var(--surface)', transition: 'border-color 0.2s',
                  }}>
                    <Upload size={32} style={{ color: 'var(--muted)', marginBottom: 12 }} />
                    <span style={{ fontWeight: 600, marginBottom: 4 }}>Click to upload a photo</span>
                    <span style={{ fontSize: 13, color: 'var(--muted)' }}>JPG, PNG up to 10MB</span>
                    <input type="file" accept="image/*" onChange={handleFileChange} style={{ display: 'none' }} />
                  </label>
                ) : (
                  <div style={{ position: 'relative' }}>
                    <img
                      src={preview} alt="Preview"
                      style={{ width: '100%', maxHeight: 300, objectFit: 'cover', borderRadius: 12 }}
                    />
                    <button
                      type="button" onClick={() => { setFile(null); setPreview(''); setSuggestedTags([]); }}
                      style={{
                        position: 'absolute', top: 8, right: 8,
                        width: 32, height: 32, borderRadius: 16,
                        background: 'rgba(0,0,0,0.6)', border: 'none', color: 'white',
                        cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}
                    >
                      ✕
                    </button>
                    {analyzing && (
                      <div style={{
                        position: 'absolute', bottom: 8, left: 8,
                        background: 'rgba(0,0,0,0.6)', color: 'white', padding: '6px 12px',
                        borderRadius: 20, display: 'flex', alignItems: 'center', gap: 8, fontSize: 13,
                      }}>
                        <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
                        <Sparkles size={14} style={{ color: '#22d3ee' }} />
                        AI analyzing...
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* AI Vision Insights */}
              {visionResult && !analyzing && (
                <div style={{
                  marginBottom: 16, padding: 16, borderRadius: 12,
                  background: 'linear-gradient(135deg, rgba(34,211,238,0.08), rgba(59,130,246,0.08))',
                  border: '1px solid rgba(34,211,238,0.2)',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <Sparkles size={16} style={{ color: '#22d3ee' }} />
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#0891b2' }}>AI Analysis</span>
                  </div>
                  <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>
                    {visionResult.developmentalInsight}
                  </p>
                  {visionResult.milestoneDetected && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8 }}>
                      <Trophy size={14} style={{ color: '#f59e0b' }} />
                      <span style={{ fontSize: 12, fontWeight: 600, color: '#d97706' }}>
                        Milestone detected: {visionResult.milestoneType}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* AI Suggested Tags */}
              {suggestedTags.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                    <Tag size={14} style={{ color: '#22d3ee' }} />
                    <label style={{ fontSize: 13, fontWeight: 600 }}>AI-Suggested Tags</label>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {suggestedTags.map((tag, i) => (
                      <span key={i} style={{
                        fontSize: 11, padding: '4px 10px', borderRadius: 12,
                        background: 'rgba(34,211,238,0.1)', color: '#0891b2', fontWeight: 600,
                      }}>
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <button
                type="submit"
                disabled={submitting || !file || !title.trim() || !subject}
                className="btn btnPrimary"
                style={{
                  width: '100%', padding: '14px 24px', fontSize: 16, fontWeight: 700,
                  opacity: submitting || !file || !title.trim() || !subject ? 0.5 : 1,
                }}
              >
                {submitting ? 'Uploading...' : '📸 Upload Progress Picture'}
              </button>
            </div>
          </form>

          {/* Past Uploads */}
          <div style={{ marginTop: 24 }}>
            <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>📂 Past Uploads</h3>
            {loadingUploads ? (
              <div style={{ textAlign: 'center', padding: 40 }}>
                <div className="spinner" style={{ margin: '0 auto' }} />
              </div>
            ) : uploads.length === 0 ? (
              <div className="card" style={{ textAlign: 'center', padding: 40 }}>
                <ImageIcon size={48} style={{ margin: '0 auto', color: 'var(--muted)', opacity: 0.4 }} />
                <p style={{ color: 'var(--muted)', marginTop: 12 }}>No uploads yet. Capture your child&apos;s first progress picture!</p>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: 16 }}>
                {uploads.map((upload) => {
                  const levelInfo = ACHIEVEMENT_LEVELS.find((l) => l.value === upload.achievement_level);
                  return (
                    <div key={upload.id} className="card" style={{ padding: 16, overflow: 'hidden' }}>
                      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                        <div style={{ width: 64, height: 64, borderRadius: 10, background: 'var(--surface-2)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                          {upload.file_path ? (
                            <ImageIcon size={24} style={{ color: 'var(--muted)' }} />
                          ) : (
                            <ImageIcon size={24} style={{ color: 'var(--muted)' }} />
                          )}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {upload.title}
                          </div>
                          <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>
                            {upload.student?.first_name} {upload.student?.last_name}
                          </div>
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            {upload.subject && (
                              <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 6, background: 'rgba(59,130,246,0.1)', color: '#3b82f6', fontWeight: 600 }}>
                                {SUBJECTS.find((s) => s.value === upload.subject)?.label || upload.subject}
                              </span>
                            )}
                            {levelInfo && (
                              <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 6, background: `${levelInfo.color}15`, color: levelInfo.color, fontWeight: 600 }}>
                                {levelInfo.label}
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6 }}>
                            {new Date(upload.created_at).toLocaleDateString('en-ZA')}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </ParentShell>
  );
}
