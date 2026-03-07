'use client';

import { useState, useRef, useEffect } from 'react';
import { Sparkles, Send, Loader2, CheckCircle2, XCircle, ArrowLeft, FileText, Plus, Edit2, Eye, Save } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

interface Message {
  id: string;
  role: 'assistant' | 'user';
  content: string;
  timestamp: Date;
  quickActions?: QuickAction[];
  examPreview?: ExamSection[];
}

interface QuickAction {
  id: string;
  label: string;
  value: string;
  type: 'button' | 'chip';
  variant?: 'primary' | 'secondary' | 'success' | 'warning';
}

interface ExamSection {
  id: string;
  title: string;
  questions: ExamQuestion[];
  status: 'draft' | 'approved' | 'editing';
}

interface ExamQuestion {
  id: string;
  number: string;
  text: string;
  type: 'multiple_choice' | 'short_answer' | 'essay' | 'numeric';
  marks: number;
  options?: string[];
  correctAnswer?: string;
  explanation?: string;
}

interface ConversationalExamBuilderProps {
  grade: string;
  subject: string;
  language?: string;
  onClose: () => void;
  onSave?: (exam: any) => void;
}

export function ConversationalExamBuilder({ 
  grade, 
  subject, 
  language = 'English',
  onClose,
  onSave 
}: ConversationalExamBuilderProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [availableTopics, setAvailableTopics] = useState<string[]>([]);
  const [conversationState, setConversationState] = useState<{
    stage: 'greeting' | 'topic_selection' | 'exam_scope' | 'question_types' | 'generating' | 'refining' | 'complete';
    selectedTopics: string[];
    duration: number;
    totalMarks: number;
    questionTypes: string[];
    sections: ExamSection[];
    currentSectionIndex: number;
  }>({
    stage: 'greeting',
    selectedTopics: [],
    duration: 60,
    totalMarks: 50,
    questionTypes: [],
    sections: [],
    currentSectionIndex: 0,
  });
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const hasInitialized = useRef(false);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Initialize conversation (only once)
  useEffect(() => {
    if (!hasInitialized.current) {
      hasInitialized.current = true;
      startConversation();
    }
  }, []);

  // Grade-aware spec
  const getGradeSpec = (g: string) => {
    switch (g) {
      case 'grade_4': return { totalMarks: 50, duration: '90 minutes', mc: [10, 15], sa: [8, 10], ps: [3, 5], minTotal: 21 } as const;
      case 'grade_5': return { totalMarks: 60, duration: '90 minutes', mc: [12, 16], sa: [8, 12], ps: [4, 6], minTotal: 24 } as const;
      case 'grade_6': return { totalMarks: 75, duration: '90 minutes', mc: [12, 18], sa: [10, 14], ps: [5, 8], minTotal: 27 } as const;
      case 'grade_7': return { totalMarks: 75, duration: '2 hours', mc: [10, 15], sa: [8, 12], ps: [6, 8], minTotal: 28 } as const;
      case 'grade_8': return { totalMarks: 100, duration: '2 hours', mc: [12, 18], sa: [10, 14], ps: [6, 10], minTotal: 30 } as const;
      case 'grade_9': return { totalMarks: 100, duration: '2 hours', mc: [12, 18], sa: [10, 14], ps: [6, 10], minTotal: 30 } as const;
      case 'grade_10': return { totalMarks: 100, duration: '2.5 hours', mc: [15, 20], sa: [10, 15], ps: [8, 12], minTotal: 33 } as const;
      case 'grade_11': return { totalMarks: 150, duration: '3 hours', mc: [20, 25], sa: [12, 18], ps: [10, 15], minTotal: 42 } as const;
      case 'grade_12': return { totalMarks: 150, duration: '3 hours', mc: [20, 25], sa: [12, 18], ps: [10, 15], minTotal: 42 } as const;
      default: return { totalMarks: 50, duration: '90 minutes', mc: [8, 12], sa: [6, 10], ps: [3, 5], minTotal: 18 } as const;
    }
  };

  const parseDurationMinutes = (d: string) => {
    const m = d.match(/(\d+(?:\.\d+)?)\s*hours?/i);
    if (m) return Math.round(parseFloat(m[1]) * 60);
    const n = d.match(/(\d+)\s*minutes?/i);
    return n ? parseInt(n[1]) : 60;
  };

  const startConversation = () => {
    const gradeLabel = grade.replace('grade_', 'Grade ').replace('_', ' ');

    // Set defaults based on grade spec
    const spec = getGradeSpec(grade);
    setConversationState((prev) => ({
      ...prev,
      duration: parseDurationMinutes(spec.duration),
      totalMarks: spec.totalMarks,
    }));

    addMessage({
      role: 'assistant',
      content: `Hi! 👋 I'm Dash AI, and I'm here to help you create a CAPS-aligned ${gradeLabel} ${subject} exam.\n\nI'll generate all sections in ${language}. Let me guide you through building the perfect practice test step-by-step, and you can adjust anything along the way.\n\nFirst, let me suggest some topics based on the CAPS curriculum...`,
    });

    // Simulate thinking then show topics
    setTimeout(() => {
      setIsTyping(true);
      fetchCAPSTopics();
    }, 1500);
  };

  const fetchCAPSTopics = async () => {
    try {
      const supabase = createClient();

      // Query CAPS topics directly from database
      const gradeLabel = grade.replace('grade_', '').replace('_', ' ');
      
      const { data: capsTopics, error } = await supabase
        .from('caps_topics')
        .select('topic_title, topic_code, description')
        .eq('grade', gradeLabel)
        .ilike('subject', `%${subject}%`)
        .order('topic_code')
        .limit(10);

      if (error) {
        console.error('[fetchCAPSTopics] Database error:', error);
        // Fallback to example topics if query fails
        const fallbackTopics = getExampleTopics(grade, subject);
        showTopicSelection(fallbackTopics);
        return;
      }

      // Extract topic titles
      const topics = capsTopics && capsTopics.length > 0
        ? capsTopics.map((t: any) => t.topic_title)
        : getExampleTopics(grade, subject);

      showTopicSelection(topics);

    } catch (error) {
      console.error('[fetchCAPSTopics] Error:', error);
      // Fallback to example topics on error
      const fallbackTopics = getExampleTopics(grade, subject);
      showTopicSelection(fallbackTopics);
    }
  };

  const showTopicSelection = (topics: string[]) => {
    setAvailableTopics(topics);
    setIsTyping(false);
    addMessage({
      role: 'assistant',
      content: `Here are the main CAPS topics for ${subject}:\n\nWhich topics would you like to focus on? You can select multiple topics, or click "Select All" to include everything.`,
      quickActions: [
        ...topics.map((topic, i) => ({
          id: `topic-${i}`,
          label: topic,
          value: topic,
          type: 'chip' as const,
        })),
        { id: 'all-topics', label: '✓ Select All', value: 'all', type: 'button' as const, variant: 'primary' as const },
        { id: 'continue-topics', label: '→ Continue with selected topics', value: 'continue', type: 'button' as const, variant: 'success' as const },
      ],
    });

    setConversationState(prev => ({ ...prev, stage: 'topic_selection' }));
  };

  const handleTopicSelection = (topics: string[]) => {
    if (topics.length === 0) {
      return; // Don't proceed if no topics selected
    }

    const topicList = topics.join(', ');
    addMessage({
      role: 'user',
      content: `I'll focus on: ${topicList}`,
    });

    setConversationState(prev => ({ ...prev, selectedTopics: topics }));

    setTimeout(() => {
      setIsTyping(true);
      setTimeout(() => {
        setIsTyping(false);
        addMessage({
          role: 'assistant',
          content: `Perfect! Now let's set up the exam structure.\n\nHow much time should students have, and how many marks? Select both, then click Continue.`,
          quickActions: [
            { id: 'time-30', label: '30 minutes', value: '30', type: 'chip' as const },
            { id: 'time-60', label: '60 minutes', value: '60', type: 'chip' as const },
            { id: 'time-90', label: '90 minutes', value: '90', type: 'chip' as const },
            { id: 'divider-1', label: '|', value: 'divider', type: 'chip' as const },
            { id: 'marks-25', label: '25 marks', value: '25', type: 'chip' as const },
            { id: 'marks-50', label: '50 marks', value: '50', type: 'chip' as const },
            { id: 'marks-75', label: '75 marks', value: '75', type: 'chip' as const },
            { id: 'continue-scope', label: '→ Continue', value: 'continue', type: 'button' as const, variant: 'primary' as const },
          ],
        });
        setConversationState(prev => ({ ...prev, stage: 'exam_scope' }));
      }, 1000);
    }, 500);
  };

  const handleScopeSelection = (duration: number, marks: number) => {
    addMessage({
      role: 'user',
      content: `${duration} minutes, ${marks} marks`,
    });

    setConversationState(prev => ({ 
      ...prev, 
      duration, 
      totalMarks: marks,
    }));

    setTimeout(() => {
      setIsTyping(true);
      setTimeout(() => {
        setIsTyping(false);
        addMessage({
          role: 'assistant',
          content: `Great! Now, what types of questions would you like?\n\nI recommend a mix for comprehensive assessment.`,
          quickActions: [
            { id: 'type-mc', label: '☑️ Multiple Choice', value: 'multiple_choice', type: 'chip' as const },
            { id: 'type-short', label: '✍️ Short Answer', value: 'short_answer', type: 'chip' as const },
            { id: 'type-numeric', label: '🔢 Calculations', value: 'numeric', type: 'chip' as const },
            { id: 'type-essay', label: '📝 Essay', value: 'essay', type: 'chip' as const },
            { id: 'recommended', label: '✨ Use Recommended Mix', value: 'recommended', type: 'button' as const, variant: 'primary' as const },
          ],
        });
        setConversationState(prev => ({ ...prev, stage: 'question_types' }));
      }, 1200);
    }, 500);
  };

  const handleQuestionTypeSelection = (types: string[]) => {
    if (types.length === 0) {
      return; // Don't proceed if no types selected
    }

    const typeLabels = types.map(t => {
      switch(t) {
        case 'multiple_choice': return 'Multiple Choice';
        case 'short_answer': return 'Short Answer';
        case 'numeric': return 'Calculations';
        case 'essay': return 'Essay';
        default: return t;
      }
    }).join(', ');

    addMessage({
      role: 'user',
      content: `Include: ${typeLabels}`,
    });

    setConversationState(prev => ({ 
      ...prev, 
      questionTypes: types,
    }));

    setTimeout(() => {
      setIsTyping(true);
      setTimeout(() => {
        setIsTyping(false);
        const gradeLabel = grade.replace('grade_', 'Grade ').replace('_', ' ');
        addMessage({
          role: 'assistant',
          content: `Perfect setup! Let me create the exam structure:\n\n📋 **${gradeLabel} ${subject} Practice Test**\n⏱️ Duration: ${conversationState.duration} minutes\n📊 Total: ${conversationState.totalMarks} marks\n📚 Topics: ${conversationState.selectedTopics.join(', ')}\n\nI'll organize this into sections. Ready for me to generate Section A?`,
          quickActions: [
            { id: 'generate-section', label: '✨ Yes, generate Section A', value: 'generate', type: 'button' as const, variant: 'primary' as const },
            { id: 'adjust', label: 'Wait, let me adjust', value: 'adjust', type: 'button' as const, variant: 'secondary' as const },
          ],
        });
        setConversationState(prev => ({ ...prev, stage: 'generating' }));
      }, 1500);
    }, 500);
  };

  const generateSection = async (sectionIndex: number, retryCount = 0) => {
    setIsTyping(true);

    try {
      const supabase = createClient();
      
      // Try to get session
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      let token = sessionData?.session?.access_token;
      
      console.log('[ConversationalExamBuilder] Session data:', sessionData);
      console.log('[ConversationalExamBuilder] Session error:', sessionError);
      
      // Check if we have a valid session
      if (sessionError || !token) {
        console.error('[ConversationalExamBuilder] No valid session found');
        
        // Try to refresh the session
        const { data: refreshData } = await supabase.auth.refreshSession();
        
        if (!refreshData?.session) {
          throw new Error('Authentication required. Please refresh the page and try again.');
        }
        
        token = refreshData.session.access_token;
        console.log('[ConversationalExamBuilder] Session refreshed, got token');
      }

      if (!token) {
        throw new Error('Authentication required. Please refresh the page and try again.');
      }
      
      console.log('[ConversationalExamBuilder] Got auth token, length:', token.length);

      // Build the prompt for this section
      const sectionLabel = String.fromCharCode(65 + sectionIndex); // A, B, C...
      const prompt = buildSectionPrompt(sectionLabel);

      console.log('[ConversationalExamBuilder] Generating section with prompt:', prompt);

      const { data, error } = await supabase.functions.invoke('ai-proxy', {
        body: {
          scope: 'parent',
          service_type: 'homework_help',
          enable_tools: true,
          prefer_openai: true, // Use OpenAI to avoid Claude rate limits
          payload: {
            prompt,
            context: 'caps_exam_generation_conversational',
            metadata: {
              grade,
              subject,
              topics: conversationState.selectedTopics,
              section: sectionLabel,
              conversational: true,
              language,
            }
          },
        },
        headers: { Authorization: `Bearer ${token}` },
      });

      console.log('[ConversationalExamBuilder] AI response:', data);
      console.log('[ConversationalExamBuilder] AI error:', error);

      if (error) {
        console.error('[ConversationalExamBuilder] Supabase invoke error:', error);
        
        // Handle rate limiting with retry
        if (error.message?.includes('429') || error.message?.includes('rate limit') || error.message?.includes('Too Many Requests')) {
          if (retryCount < 5) { // Max 5 retries for rate limits (increased from 4)
            const delay = Math.pow(2, retryCount) * 5000; // 5s, 10s, 20s, 40s, 80s (increased base delay from 3s)
            console.log(`[ConversationalExamBuilder] Rate limited, retrying in ${delay}ms (attempt ${retryCount + 1}/5)`);
            
            setIsTyping(false);
            addMessage({
              role: 'assistant',
              content: `⏳ AI is busy processing many requests. Retrying in ${delay / 1000} seconds... (attempt ${retryCount + 1}/5)\n\nPlease wait, this is normal during high traffic.`,
            });
            
            await new Promise(resolve => setTimeout(resolve, delay));
            return generateSection(sectionIndex, retryCount + 1);
          } else {
            throw new Error('AI service is experiencing high demand. Please try again in a few minutes.');
          }
        }
        
        throw error;
      }

      // Extract section from tool results or content
      console.log('[ConversationalExamBuilder] Extracting section from response...');
      const section = extractSectionFromResponse(data, sectionLabel);
      
      console.log('[ConversationalExamBuilder] Extracted section:', section);
      
      setIsTyping(false);
      
      if (section) {
        setConversationState(prev => ({
          ...prev,
          sections: [...prev.sections, section],
          currentSectionIndex: sectionIndex,
        }));

        addMessage({
          role: 'assistant',
          content: `✅ Section ${sectionLabel} is ready! Here's what I created:`,
          examPreview: [section],
          quickActions: [
            { id: 'approve', label: '✓ Looks good!', value: 'approve', type: 'button' as const, variant: 'success' as const },
            { id: 'harder', label: '📈 Make it harder', value: 'harder', type: 'button' as const },
            { id: 'easier', label: '📉 Make it easier', value: 'easier', type: 'button' as const },
            { id: 'more', label: '+ Add more questions', value: 'more', type: 'button' as const },
            { id: 'regenerate', label: '🔄 Regenerate', value: 'regenerate', type: 'button' as const, variant: 'secondary' as const },
          ],
        });
      }

    } catch (error: any) {
      setIsTyping(false);
      console.error('[ConversationalExamBuilder] Error:', error);
      
      // Show more helpful error message
      const errorMsg = error?.message || error?.toString() || 'Unknown error';
      
      // Special handling for circuit breaker
      if (errorMsg.includes('Circuit breaker') || errorMsg.includes('Rate limit protection active')) {
        addMessage({
          role: 'assistant',
          content: `🛑 **Rate Limit Protection Activated**\n\nOur system detected too many rate limit errors and temporarily paused AI requests to prevent overload.\n\n**What this means:**\n- The AI service needs a short break (about 1 minute)\n- This protects both you and other users\n- Your work is safe and will be here when you return\n\n**What to do:**\n1. Wait 60-90 seconds\n2. Refresh the page\n3. Try generating your exam again\n\nThank you for your patience! 🙏`,
          quickActions: [
            { id: 'adjust-back', label: '← Go Back', value: 'back', type: 'button' as const, variant: 'secondary' as const },
          ],
        });
      }
      // Special handling for rate limit errors
      else if (errorMsg.includes('429') || errorMsg.includes('rate limit') || errorMsg.includes('high demand')) {
        addMessage({
          role: 'assistant',
          content: `⏳ The AI service is experiencing high demand right now.\n\nThis happens when many users are generating exams at the same time. Your request is safe and you can:\n\n1. **Wait 2-3 minutes** and try again\n2. **Try during off-peak hours** for faster response\n3. Contact support if this persists\n\nWould you like to try again?`,
          quickActions: [
            { id: 'retry-section', label: '🔄 Try Again Now', value: 'retry', type: 'button' as const, variant: 'primary' as const },
            { id: 'adjust-back', label: '← Go Back', value: 'back', type: 'button' as const, variant: 'secondary' as const },
          ],
        });
      } else {
        addMessage({
          role: 'assistant',
          content: `I encountered an error generating the section: ${errorMsg}\n\nLet's try a different approach. Would you like to try again or adjust your selections?`,
          quickActions: [
            { id: 'retry-section', label: '🔄 Try Again', value: 'retry', type: 'button' as const, variant: 'primary' as const },
            { id: 'adjust-back', label: '← Go Back', value: 'back', type: 'button' as const, variant: 'secondary' as const },
          ],
        });
      }
    }
  };

  const buildSectionPrompt = (sectionLabel: string) => {
    const gradeLabel = grade.replace('grade_', 'Grade ').replace('_', ' ');
    const spec = getGradeSpec(grade);
    const marksForSection = Math.floor((conversationState.totalMarks || spec.totalMarks) / 3);
    const topicsForPrompt = conversationState.selectedTopics.length > 0
      ? conversationState.selectedTopics.join(', ')
      : 'core CAPS curriculum topics';

    // Determine section-specific ranges and focus
    let range: readonly [number, number] = [6, 10] as const;
    let focus = 'balanced mix';
    if (sectionLabel === 'A') { range = spec.mc as [number, number]; focus = 'multiple_choice (1-2 marks each)'; }
    else if (sectionLabel === 'B') { range = spec.sa as [number, number]; focus = 'short_answer (2-5 marks each)'; }
    else if (sectionLabel === 'C') { range = spec.ps as [number, number]; focus = 'problem solving / calculations (5-10 marks each)'; }

    // Build prompt with grade-aware ranges
    return `Create Section ${sectionLabel} for a ${gradeLabel} ${subject} CAPS exam covering the following topics: ${topicsForPrompt}.

Generate all section content in ${language}.

Include ${marksForSection} marks worth of questions focused on ${focus}. Aim for ${range[0]}-${range[1]} questions in this section.

Return **JSON only** in this exact structure (no markdown, no extra text):
{
  "grade": "${gradeLabel}",
  "subject": "${subject}",
  "total_marks": ${marksForSection},
  "sections": [
    {
      "title": "SECTION ${sectionLabel}",
      "questions": [
        {
          "number": "1",
          "text": "...",
          "type": "multiple_choice|short_answer|calculation",
          "marks": 1,
          "options": ["A", "B", "C", "D"],
          "correctAnswer": "A",
          "explanation": "..."
        }
      ]
    }
  ]
}`;
  };

  const getSectionSpec = (section: string) => {
    // Distribute questions across sections
    if (section === 'A') return '5-7 Multiple Choice questions (1-2 marks each)';
    if (section === 'B') return '3-5 Short Answer questions (3-5 marks each)';
    if (section === 'C') return '2-3 Calculation/Problem Solving questions (5-10 marks each)';
    return '3-5 questions';
  };

  const extractSectionFromResponse = (data: any, sectionLabel: string): ExamSection | null => {
    console.log('[extractSectionFromResponse] Processing data:', JSON.stringify(data, null, 2));
    
    // Extract from tool_results if available
    if (data?.tool_results) {
      console.log('[extractSectionFromResponse] Found tool_results:', data.tool_results.length);
      
      for (const result of data.tool_results) {
        try {
          console.log('[extractSectionFromResponse] Processing result:', result);
          const raw = (result as any)?.content ?? (result as any)?.output ?? result;
          const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
          console.log('[extractSectionFromResponse] Parsed content:', parsed);
          
          if (parsed.success && parsed.data?.sections) {
            const section = parsed.data.sections[0];
            return {
              id: `section-${sectionLabel}`,
              title: section.title || `SECTION ${sectionLabel}`,
              questions: section.questions.map((q: any, i: number) => ({
                id: q.id || `q-${sectionLabel}-${i}`,
                number: q.number || String(i + 1),
                text: q.text,
                type: q.type || 'short_answer',
                marks: q.marks || 1,
                options: q.options,
                correctAnswer: q.correctAnswer || q.correct_answer,
                explanation: q.explanation,
              })),
              status: 'draft' as const,
            };
          }
          
          // Also check for direct sections (without success wrapper)
          if (parsed.sections && Array.isArray(parsed.sections)) {
            console.log('[extractSectionFromResponse] Found direct sections format');
            const section = parsed.sections[0];
            return {
              id: `section-${sectionLabel}`,
              title: section.title || `SECTION ${sectionLabel}`,
              questions: section.questions.map((q: any, i: number) => ({
                id: q.id || `q-${sectionLabel}-${i}`,
                number: q.number || String(i + 1),
                text: q.text,
                type: q.type || 'short_answer',
                marks: q.marks || 1,
                options: q.options,
                correctAnswer: q.correctAnswer || q.correct_answer,
                explanation: q.explanation,
              })),
              status: 'draft' as const,
            };
          }
        } catch (e) {
          console.error('[extractSectionFromResponse] Parse error:', e);
        }
      }
    }

    // Fallback: try parsing AI content if tool_results missing
    if (data?.content && typeof data.content === 'string') {
      try {
        const parsed = JSON.parse(data.content);
        if (parsed?.sections && Array.isArray(parsed.sections)) {
          const section = parsed.sections[0];
          return {
            id: `section-${sectionLabel}`,
            title: section.title || `SECTION ${sectionLabel}`,
            questions: section.questions.map((q: any, i: number) => ({
              id: q.id || `q-${sectionLabel}-${i}`,
              number: q.number || String(i + 1),
              text: q.text,
              type: q.type || 'short_answer',
              marks: q.marks || 1,
              options: q.options,
              correctAnswer: q.correctAnswer || q.correct_answer,
              explanation: q.explanation,
            })),
            status: 'draft' as const,
          };
        }
      } catch (e) {
        console.error('[extractSectionFromResponse] Failed to parse content JSON:', e);
      }
    }
    
    console.warn('[extractSectionFromResponse] No valid section found in response');
    return null;
  };

  const handleQuickAction = (action: QuickAction) => {
    const { id, value } = action;

    // Topic selection
    if (id.startsWith('topic-')) {
      const currentTopics = conversationState.selectedTopics;
      const newTopics = currentTopics.includes(value)
        ? currentTopics.filter(t => t !== value)
        : [...currentTopics, value];
      setConversationState(prev => ({ ...prev, selectedTopics: newTopics }));
      return;
    }

    if (id === 'all-topics') {
      const allTopics = availableTopics.length > 0 ? availableTopics : getExampleTopics(grade, subject);
      setConversationState(prev => ({ ...prev, selectedTopics: allTopics }));
      handleTopicSelection(allTopics);
      return;
    }

    if (id === 'continue-topics') {
      if (conversationState.selectedTopics.length === 0) {
        // Show error - must select at least one topic
        addMessage({
          role: 'assistant',
          content: 'Please select at least one topic before continuing.',
        });
        return;
      }
      handleTopicSelection(conversationState.selectedTopics);
      return;
    }

    // Scope selection
    if (id.startsWith('time-')) {
      const newDuration = parseInt(value);
      setConversationState(prev => ({ ...prev, duration: newDuration }));
      return;
    }

    if (id.startsWith('marks-')) {
      const newMarks = parseInt(value);
      setConversationState(prev => ({ ...prev, totalMarks: newMarks }));
      return;
    }

    if (id === 'continue-scope' && conversationState.stage === 'exam_scope') {
      handleScopeSelection(conversationState.duration, conversationState.totalMarks);
      return;
    }

    // Question type selection
    if (id.startsWith('type-')) {
      const currentTypes = conversationState.questionTypes;
      const newTypes = currentTypes.includes(value)
        ? currentTypes.filter(t => t !== value)
        : [...currentTypes, value];
      setConversationState(prev => ({ ...prev, questionTypes: newTypes }));
      return;
    }

    if (id === 'recommended') {
      handleQuestionTypeSelection(['multiple_choice', 'short_answer', 'numeric']);
      return;
    }

    // Section generation
    if (id === 'generate-section') {
      generateSection(0);
      return;
    }

    // Generate next section (B, C, etc.)
    if (id === 'generate-next') {
      const nextSectionIndex = conversationState.currentSectionIndex + 1;
      generateSection(nextSectionIndex);
      return;
    }

    // Section approval
    if (id === 'approve') {
      handleSectionApproval();
      return;
    }

    // Section refinement
    if (['harder', 'easier', 'more', 'regenerate'].includes(id)) {
      handleSectionRefinement(id);
      return;
    }

    // Preview and finish
    if (id === 'preview' || id === 'preview-final') {
      // Show preview of all sections
      addMessage({
        role: 'assistant',
        content: `📋 **Full Exam Preview:**\n\nHere's your complete ${grade.replace('grade_', 'Grade ').replace('_', ' ')} ${subject} exam:`,
        examPreview: conversationState.sections,
      });
      return;
    }

    if (id === 'finish') {
      finishExam();
      return;
    }

    if (id === 'save') {
      // Save the exam
      if (onSave) {
        const examData = {
          grade,
          subject,
          duration: conversationState.duration,
          totalMarks: conversationState.totalMarks,
          topics: conversationState.selectedTopics,
          sections: conversationState.sections,
        };
        onSave(examData);
      }
      
      addMessage({
        role: 'assistant',
        content: '✅ Exam saved successfully! You can now use it with your students.',
      });
      return;
    }

    if (id === 'edit') {
      addMessage({
        role: 'assistant',
        content: 'Which section would you like to edit?',
        quickActions: conversationState.sections.map((section, i) => ({
          id: `edit-section-${i}`,
          label: `✏️ Edit ${section.title}`,
          value: `edit-${i}`,
          type: 'button' as const,
        })),
      });
      return;
    }

    // Retry/back after error
    if (id === 'retry-section') {
      generateSection(conversationState.currentSectionIndex);
      return;
    }

    if (id === 'adjust-back') {
      addMessage({
        role: 'assistant',
        content: 'No problem! What would you like to adjust?',
      });
      return;
    }
  };

  const handleSectionApproval = () => {
    addMessage({
      role: 'user',
      content: 'Looks good!',
    });

    const currentSection = conversationState.currentSectionIndex;
    const nextSection = currentSection + 1;
    const sectionLabel = String.fromCharCode(65 + nextSection);

    // Mark current section as approved
    setConversationState(prev => ({
      ...prev,
      sections: prev.sections.map((s, i) => 
        i === currentSection ? { ...s, status: 'approved' as const } : s
      ),
    }));

    if (nextSection < 3) {
      setTimeout(() => {
        setIsTyping(true);
        setTimeout(() => {
          setIsTyping(false);
          addMessage({
            role: 'assistant',
            content: `Excellent! Ready for Section ${sectionLabel}?`,
            quickActions: [
              { id: 'generate-next', label: `✨ Generate Section ${sectionLabel}`, value: 'generate-next', type: 'button' as const, variant: 'primary' as const },
              { id: 'preview', label: '👁️ Preview full exam', value: 'preview', type: 'button' as const },
              { id: 'finish', label: '✓ Finish with current sections', value: 'finish', type: 'button' as const, variant: 'success' as const },
            ],
          });
        }, 800);
      }, 500);
    } else {
      finishExam();
    }
  };

  const handleSectionRefinement = (action: string) => {
    addMessage({
      role: 'user',
      content: action === 'harder' ? 'Make it harder' : 
               action === 'easier' ? 'Make it easier' : 
               action === 'more' ? 'Add more questions' : 
               'Regenerate section',
    });

    setTimeout(() => {
      setIsTyping(true);
      setTimeout(() => {
        setIsTyping(false);
        addMessage({
          role: 'assistant',
          content: `I'm regenerating Section ${String.fromCharCode(65 + conversationState.currentSectionIndex)} with your requested changes...`,
        });
        // Regenerate with modified parameters
        generateSection(conversationState.currentSectionIndex);
      }, 1000);
    }, 500);
  };

  const finishExam = () => {
    setConversationState(prev => ({ ...prev, stage: 'complete' }));
    
    setTimeout(() => {
      addMessage({
        role: 'assistant',
        content: `🎉 Your exam is complete!\n\n📋 **Summary:**\n- ${conversationState.sections.length} sections\n- ${conversationState.sections.reduce((sum, s) => sum + s.questions.length, 0)} total questions\n- ${conversationState.totalMarks} marks\n- ${conversationState.duration} minutes\n\nWould you like to save it or make any final adjustments?`,
        quickActions: [
          { id: 'save', label: '💾 Save Exam', value: 'save', type: 'button' as const, variant: 'primary' as const },
          { id: 'preview-final', label: '👁️ Preview', value: 'preview', type: 'button' as const },
          { id: 'edit', label: '✏️ Edit Sections', value: 'edit', type: 'button' as const },
        ],
      });
    }, 500);
  };

  const handleSend = () => {
    if (!inputValue.trim()) return;

    addMessage({
      role: 'user',
      content: inputValue,
    });

    setInputValue('');
    
    // Process the user's message
    setTimeout(() => {
      setIsTyping(true);
      setTimeout(() => {
        setIsTyping(false);
        addMessage({
          role: 'assistant',
          content: `I understand. Let me help you with that...`,
        });
      }, 1000);
    }, 500);
  };

  const addMessage = (msg: Omit<Message, 'id' | 'timestamp'>) => {
    const newMessage: Message = {
      ...msg,
      id: Date.now().toString(),
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, newMessage]);
  };

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100vh',
      maxHeight: '100vh',
      background: 'var(--background)',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        padding: 'var(--space-4)',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        background: 'var(--surface)',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          <button onClick={onClose} className="btn btnSecondary" style={{ padding: '8px', minWidth: 'auto' }}>
            <ArrowLeft className="icon16" />
          </button>
          <div>
            <h2 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '4px' }}>
              <Sparkles className="icon16" style={{ display: 'inline', marginRight: '8px', color: 'var(--primary)' }} />
              Conversational Exam Builder
            </h2>
            <p style={{ fontSize: '13px', color: 'var(--muted)' }}>
              {grade.replace('grade_', 'Grade ').replace('_', ' ')} {subject}
            </p>
          </div>
        </div>
        
        {conversationState.stage === 'complete' && (
          <button className="btn btnPrimary" onClick={() => onSave?.(conversationState.sections)}>
            <Save className="icon16" />
            Save Exam
          </button>
        )}
      </div>

      {/* Messages */}
      <div 
        ref={chatContainerRef}
        style={{
          flex: 1,
          overflowY: 'auto',
          overflowX: 'hidden',
          padding: 'var(--space-4)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-4)',
          WebkitOverflowScrolling: 'touch',
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
        }}
        className="hide-scrollbar"
      >
        {messages.map((message) => (
          <div
            key={message.id}
            style={{
              display: 'flex',
              justifyContent: message.role === 'user' ? 'flex-end' : 'flex-start',
            }}
          >
            <div style={{
              maxWidth: message.role === 'user' ? '70%' : '85%',
              padding: 'var(--space-3)',
              borderRadius: '16px',
              background: message.role === 'user' ? 'linear-gradient(135deg, #7c3aed 0%, #ec4899 100%)' : 'var(--surface)',
              color: message.role === 'user' ? '#fff' : 'var(--text)',
              border: message.role === 'user' ? 'none' : '1px solid var(--border)',
              boxShadow: message.role === 'user' ? '0 4px 12px rgba(124,58,237,0.2)' : '0 2px 8px rgba(0,0,0,0.05)',
            }}>
              <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
                {message.content}
              </div>

              {/* Exam Preview */}
              {message.examPreview && message.examPreview.length > 0 && (
                <div style={{ marginTop: 'var(--space-3)', padding: 'var(--space-3)', background: 'var(--background)', borderRadius: 'var(--radius-1)', border: '1px solid var(--border)' }}>
                  {message.examPreview.map((section) => (
                    <div key={section.id} style={{ marginBottom: 'var(--space-3)' }}>
                      <h3 style={{ fontSize: '15px', fontWeight: 600, marginBottom: 'var(--space-2)' }}>
                        {section.title}
                      </h3>
                      {section.questions.map((q, i) => (
                        <div key={q.id} style={{ marginBottom: 'var(--space-2)', paddingLeft: 'var(--space-2)' }}>
                          <p style={{ fontWeight: 500, marginBottom: '4px' }}>
                            {q.number}. {q.text} <span style={{ color: 'var(--muted)', fontSize: '12px' }}>({q.marks} marks)</span>
                          </p>
                          {q.options && (
                            <div style={{ paddingLeft: 'var(--space-3)', fontSize: '14px', color: 'var(--muted)' }}>
                              {q.options.map((opt, j) => (
                                <div key={j}>{String.fromCharCode(97 + j)}) {opt}</div>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              )}

              {/* Quick Actions */}
              {message.quickActions && message.quickActions.length > 0 && (
                <div style={{ 
                  marginTop: 'var(--space-3)', 
                  display: 'flex', 
                  flexWrap: 'wrap', 
                  gap: 'var(--space-2)' 
                }}>
                  {message.quickActions.map((action) => {
                    // Check if this chip is selected
                    const isTopicSelected = conversationState.selectedTopics.includes(action.value);
                    const isTypeSelected = conversationState.questionTypes.includes(action.value);
                    const isTimeSelected = conversationState.duration === parseInt(action.value);
                    const isMarksSelected = conversationState.totalMarks === parseInt(action.value);
                    const isSelected = isTopicSelected || isTypeSelected || isTimeSelected || isMarksSelected;

                    // Skip dividers
                    if (action.value === 'divider') {
                      return <span key={action.id} style={{ color: 'var(--border)', padding: '0 4px' }}>|</span>;
                    }

                    return (
                      <button
                        key={action.id}
                        onClick={() => handleQuickAction(action)}
                        className={action.type === 'button' ? `btn ${action.variant === 'primary' ? 'btnPrimary' : action.variant === 'success' ? 'btnSuccess' : ''}` : ''}
                        style={{
                          ...(action.type === 'chip' ? {
                            padding: '8px 16px',
                            borderRadius: '20px',
                            border: isSelected
                              ? '2px solid var(--primary)' 
                              : '2px solid var(--border)',
                            background: isSelected
                              ? 'linear-gradient(135deg, rgba(124,58,237,0.15) 0%, rgba(236,72,153,0.15) 100%)'
                              : 'var(--surface-2)',
                            fontSize: '14px',
                            cursor: 'pointer',
                            transition: 'all 0.2s ease',
                            fontWeight: isSelected ? 600 : 500,
                            color: isSelected ? 'var(--primary)' : 'var(--text)',
                            boxShadow: isSelected ? '0 2px 8px rgba(124,58,237,0.2)' : 'none',
                          } : {
                            boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                          }),
                        }}
                        onMouseEnter={(e) => {
                          if (action.type === 'chip' && !isSelected) {
                            e.currentTarget.style.borderColor = 'var(--primary)';
                            e.currentTarget.style.transform = 'translateY(-1px)';
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (action.type === 'chip' && !isSelected) {
                            e.currentTarget.style.borderColor = 'var(--border)';
                            e.currentTarget.style.transform = 'translateY(0)';
                          }
                        }}
                      >
                        {action.label}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        ))}

        {isTyping && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', color: 'var(--muted)' }}>
            <Loader2 className="icon16" style={{ animation: 'spin 1s linear infinite' }} />
            <span style={{ fontSize: '14px' }}>Dash is thinking...</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div style={{
        padding: 'var(--space-4)',
        borderTop: '1px solid var(--border)',
        background: 'var(--surface)',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder="Type your message or use the buttons above..."
            disabled={isTyping}
            style={{
              flex: 1,
              padding: '12px 16px',
              borderRadius: '12px',
              border: '2px solid var(--border)',
              background: 'var(--background)',
              fontSize: '14px',
              color: 'var(--text)',
              outline: 'none',
              transition: 'border-color 0.2s ease',
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = 'var(--primary)';
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = 'var(--border)';
            }}
          />
          <button 
            onClick={handleSend}
            disabled={!inputValue.trim() || isTyping}
            className="btn btnPrimary"
            style={{
              minWidth: '44px',
              minHeight: '44px',
              padding: '0',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Send className="icon16" />
          </button>
        </div>
      </div>

      {/* Add global styles for hiding scrollbar */}
      <style jsx>{`
        .hide-scrollbar::-webkit-scrollbar {
          display: none;
        }
        .hide-scrollbar {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}</style>
    </div>
  );
}

// Helper function to get example topics (in real app, this would call the CAPS search tool)
function getExampleTopics(grade: string, subject: string): string[] {
  if (subject.toLowerCase().includes('math')) {
    return [
      'Algebra & Equations',
      'Geometry & Measurement',
      'Data Handling & Probability',
      'Number Operations',
      'Functions & Graphs',
    ];
  }
  
  if (subject.toLowerCase().includes('science')) {
    return [
      'Matter & Materials',
      'Energy & Change',
      'Life & Living',
      'Planet Earth & Beyond',
    ];
  }

  return [
    'Topic 1',
    'Topic 2',
    'Topic 3',
    'Topic 4',
  ];
}
