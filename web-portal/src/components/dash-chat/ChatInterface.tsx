/**
 * Chat Interface - Main Component
 * WARP.md compliant: ≤200 lines
 * 
 * Orchestrates chat components and manages state
 */

'use client';

import { useState, useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { ChatMessages } from './ChatMessages';
import { TutorModePanel } from './TutorModePanel';
import { ChatInput } from './ChatInput';
import { ImageUpload } from './ImageUpload';
import { ExamBuilderLauncher } from './ExamBuilderLauncher';
import { useChatLogic } from '@/hooks/useChatLogic';
import type { ChatMessage, SelectedImage } from './types';
import type { VoiceDictationProbe } from '@/hooks/useVoiceRecording';

interface ChatInterfaceProps {
  scope: 'parent' | 'teacher' | 'principal';
  conversationId: string;
  initialMessages?: ChatMessage[];
  userId?: string;
  onMessageSent?: () => void; // Callback when message is successfully sent
  initialPrompt?: string;
  showTutorPanel?: boolean;
  canUseExamBuilder?: boolean;
  learnerContext?: {
    learnerName?: string | null;
    grade?: string | null;
    ageYears?: number | null;
    usageType?: string | null;
    schoolType?: string | null;
  } | null;
}

export function ChatInterface({
  scope,
  conversationId,
  initialMessages = [],
  userId,
  onMessageSent,
  initialPrompt,
  showTutorPanel = true,
  canUseExamBuilder = true,
  learnerContext
}: ChatInterfaceProps) {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [input, setInput] = useState('');
  const [selectedImages, setSelectedImages] = useState<SelectedImage[]>([]);
  const [showImageUpload, setShowImageUpload] = useState(false);
  const [showExamBuilder, setShowExamBuilder] = useState(false);
  const initialPromptSentRef = useRef(false);

  const {
    isLoading,
    isTyping,
    examContext,
    setExamContext,
    loadConversation,
    sendMessage,
  } = useChatLogic({ 
    scope,
    conversationId, 
    messages, 
    setMessages,
    userId,
    onMessageSent
  });

  // Load conversation on mount
  useEffect(() => {
    if (conversationId && initialMessages.length === 0) {
      loadConversation();
    }
  }, [conversationId, initialMessages.length, loadConversation]);

  useEffect(() => {
    if (!initialPrompt || !conversationId || initialPromptSentRef.current) return;
    if (messages.length > 0) return;
    initialPromptSentRef.current = true;
    void sendMessage(initialPrompt, [], undefined);
  }, [conversationId, initialPrompt, messages.length, sendMessage]);

  // Handle send
  const handleSend = async (
    messageText?: string,
    voiceData?: { blob: Blob; base64: string; probe?: VoiceDictationProbe },
  ) => {
    const textToSend = messageText || input.trim();
    
    await sendMessage(textToSend, selectedImages, voiceData);
    
    // Clear input and images
    setInput('');
    setSelectedImages([]);
  };

  // Handle image selection
  const handleImageSelect = (images: Array<{ data: string; media_type: string; preview: string }>) => {
    setSelectedImages(images);
    setShowImageUpload(false);
  };

  // Handle image removal
  const removeImage = (index: number) => {
    setSelectedImages(selectedImages.filter((_, i) => i !== index));
  };

  // Handle retry on error
  const handleRetry = (messageId: string, userMessage: ChatMessage) => {
    // Remove error message
    setMessages(messages.filter(m => m.id !== messageId));
    
    // Restore input
    setInput(userMessage.content);
    setSelectedImages(
      (userMessage.images || []).map((img) => ({
        data: img.data,
        media_type: img.media_type,
        preview: img.preview ?? `data:${img.media_type};base64,${img.data}`,
      }))
    );
    
    // Auto-send after brief delay
    setTimeout(() => handleSend(), 100);
  };

  // Handle exam builder click
  const handleExamBuilderClick = (context: typeof examContext) => {
    if (!canUseExamBuilder) return;
    const lastMessage = messages[messages.length - 1];
    if (lastMessage) {
      const extractedContext = extractExamContextFromMessage(lastMessage.content);
      setExamContext({ ...context, ...extractedContext });
    }
    setShowExamBuilder(true);
  };

  const handleQuickPrompt = (prompt: string) => {
    setInput(prompt);
    const inputEl = document.querySelector('textarea[data-chat-input=\"true\"]') as HTMLTextAreaElement | null;
    inputEl?.focus();
  };

  return (
    <div className="flex flex-col h-full overflow-hidden relative">
      {showTutorPanel && (
        <TutorModePanel
          learnerContext={learnerContext || undefined}
          onStart={(prompt) => {
            setInput(prompt);
            void sendMessage(prompt, [], undefined);
          }}
        />
      )}
      {/* Exam Builder Overlay */}
      {showExamBuilder && canUseExamBuilder && (
        <div className="absolute inset-0 z-50">
          <ExamBuilderLauncher
            suggestedGrade={examContext.grade}
            suggestedSubject={examContext.subject}
            suggestedTopics={examContext.topics}
            onClose={() => setShowExamBuilder(false)}
          />
        </div>
      )}

      {/* Messages Area */}
      <ChatMessages
        messages={messages}
        isTyping={isTyping}
        onRetry={handleRetry}
        onExamBuilderClick={canUseExamBuilder ? handleExamBuilderClick : undefined}
        examContext={examContext}
        onQuickPrompt={handleQuickPrompt}
      />

      {/* Image Upload Modal */}
      {showImageUpload && (
        <ImageUpload
          onSelect={handleImageSelect}
          onClose={() => setShowImageUpload(false)}
          maxImages={3}
        />
      )}

      {/* Selected Images Preview */}
      {selectedImages.length > 0 && (
        <div className="border-t border-gray-800 bg-gray-950 px-4 py-3 flex-shrink-0" style={{
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)'
        }}>
          <div className="w-full max-w-4xl mx-auto flex gap-2 flex-wrap">
            {selectedImages.map((img, index) => (
              <div key={index} style={{
                position: 'relative',
                width: '60px',
                height: '60px',
                borderRadius: '12px',
                overflow: 'hidden',
                border: '2px solid var(--primary)',
                boxShadow: '0 2px 12px rgba(124, 58, 237, 0.3)',
                transition: 'all 0.2s ease',
                cursor: 'pointer'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'scale(1.05)';
                e.currentTarget.style.boxShadow = '0 4px 16px rgba(124, 58, 237, 0.4)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'scale(1)';
                e.currentTarget.style.boxShadow = '0 2px 12px rgba(124, 58, 237, 0.3)';
              }}>
                <img
                  src={img.preview}
                  alt={`Selected ${index + 1}`}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    removeImage(index);
                  }}
                  style={{
                    position: 'absolute',
                    top: 4,
                    right: 4,
                    width: 18,
                    height: 18,
                    borderRadius: '50%',
                    background: 'rgba(239, 68, 68, 0.9)',
                    border: '2px solid white',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: 0,
                    transition: 'all 0.2s ease'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(220, 38, 38, 1)';
                    e.currentTarget.style.transform = 'scale(1.1)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'rgba(239, 68, 68, 0.9)';
                    e.currentTarget.style.transform = 'scale(1)';
                  }}
                  aria-label={`Remove image ${index + 1}`}
                >
                  <X size={10} color="white" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Input Area */}
      <ChatInput
        input={input}
        setInput={setInput}
        isLoading={isLoading}
        onSend={handleSend}
        onCameraClick={() => setShowImageUpload(true)}
        selectedImagesCount={selectedImages.length}
      />
    </div>
  );
}

// Helper: Extract exam context from message
function extractExamContextFromMessage(content: string): { grade?: string; subject?: string; topics?: string[] } {
  const lowerText = content.toLowerCase();
  
  let grade: string | undefined;
  const gradeMatch = lowerText.match(/grade\s*(\d+|r)/i);
  if (gradeMatch) {
    const gradeNum = gradeMatch[1];
    grade = gradeNum.toLowerCase() === 'r' ? 'grade_r' : `grade_${gradeNum}`;
  }
  
  let subject: string | undefined;
  const subjects = ['mathematics', 'english', 'physical sciences', 'life sciences', 'geography', 'history', 'accounting', 'business'];
  for (const subj of subjects) {
    if (lowerText.includes(subj)) {
      subject = subj.charAt(0).toUpperCase() + subj.slice(1);
      break;
    }
  }
  
  const topics: string[] = [];
  const topicMatch = lowerText.match(/(?:about|on|covering)\s+([a-z\s]+?)(?:\.|,|$)/i);
  if (topicMatch) {
    topics.push(topicMatch[1].trim());
  }
  
  return { grade, subject, topics: topics.length > 0 ? topics : undefined };
}
