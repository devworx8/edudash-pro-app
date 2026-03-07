'use client';

import { useState, useEffect } from 'react';
import { BookOpen, Download, Search, Filter, Eye, Bookmark, BookMarked } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

interface DBEBook {
  id: string;
  title: string;
  grade: string;
  subject: string;
  language: string;
  publisher: string;
  isbn?: string;
  cover_url?: string;
  pdf_url: string;
  file_size?: string;
  page_count?: number;
  description?: string;
  caps_approved: boolean;
  publication_year: number;
}

export default function EBooksPage() {
  const [books, setBooks] = useState<DBEBook[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGrade, setSelectedGrade] = useState<string>('all');
  const [selectedSubject, setSelectedSubject] = useState<string>('all');
  const [selectedLanguage, setSelectedLanguage] = useState<string>('all');
  const [bookmarks, setBookmarks] = useState<Set<string>>(new Set());

  const supabase = createClient();

  useEffect(() => {
    loadBooks();
    loadBookmarks();
  }, [selectedGrade, selectedSubject, selectedLanguage]);

  const loadBooks = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('textbooks')
        .select('*')
        .eq('is_active', true)
        .order('grade')
        .order('subject');

      if (selectedGrade !== 'all') {
        query = query.eq('grade', selectedGrade);
      }

      if (selectedSubject !== 'all') {
        query = query.eq('subject', selectedSubject);
      }

      if (selectedLanguage !== 'all') {
        query = query.eq('language', selectedLanguage);
      }

      const { data, error } = await query;

      if (error) throw error;

      setBooks((data as any[]) || []);
    } catch (error) {
      console.error('Error loading books:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadBookmarks = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase
        .from('user_bookmarks')
        .select('textbook_id')
        .eq('user_id', user.id);

      if (data) {
        setBookmarks(new Set(data.map((b: { textbook_id: string }) => b.textbook_id)));
      }
    } catch (error) {
      console.error('Error loading bookmarks:', error);
    }
  };

  const toggleBookmark = async (bookId: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      if (bookmarks.has(bookId)) {
        // Remove bookmark
        await supabase
          .from('user_bookmarks')
          .delete()
          .eq('user_id', user.id)
          .eq('textbook_id', bookId);

        setBookmarks(prev => {
          const next = new Set(prev);
          next.delete(bookId);
          return next;
        });
      } else {
        // Add bookmark
        await supabase
          .from('user_bookmarks')
          .insert({ user_id: user.id, textbook_id: bookId });

        setBookmarks(prev => new Set([...prev, bookId]));
      }
    } catch (error) {
      console.error('Error toggling bookmark:', error);
    }
  };

  const filteredBooks = books.filter(book => {
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      return (
        book.title.toLowerCase().includes(query) ||
        book.subject.toLowerCase().includes(query) ||
        book.publisher.toLowerCase().includes(query)
      );
    }
    return true;
  });

  const openBook = (pdfUrl: string | null) => {
    if (!pdfUrl) {
      alert('📚 This book is currently being prepared. PDF will be available soon!\n\nYou can still use Dash AI to generate practice exams and study materials based on this textbook.');
      return;
    }
    window.open(pdfUrl, '_blank');
  };

  const downloadBook = async (book: DBEBook) => {
    if (!book.pdf_url) {
      alert('📚 PDF download not yet available for this book.\n\nYou can still use it with Dash AI for exam generation!');
      return;
    }
    
    try {
      const response = await fetch(book.pdf_url);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${book.title.replace(/[^a-z0-9]/gi, '_')}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error downloading book:', error);
      alert('Failed to download book. Please try again.');
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--background)',
      padding: '20px',
    }}>
      <div style={{
        maxWidth: '1400px',
        margin: '0 auto',
      }}>
        {/* Header */}
        <div style={{
          marginBottom: '32px',
        }}>
          <h1 style={{
            fontSize: '32px',
            fontWeight: 700,
            marginBottom: '8px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
          }}>
            <BookOpen size={36} color="var(--primary)" />
            DBE E-Book Library
          </h1>
          <p style={{
            fontSize: '16px',
            color: 'var(--muted)',
          }}>
            Access CAPS-approved textbooks for your child's learning
          </p>
        </div>

        {/* Filters */}
        <div style={{
          background: 'var(--surface)',
          borderRadius: '16px',
          padding: '24px',
          marginBottom: '24px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
        }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '16px',
            marginBottom: '16px',
          }}>
            <div>
              <label style={{
                display: 'block',
                fontSize: '14px',
                fontWeight: 500,
                marginBottom: '8px',
              }}>
                Grade
              </label>
              <select
                value={selectedGrade}
                onChange={(e) => setSelectedGrade(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: '8px',
                  border: '2px solid var(--border)',
                  background: 'var(--surface-2)',
                  color: 'var(--text)',
                  fontSize: '14px',
                }}
              >
                <option value="all">All Grades</option>
                {['R', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'].map(g => (
                  <option key={g} value={g}>Grade {g}</option>
                ))}
              </select>
            </div>

            <div>
              <label style={{
                display: 'block',
                fontSize: '14px',
                fontWeight: 500,
                marginBottom: '8px',
              }}>
                Subject
              </label>
              <select
                value={selectedSubject}
                onChange={(e) => setSelectedSubject(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: '8px',
                  border: '2px solid var(--border)',
                  background: 'var(--surface-2)',
                  color: 'var(--text)',
                  fontSize: '14px',
                }}
              >
                <option value="all">All Subjects</option>
                <option value="Mathematics">Mathematics</option>
                <option value="English">English</option>
                <option value="Afrikaans">Afrikaans</option>
                <option value="Geography">Geography</option>
                <option value="History">History</option>
                <option value="Life Sciences">Life Sciences</option>
                <option value="Physical Sciences">Physical Sciences</option>
                <option value="Economics">Economics</option>
                <option value="Accounting">Accounting</option>
              </select>
            </div>

            <div>
              <label style={{
                display: 'block',
                fontSize: '14px',
                fontWeight: 500,
                marginBottom: '8px',
              }}>
                Language
              </label>
              <select
                value={selectedLanguage}
                onChange={(e) => setSelectedLanguage(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: '8px',
                  border: '2px solid var(--border)',
                  background: 'var(--surface-2)',
                  color: 'var(--text)',
                  fontSize: '14px',
                }}
              >
                <option value="all">All Languages</option>
                <option value="en">English</option>
                <option value="af">Afrikaans</option>
                <option value="zu">isiZulu</option>
                <option value="xh">isiXhosa</option>
                <option value="st">Sesotho</option>
                <option value="tn">Setswana</option>
                <option value="nso">Sepedi</option>
              </select>
            </div>
          </div>

          {/* Search */}
          <div style={{ position: 'relative' }}>
            <Search
              size={20}
              style={{
                position: 'absolute',
                left: '12px',
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--muted)',
              }}
            />
            <input
              type="text"
              placeholder="Search books by title, subject, or publisher..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                padding: '12px 12px 12px 44px',
                borderRadius: '8px',
                border: '2px solid var(--border)',
                background: 'var(--surface-2)',
                color: 'var(--text)',
                fontSize: '14px',
              }}
            />
          </div>
        </div>

        {/* Results */}
        {loading ? (
          <div style={{
            textAlign: 'center',
            padding: '60px 20px',
            color: 'var(--muted)',
          }}>
            Loading books...
          </div>
        ) : filteredBooks.length === 0 ? (
          <div style={{
            textAlign: 'center',
            padding: '60px 20px',
            color: 'var(--muted)',
          }}>
            <BookOpen size={48} style={{ opacity: 0.3, marginBottom: '16px' }} />
            <p>No books found. Try adjusting your filters.</p>
          </div>
        ) : (
          <>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '16px',
            }}>
              <p style={{ color: 'var(--muted)', fontSize: '14px' }}>
                {filteredBooks.length} {filteredBooks.length === 1 ? 'book' : 'books'} found
              </p>
            </div>

            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
              gap: '24px',
            }}>
              {filteredBooks.map(book => (
                <div
                  key={book.id}
                  style={{
                    background: 'var(--surface)',
                    borderRadius: '12px',
                    overflow: 'hidden',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                    transition: 'transform 0.2s ease, box-shadow 0.2s ease',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'translateY(-4px)';
                    e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,0.2)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)';
                  }}
                >
                  {/* Cover */}
                  <div style={{
                    height: '200px',
                    background: book.cover_url
                      ? `url(${book.cover_url}) center/cover`
                      : 'linear-gradient(135deg, #7c3aed 0%, #ec4899 100%)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    position: 'relative',
                  }}>
                    {!book.cover_url && (
                      <BookOpen size={64} color="white" style={{ opacity: 0.5 }} />
                    )}
                    {book.caps_approved && (
                      <div style={{
                        position: 'absolute',
                        top: '12px',
                        right: '12px',
                        background: '#10b981',
                        color: 'white',
                        padding: '4px 8px',
                        borderRadius: '6px',
                        fontSize: '11px',
                        fontWeight: 600,
                      }}>
                        CAPS ✓
                      </div>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleBookmark(book.id);
                      }}
                      style={{
                        position: 'absolute',
                        top: '12px',
                        left: '12px',
                        background: 'rgba(0,0,0,0.6)',
                        border: 'none',
                        borderRadius: '50%',
                        width: '36px',
                        height: '36px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                      }}
                    >
                      {bookmarks.has(book.id) ? (
                        <BookMarked size={18} color="#fbbf24" />
                      ) : (
                        <Bookmark size={18} color="white" />
                      )}
                    </button>
                  </div>

                  {/* Info */}
                  <div style={{ padding: '16px' }}>
                    <h3 style={{
                      fontSize: '16px',
                      fontWeight: 600,
                      marginBottom: '8px',
                      lineHeight: 1.3,
                    }}>
                      {book.title}
                    </h3>

                    <div style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: '6px',
                      marginBottom: '12px',
                    }}>
                      <span style={{
                        fontSize: '12px',
                        padding: '4px 8px',
                        borderRadius: '6px',
                        background: 'var(--primary)',
                        color: 'white',
                      }}>
                        Grade {book.grade}
                      </span>
                      <span style={{
                        fontSize: '12px',
                        padding: '4px 8px',
                        borderRadius: '6px',
                        background: 'var(--surface-2)',
                        color: 'var(--text)',
                      }}>
                        {book.subject}
                      </span>
                    </div>

                    <p style={{
                      fontSize: '13px',
                      color: 'var(--muted)',
                      marginBottom: '8px',
                    }}>
                      {book.publisher} • {book.publication_year}
                    </p>

                    {book.page_count && (
                      <p style={{
                        fontSize: '12px',
                        color: 'var(--muted)',
                        marginBottom: '12px',
                      }}>
                        {book.page_count} pages
                        {book.file_size && ` • ${book.file_size}`}
                      </p>
                    )}

                    {/* Actions */}
                    <div style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px',
                    }}>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                          onClick={() => openBook(book.pdf_url)}
                          style={{
                            flex: 1,
                            padding: '10px',
                            borderRadius: '8px',
                            border: 'none',
                            background: book.pdf_url 
                              ? 'linear-gradient(135deg, #7c3aed 0%, #ec4899 100%)'
                              : 'var(--surface-2)',
                            color: book.pdf_url ? 'white' : 'var(--muted)',
                            fontSize: '14px',
                            fontWeight: 600,
                            cursor: book.pdf_url ? 'pointer' : 'not-allowed',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '6px',
                            opacity: book.pdf_url ? 1 : 0.6,
                          }}
                        >
                          <Eye size={16} />
                          {book.pdf_url ? 'Read' : 'Soon'}
                        </button>
                        <button
                          onClick={() => downloadBook(book)}
                          style={{
                            padding: '10px',
                            borderRadius: '8px',
                            border: '2px solid var(--border)',
                            background: 'transparent',
                            color: book.pdf_url ? 'var(--text)' : 'var(--muted)',
                            fontSize: '14px',
                            cursor: book.pdf_url ? 'pointer' : 'not-allowed',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            opacity: book.pdf_url ? 1 : 0.6,
                          }}
                        >
                          <Download size={16} />
                        </button>
                      </div>
                      <button
                        onClick={() => {
                          // Navigate to exam prep with this book's details
                          window.location.href = `/dashboard/parent#exam-prep?book=${book.id}&grade=${book.grade}&subject=${book.subject}`;
                        }}
                        style={{
                          padding: '10px',
                          borderRadius: '8px',
                          border: '2px solid #10b981',
                          background: 'rgba(16, 185, 129, 0.1)',
                          color: '#10b981',
                          fontSize: '13px',
                          fontWeight: 600,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '6px',
                        }}
                      >
                        🤖 Generate Exam from This Book
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
