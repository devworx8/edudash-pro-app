'use client';

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

interface CAPSTopic {
  id: string;
  grade: string;
  subject: string;
  topic_code: string;
  topic_title: string;
  content_outline: string;
  learning_outcomes: string[];
  term: number;
}

interface Textbook {
  id: string;
  title: string;
  publisher: string;
  grade: string;
  subject: string;
  page_count: number;
  isbn: string | null;
}

interface TextbookContent {
  id: string;
  textbook_id: string;
  title: string;
  chapter_number: number | null;
  content_type: string | null;
  page_start: number;
  page_end: number;
}

export default function CAPSMappingAdmin() {
  const supabase = useMemo(() => createClient(), []);

  // Filters
  const [grade, setGrade] = useState('5');
  const [subject, setSubject] = useState('Geography');

  // Data
  const [topics, setTopics] = useState<CAPSTopic[]>([]);
  const [books, setBooks] = useState<Textbook[]>([]);
  const [content, setContent] = useState<TextbookContent[]>([]);

  // Selections
  const [selectedTopic, setSelectedTopic] = useState<CAPSTopic | null>(null);
  const [selectedBook, setSelectedBook] = useState<Textbook | null>(null);
  const [selectedContent, setSelectedContent] = useState<TextbookContent | null>(null);

  // Form
  const [keyPages, setKeyPages] = useState('');
  const [coverage, setCoverage] = useState(100);
  const [alignment, setAlignment] = useState(5);
  const [primary, setPrimary] = useState(true);
  const [notes, setNotes] = useState('');

  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from('caps_topics')
        .select('*')
        .eq('grade', grade)
        .eq('subject', subject)
        .order('topic_code');
      if (!error && data) setTopics(data as any);
    })();
  }, [supabase, grade, subject]);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from('textbooks')
        .select('*')
        .eq('grade', grade)
        .eq('subject', subject)
        .eq('is_active', true)
        .order('publication_year', { ascending: false });
      if (!error && data) setBooks(data as any);
    })();
  }, [supabase, grade, subject]);

  useEffect(() => {
    if (!selectedBook) return setContent([]);
    (async () => {
      const { data, error } = await supabase
        .from('textbook_content')
        .select('*')
        .eq('textbook_id', selectedBook.id)
        .order('page_start');
      if (!error && data) setContent(data as any);
    })();
  }, [supabase, selectedBook]);

  const createMapping = async () => {
    if (!selectedTopic || !selectedContent) {
      setMessage('Select a CAPS topic and a textbook section first');
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const kp = keyPages
        .split(',')
        .map((v) => parseInt(v.trim()))
        .filter((v) => !isNaN(v));

      const { data: user } = await supabase.auth.getUser();
      const uid = user.user?.id || null;

      const { error } = await supabase.from('caps_textbook_mapping').insert({
        caps_topic_id: selectedTopic.id,
        textbook_content_id: selectedContent.id,
        coverage_percentage: coverage,
        is_primary_reference: primary,
        alignment_score: alignment,
        key_pages: kp,
        status: 'verified',
        verified_by: uid,
        verification_date: new Date().toISOString(),
        verification_notes: notes,
        created_by: uid,
      });
      if (error) throw error;
      setMessage('✅ Mapping created');
      setKeyPages(''); setNotes('');
    } catch (e: any) {
      setMessage(`❌ ${e.message || e}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <h1 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">CAPS Textbook Page Mapping</h1>

      <div className="bg-white dark:bg-gray-800 rounded shadow p-4 mb-6 grid grid-cols-2 gap-4">
        <div>
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-1">Grade</label>
          <select className="w-full border border-gray-300 dark:border-gray-600 rounded p-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white" value={grade} onChange={(e) => setGrade(e.target.value)}>
            {['4','5','6','7','8','9','10','11','12'].map(g => <option key={g} value={g}>Grade {g}</option>)}
          </select>
        </div>
        <div>
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-1">Subject</label>
          <select className="w-full border border-gray-300 dark:border-gray-600 rounded p-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white" value={subject} onChange={(e) => setSubject(e.target.value)}>
            {['Geography','History','Mathematics','English','Afrikaans','Life Sciences','Physical Sciences','Economics','Accounting'].map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6">
        <div className="bg-white dark:bg-gray-800 rounded shadow p-4">
          <h2 className="font-semibold mb-2 text-gray-900 dark:text-white">CAPS Topics ({topics.length})</h2>
          <div className="max-h-96 overflow-y-auto space-y-2">
            {topics.map(t => (
              <button key={t.id} onClick={() => setSelectedTopic(t)} className={`w-full text-left p-3 border rounded transition-colors ${selectedTopic?.id===t.id?'bg-blue-100 dark:bg-blue-900 border-blue-400 dark:border-blue-500':'border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700'}`}>
                <div className="text-sm font-medium text-gray-900 dark:text-white">{t.topic_code}</div>
                <div className="text-sm text-gray-700 dark:text-gray-300">{t.topic_title}</div>
                <div className="text-xs text-gray-500 dark:text-gray-400">Term {t.term}</div>
              </button>
            ))}
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded shadow p-4">
          <h2 className="font-semibold mb-2 text-gray-900 dark:text-white">Textbooks ({books.length})</h2>
          <div className="max-h-96 overflow-y-auto space-y-2">
            {books.map(b => (
              <button key={b.id} onClick={() => setSelectedBook(b)} className={`w-full text-left p-3 border rounded transition-colors ${selectedBook?.id===b.id?'bg-green-100 dark:bg-green-900 border-green-400 dark:border-green-500':'border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700'}`}>
                <div className="text-sm font-medium text-gray-900 dark:text-white">{b.title}</div>
                <div className="text-xs text-gray-500 dark:text-gray-400">{b.publisher}</div>
                <div className="text-xs text-gray-500 dark:text-gray-400">{b.page_count} pages</div>
              </button>
            ))}
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded shadow p-4">
          <h2 className="font-semibold mb-2 text-gray-900 dark:text-white">Chapters/Sections {selectedBook && `(${content.length})`}</h2>
          {selectedBook ? (
            <div className="max-h-96 overflow-y-auto space-y-2">
              {content.map(c => (
                <button key={c.id} onClick={() => setSelectedContent(c)} className={`w-full text-left p-3 border rounded transition-colors ${selectedContent?.id===c.id?'bg-purple-100 dark:bg-purple-900 border-purple-400 dark:border-purple-500':'border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700'}`}>
                  <div className="text-sm font-medium text-gray-900 dark:text-white">Ch {c.chapter_number ?? '-'}: {c.title}</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">Pages {c.page_start}-{c.page_end}</div>
                </button>
              ))}
            </div>
          ) : (
            <p className="text-gray-500 dark:text-gray-400 text-sm">Select a textbook</p>
          )}
        </div>
      </div>

      {selectedTopic && selectedContent && (
        <div className="mt-6 bg-white dark:bg-gray-800 rounded shadow p-4">
          <h2 className="font-semibold mb-4 text-gray-900 dark:text-white">Create Mapping</h2>
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-1">Key Pages (comma separated)</label>
              <input className="w-full border border-gray-300 dark:border-gray-600 rounded p-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white" placeholder="74, 75, 76, 78" value={keyPages} onChange={(e)=>setKeyPages(e.target.value)} />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-1">Coverage %</label>
              <input type="number" min={1} max={100} className="w-full border border-gray-300 dark:border-gray-600 rounded p-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white" value={coverage} onChange={(e)=>setCoverage(parseInt(e.target.value||'0'))} />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-1">Alignment (1-5)</label>
              <input type="number" min={1} max={5} className="w-full border border-gray-300 dark:border-gray-600 rounded p-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white" value={alignment} onChange={(e)=>setAlignment(parseInt(e.target.value||'0'))} />
            </div>
          </div>
          <div className="flex items-center gap-3 mb-4">
            <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300"><input type="checkbox" checked={primary} onChange={(e)=>setPrimary(e.target.checked)} className="rounded" /> Primary reference</label>
          </div>
          <div className="mb-4">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-1">Verification Notes</label>
            <textarea className="w-full border border-gray-300 dark:border-gray-600 rounded p-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white" rows={3} value={notes} onChange={(e)=>setNotes(e.target.value)} />
          </div>
          <button className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 rounded disabled:opacity-60 disabled:cursor-not-allowed transition-colors" onClick={createMapping} disabled={saving}>{saving? 'Creating...' : 'Create Mapping'}</button>
          {message && <div className="mt-3 text-sm text-gray-900 dark:text-white">{message}</div>}
        </div>
      )}
    </div>
  );
}