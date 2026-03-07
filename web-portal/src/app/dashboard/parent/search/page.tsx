'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { ParentShell } from '@/components/dashboard/parent/ParentShell';
import { Search, FileText, Users, MessageCircle, Calendar, X } from 'lucide-react';

interface SearchResult {
  id: string;
  type: 'homework' | 'child' | 'message' | 'event';
  title: string;
  subtitle?: string;
  href: string;
  date?: string;
}

function SearchContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const query = searchParams?.get('q') || '';
  
  const supabase = createClient();
  const [userId, setUserId] = useState<string>();
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchValue, setSearchValue] = useState(query);

  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) setUserId(session.user.id);
    };
    init();
  }, [supabase]);

  useEffect(() => {
    if (query && userId) {
      performSearch(query);
    }
  }, [query, userId]);

  const performSearch = async (searchQuery: string) => {
    if (!searchQuery.trim() || !userId) return;
    
    setLoading(true);
    const results: SearchResult[] = [];

    try {
      // Get user's children
      const { data: children } = await supabase
        .from('students')
        .select('id, first_name, last_name, grade, preschool_id, class_id')
        .or(`parent_id.eq.${userId},guardian_id.eq.${userId}`);

      if (!children || children.length === 0) {
        setResults([]);
        setLoading(false);
        return;
      }

      const childIds = children.map((c: any) => c.id);
      const preschoolIds = [...new Set(children.map((c: any) => c.preschool_id).filter(Boolean))];
      const classIds = [...new Set(children.map((c: any) => c.class_id).filter(Boolean))];

      // Search children
      const matchingChildren = children.filter((child: any) =>
        `${child.first_name} ${child.last_name}`.toLowerCase().includes(searchQuery.toLowerCase()) ||
        child.grade?.toLowerCase().includes(searchQuery.toLowerCase())
      );

      matchingChildren.forEach((child: any) => {
        results.push({
          id: child.id,
          type: 'child',
          title: `${child.first_name} ${child.last_name}`,
          subtitle: child.grade || 'No grade assigned',
          href: `/dashboard/parent/children?child=${child.id}`,
        });
      });

      // Search homework
      if (classIds.length > 0) {
        const { data: homework } = await supabase
          .from('homework_assignments')
          .select('id, title, description, due_date, class_id')
          .in('class_id', classIds)
          .eq('is_published', true)
          .ilike('title', `%${searchQuery}%`)
          .order('due_date', { ascending: false })
          .limit(10);

        homework?.forEach((hw: any) => {
          results.push({
            id: hw.id,
            type: 'homework',
            title: hw.title,
            subtitle: `Due: ${new Date(hw.due_date).toLocaleDateString()}`,
            href: `/dashboard/parent/homework/${hw.id}`,
            date: hw.due_date,
          });
        });
      }

      // Search messages (if organization-linked)
      if (preschoolIds.length > 0) {
        const { data: messages } = await supabase
          .from('messages')
          .select('id, subject, content, created_at, sender_id')
          .in('preschool_id', preschoolIds)
          .or(`recipient_id.eq.${userId},sender_id.eq.${userId}`)
          .or(`subject.ilike.%${searchQuery}%,content.ilike.%${searchQuery}%`)
          .order('created_at', { ascending: false })
          .limit(10);

        messages?.forEach((msg: any) => {
          results.push({
            id: msg.id,
            type: 'message',
            title: msg.subject || 'No subject',
            subtitle: new Date(msg.created_at).toLocaleDateString(),
            href: `/dashboard/parent/messages?id=${msg.id}`,
            date: msg.created_at,
          });
        });
      }

      setResults(results);
    } catch (error) {
      console.error('Search error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchValue.trim()) {
      router.push(`/dashboard/parent/search?q=${encodeURIComponent(searchValue.trim())}`);
    }
  };

  const getIcon = (type: SearchResult['type']) => {
    switch (type) {
      case 'homework': return FileText;
      case 'child': return Users;
      case 'message': return MessageCircle;
      case 'event': return Calendar;
    }
  };

  const getColor = (type: SearchResult['type']) => {
    switch (type) {
      case 'homework': return '#f59e0b';
      case 'child': return '#8b5cf6';
      case 'message': return '#06b6d4';
      case 'event': return '#10b981';
    }
  };

  return (
    <ParentShell>
      <div className="container" style={{ maxWidth: 800, margin: '0 auto', padding: 'var(--space-4)' }}>
        {/* Search Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
          <button
            onClick={() => router.back()}
            className="iconBtn"
            aria-label="Go back"
          >
            <X className="icon20" />
          </button>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700 }}>Search</h1>
        </div>

        {/* Search Input */}
        <form onSubmit={handleSearch} style={{ marginBottom: 32 }}>
          <div style={{ position: 'relative' }}>
            <Search className="searchIcon icon16" />
            <input
              className="searchInput"
              placeholder="Search homework, messages, children..."
              value={searchValue}
              onChange={(e) => setSearchValue(e.target.value)}
              autoFocus
            />
          </div>
        </form>

        {/* Results */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: 48, color: 'var(--muted)' }}>
            <div className="spinner" />
          </div>
        ) : results.length === 0 && query ? (
          <div className="card" style={{ textAlign: 'center', padding: 48 }}>
            <Search size={48} style={{ margin: '0 auto 16px', opacity: 0.3 }} />
            <h3 style={{ marginBottom: 8 }}>No results found</h3>
            <p style={{ color: 'var(--muted)', marginBottom: 0 }}>
              Try a different search term
            </p>
          </div>
        ) : results.length > 0 ? (
          <>
            <div style={{ marginBottom: 16, color: 'var(--muted)', fontSize: 14 }}>
              Found {results.length} result{results.length === 1 ? '' : 's'} for "{query}"
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {results.map((result) => {
                const Icon = getIcon(result.type);
                const color = getColor(result.type);
                return (
                  <button
                    key={`${result.type}-${result.id}`}
                    onClick={() => router.push(result.href)}
                    className="card"
                    style={{
                      padding: 16,
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                      textAlign: 'left',
                      border: '1px solid var(--border)',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = color;
                      e.currentTarget.style.transform = 'translateX(4px)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = 'var(--border)';
                      e.currentTarget.style.transform = 'translateX(0)';
                    }}
                  >
                    <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                      <div
                        style={{
                          width: 40,
                          height: 40,
                          borderRadius: 8,
                          background: `${color}22`,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                        }}
                      >
                        <Icon size={20} style={{ color }} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ 
                          fontWeight: 600, 
                          marginBottom: 4,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap'
                        }}>
                          {result.title}
                        </div>
                        {result.subtitle && (
                          <div style={{ 
                            fontSize: 13, 
                            color: 'var(--muted)',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap'
                          }}>
                            {result.subtitle}
                          </div>
                        )}
                      </div>
                      <div
                        style={{
                          padding: '4px 12px',
                          borderRadius: 6,
                          background: `${color}22`,
                          color: color,
                          fontSize: 11,
                          fontWeight: 600,
                          textTransform: 'capitalize',
                          flexShrink: 0,
                        }}
                      >
                        {result.type}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </>
        ) : (
          <div className="card" style={{ textAlign: 'center', padding: 48 }}>
            <Search size={48} style={{ margin: '0 auto 16px', opacity: 0.3 }} />
            <h3 style={{ marginBottom: 8 }}>Start searching</h3>
            <p style={{ color: 'var(--muted)', marginBottom: 0 }}>
              Enter a search term to find homework, messages, and more
            </p>
          </div>
        )}
      </div>
    </ParentShell>
  );
}

export default function SearchPage() {
  return (
    <Suspense fallback={
      <ParentShell>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '400px' }}>
          <div className="spinner" />
        </div>
      </ParentShell>
    }>
      <SearchContent />
    </Suspense>
  );
}
