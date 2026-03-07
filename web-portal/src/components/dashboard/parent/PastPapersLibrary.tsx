'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { FileText, Download, FileCheck, Search, Filter } from 'lucide-react';

interface PastPaper {
  id: string;
  grade: string;
  subject: string;
  year: number;
  term: number;
  paper_number: number;
  title: string;
  description?: string;
  total_marks: number;
  duration_minutes: number;
  file_url: string;
  memo_file_url?: string;
  tags?: string[];
  download_count: number;
}

export function PastPapersLibrary() {
  const supabase = createClient();
  const [papers, setPapers] = useState<PastPaper[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    grade: 'all',
    subject: 'all',
    year: 'all'
  });
  
  const [searchQuery, setSearchQuery] = useState('');
  
  useEffect(() => {
    fetchPapers();
  }, [filters]);
  
  const fetchPapers = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('past_papers')
        .select('*')
        .eq('is_public', true);
      
      if (filters.grade !== 'all') {
        query = query.eq('grade', filters.grade);
      }
      
      if (filters.subject !== 'all') {
        query = query.eq('subject', filters.subject);
      }
      
      if (filters.year !== 'all') {
        query = query.eq('year', parseInt(filters.year));
      }
      
      const { data, error } = await query.order('year', { ascending: false });
      
      if (error) {
        console.error('[PastPapersLibrary] Error:', error);
      } else {
        setPapers(data || []);
      }
    } catch (err) {
      console.error('[PastPapersLibrary] Exception:', err);
    } finally {
      setLoading(false);
    }
  };
  
  const handleDownload = async (paper: PastPaper) => {
    // Increment download count
    await supabase
      .from('past_papers')
      .update({ download_count: paper.download_count + 1 })
      .eq('id', paper.id);
    
    // Open in new tab
    window.open(paper.file_url, '_blank');
  };
  
  const filteredPapers = papers.filter(paper => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      paper.title.toLowerCase().includes(query) ||
      paper.subject.toLowerCase().includes(query) ||
      paper.description?.toLowerCase().includes(query) ||
      paper.tags?.some(tag => tag.toLowerCase().includes(query))
    );
  });
  
  return (
    <div className="section">
      <div className="sectionTitle">📚 Official Past Papers</div>
      <div style={{ fontSize: 14, color: 'var(--muted)', marginBottom: 'var(--space-4)' }}>
        Download official CAPS exam papers and memorandums for practice
      </div>
      
      {/* Search Bar */}
      <div style={{ marginBottom: 'var(--space-4)' }}>
        <div style={{ position: 'relative' }}>
          <Search 
            className="icon16" 
            style={{ 
              position: 'absolute', 
              left: 12, 
              top: '50%', 
              transform: 'translateY(-50%)',
              color: 'var(--muted)'
            }} 
          />
          <input
            type="text"
            className="input"
            placeholder="🔍 Search papers by title, subject, or topic..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ paddingLeft: 36 }}
          />
        </div>
      </div>
      
      {/* Filters */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
        gap: 'var(--space-3)', 
        marginBottom: 'var(--space-4)' 
      }}>
        <select 
          className="input" 
          value={filters.grade}
          onChange={(e) => setFilters(f => ({ ...f, grade: e.target.value }))}
        >
          <option value="all">All Grades</option>
          <option value="grade_9">Grade 9</option>
          <option value="grade_10">Grade 10</option>
          <option value="grade_11">Grade 11</option>
          <option value="grade_12">Grade 12</option>
        </select>
        
        <select 
          className="input"
          value={filters.subject}
          onChange={(e) => setFilters(f => ({ ...f, subject: e.target.value }))}
        >
          <option value="all">All Subjects</option>
          <option value="Mathematics">Mathematics</option>
          <option value="Physical Sciences">Physical Sciences</option>
          <option value="Life Sciences">Life Sciences</option>
          <option value="Accounting">Accounting</option>
          <option value="Business Studies">Business Studies</option>
          <option value="Economics">Economics</option>
          <option value="English">English</option>
          <option value="Afrikaans">Afrikaans</option>
        </select>
        
        <select 
          className="input"
          value={filters.year}
          onChange={(e) => setFilters(f => ({ ...f, year: e.target.value }))}
        >
          <option value="all">All Years</option>
          <option value="2024">2024</option>
          <option value="2023">2023</option>
          <option value="2022">2022</option>
          <option value="2021">2021</option>
          <option value="2020">2020</option>
        </select>
      </div>
      
      {/* Papers Grid */}
      {loading ? (
        <div style={{ 
          textAlign: 'center', 
          padding: 'var(--space-6)', 
          color: 'var(--muted)' 
        }}>
          Loading past papers...
        </div>
      ) : filteredPapers.length === 0 ? (
        <div 
          className="card" 
          style={{ 
            textAlign: 'center', 
            padding: 'var(--space-6)',
            background: 'var(--surface)'
          }}
        >
          <div style={{ fontSize: 48, marginBottom: 'var(--space-3)' }}>📄</div>
          <div style={{ fontSize: 14, color: 'var(--muted)' }}>
            No past papers found for the selected filters.
            <br />
            Try adjusting your search criteria.
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 'var(--space-3)' }}>
          {filteredPapers.map(paper => (
            <div key={paper.id} className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 'var(--space-3)' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 'var(--space-1)' }}>
                    {paper.title}
                  </div>
                  
                  {paper.description && (
                    <div style={{ 
                      fontSize: 13, 
                      color: 'var(--muted)', 
                      marginBottom: 'var(--space-2)' 
                    }}>
                      {paper.description}
                    </div>
                  )}
                  
                  <div style={{ 
                    fontSize: 13, 
                    color: 'var(--muted)',
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 'var(--space-2)',
                    alignItems: 'center'
                  }}>
                    <span>📊 {paper.total_marks} marks</span>
                    <span>⏱️ {paper.duration_minutes} min</span>
                    <span>📥 {paper.download_count} downloads</span>
                  </div>
                  
                  {paper.tags && paper.tags.length > 0 && (
                    <div style={{ 
                      display: 'flex', 
                      gap: 'var(--space-1)', 
                      marginTop: 'var(--space-2)',
                      flexWrap: 'wrap'
                    }}>
                      {paper.tags.map(tag => (
                        <span 
                          key={tag}
                          style={{
                            fontSize: 11,
                            padding: '4px 8px',
                            background: 'rgba(var(--primary-rgb), 0.1)',
                            color: 'var(--primary)',
                            borderRadius: 'var(--radius-1)',
                            fontWeight: 600
                          }}
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                  <button
                    onClick={() => handleDownload(paper)}
                    className="btn btnPrimary"
                    style={{ 
                      fontSize: 13,
                      whiteSpace: 'nowrap',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6
                    }}
                  >
                    📄 Paper
                  </button>
                  
                  {paper.memo_file_url && (
                    <a
                      href={paper.memo_file_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn"
                      style={{ 
                        fontSize: 13,
                        textDecoration: 'none',
                        whiteSpace: 'nowrap',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 6
                      }}
                    >
                      📋 Memo
                    </a>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
