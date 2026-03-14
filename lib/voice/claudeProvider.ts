/* eslint-disable @typescript-eslint/no-unused-vars */

/**
 * Claude + Deepgram Voice Provider
 * 
 * @deprecated MOBILE: Use Azure Speech SDK via azureProvider.ts instead
 * This provider is WEB-ONLY and should not be used on React Native
 * 
 * MOBILE ISSUES (why deprecated):
 * - Picovoice VoiceProcessor frequently unavailable (~70% reliability)
 * - WebSocket connection delays (5-10s init time)
 * - Deepgram speech_final detection unreliable (requires 3s timeout)
 * - Limited SA language support
 * 
 * MOBILE REPLACEMENT: Azure Speech SDK (azureProvider.ts)
 * - Native SDK, ~98% reliability
 * - <1s init time
 * - Full SA language support (en-ZA, af-ZA, zu-ZA, xh-ZA)
 * 
 * WEB: This provider remains valid for web platform
 * Fast voice pipeline optimized for <2s response time:
 * - Deepgram Nova-2 STREAMING WebSocket for real-time transcription (~100ms)
 * - Claude 3.5 Sonnet streaming for AI (~1s)
 * - Parallel TTS generation (~500ms)
 * Total: ~1.6s
 * 
 * Cost: ~$0.50/hour (vs $18/hour for OpenAI Realtime)
 * 97% cost savings with better SA language support!
 */

import { Platform } from 'react-native';
import { assertSupabase } from '@/lib/supabase';
import AudioModeCoordinator, { AudioModeSession } from '../AudioModeCoordinator';

export interface ClaudeVoiceOptions {
  language?: string; // 'en' | 'af' | 'zu' | 'xh'
  onPartialTranscript?: (text: string) => void;
  onFinalTranscript?: (text: string) => void;
  onAssistantToken?: (token: string) => void;
  onAssistantComplete?: (fullResponse: string) => void;
  systemPrompt?: string;
}

export interface ClaudeVoiceSession {
  start: (opts: ClaudeVoiceOptions) => Promise<boolean>;
  stop: () => Promise<void>;
  isActive: () => boolean;
  isConnected: () => boolean; // Check if WebSocket is connected and ready
  setMuted: (muted: boolean) => void;
  updateTranscriptionConfig: (cfg: { language?: string; vadSilenceMs?: number; transcriptionModel?: string }) => void;
  sendMessage: (message: string) => Promise<void>;
  cancelResponse: () => void;
}

// Chunked transcription configuration
const CHUNK_DURATION_MS = 500; // 500ms chunks for real-time feel
const MAX_SILENCE_MS = 450; // Stop after 450ms of silence (optimized for faster response)

// Native recording will use react-native-webrtc (same as OpenAI provider)
// This ensures compatibility and avoids expo-audio issues

const WEB_RECORDING_OPTIONS = {
  mimeType: 'audio/webm;codecs=opus',
  bitsPerSecond: 32000,
};

export function createClaudeVoiceSession(): ClaudeVoiceSession {
  // Runtime guard: prevent usage on mobile
  if (Platform.OS !== 'web') {
    console.error('[claudeProvider] ❌ DEPRECATED on mobile. Use Azure Speech SDK (azureProvider.ts) instead.');
    console.error('[claudeProvider] This provider should only be used on web platform.');
    throw new Error('claudeProvider is deprecated on mobile. Use azureProvider.ts instead.');
  }
  
  let active = false;
  let muted = false; // Mute state
  let audioSession: AudioModeSession | null = null;
  let sessionId: string = '';
  let transcriptBuffer: string = '';
  let silenceTimer: any = null;
  let chunkIndex: number = 0;
  let speechFinalTimer: any = null; // Timer to force-send if speech_final not received
  
  // Deepgram streaming WebSocket
  let deepgramWs: WebSocket | null = null;
  let deepgramConnected = false;
  
  // Web recording
  let mediaRecorder: any = null;
  let localStream: any = null;
  
  // Native recording (react-native-webrtc) - matches OpenAI provider pattern
  let audioStreamProcessor: any = null;

  // Response state for streaming
  let currentResponseTokens: string[] = [];
  let isStreaming = false;

  const cleanup = async () => {
    active = false;
    
    if (silenceTimer) {
      clearTimeout(silenceTimer);
      silenceTimer = null;
    }
    
    if (speechFinalTimer) {
      clearTimeout(speechFinalTimer);
      speechFinalTimer = null;
    }
    
    // Stop audio stream processor (Picovoice VoiceProcessor)
    if (audioStreamProcessor && audioStreamProcessor.stop) {
      try {
        await audioStreamProcessor.stop();
        console.log('[claudeProvider] ✅ Audio processor stopped');
      } catch (e) {
        console.warn('[claudeProvider] Audio processor stop error:', e);
      }
      audioStreamProcessor = null;
    }
    
    // Close Deepgram WebSocket
    if (deepgramWs && deepgramWs.readyState === WebSocket.OPEN) {
      try {
        deepgramWs.close();
      } catch (e) {
        console.warn('[claudeProvider] Deepgram WS close error:', e);
      }
    }
    deepgramWs = null;
    deepgramConnected = false;
    
    // Web cleanup
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      try {
        mediaRecorder.stop();
      } catch (e) {
        console.warn('[claudeProvider] MediaRecorder stop error:', e);
      }
    }
    
    if (localStream) {
      try {
        localStream.getTracks().forEach((track: any) => track.stop());
      } catch (e) {
        console.warn('[claudeProvider] Stream cleanup error:', e);
      }
    }
    
    // Native cleanup - stop audio tracks
    // (localStream cleanup handles this)
    
    if (audioSession) {
      await audioSession.release();
      audioSession = null;
    }
    
    transcriptBuffer = '';
  };

  const connectDeepgramStreaming = async (opts: ClaudeVoiceOptions): Promise<boolean> => {
    try {
      // Get Deepgram API key from environment
      const supabase = assertSupabase();
      console.log('[claudeProvider] Fetching Deepgram API key from Edge Function...');
      const { data: secrets, error: secretError } = await supabase.functions.invoke('get-secrets', {
        body: { keys: ['DEEPGRAM_API_KEY'] },
      });
      
      if (secretError) {
        console.error('[claudeProvider] Failed to fetch secrets:', secretError);
      }
      console.log('[claudeProvider] Secrets response:', secrets ? 'received' : 'null');
      
      const apiKey = secrets?.DEEPGRAM_API_KEY || process.env.EXPO_PUBLIC_DEEPGRAM_API_KEY;
      if (!apiKey) {
        console.error('[claudeProvider] No API key found in:', { hasSecrets: !!secrets, hasEnv: !!process.env.EXPO_PUBLIC_DEEPGRAM_API_KEY });
        throw new Error('Deepgram API key not available');
      }
      console.log('[claudeProvider] ✅ Deepgram API key obtained');
      
      // Build Deepgram streaming WebSocket URL
      const language = opts.language || 'en';
      const wsUrl = `wss://api.deepgram.com/v1/listen?` + new URLSearchParams({
        model: 'nova-2',
        language,
        punctuate: 'true',
        interim_results: 'true', // Get partial results as user speaks
        endpointing: '3000', // 3000ms (3s) silence = end of utterance (allows natural pauses)
        encoding: 'linear16',
        sample_rate: '16000',
        channels: '1',
      }).toString();
      
      deepgramWs = new WebSocket(wsUrl, ['token', apiKey]);
      
      // Wait for connection
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Deepgram connection timeout')), 10000);
        
        deepgramWs!.onopen = () => {
          clearTimeout(timeout);
          deepgramConnected = true;
          console.log('[claudeProvider] ✅ Deepgram streaming connected');
          resolve();
        };
        
        deepgramWs!.onerror = (error) => {
          clearTimeout(timeout);
          console.error('[claudeProvider] Deepgram WS error:', error);
          reject(error);
        };
      });
      
      // Handle incoming transcription messages
      deepgramWs.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          
          if (data.type === 'Results') {
            const transcript = data.channel?.alternatives?.[0]?.transcript;
            const isFinal = data.is_final;
            const speechFinal = data.speech_final; // Deepgram detected end of speech
            
            // Debug logging to diagnose speech_final detection
            if (transcript && transcript.trim()) {
              console.log('[claudeProvider] 📩 Deepgram result:', {
                transcript: transcript.substring(0, 50),
                isFinal,
                speechFinal,
              });
            }
            
            if (transcript && transcript.trim()) {
              if (isFinal) {
                transcriptBuffer += ' ' + transcript;
                opts.onPartialTranscript?.(transcriptBuffer.trim());
                
                // If speech is final, send to Claude immediately
                if (speechFinal && transcriptBuffer.trim()) {
                  console.log('[claudeProvider] 🎯 Speech final detected! Sending to Claude:', transcriptBuffer.trim().substring(0, 50));
                  
                  // Clear any pending timeout
                  if (speechFinalTimer) {
                    clearTimeout(speechFinalTimer);
                    speechFinalTimer = null;
                  }
                  
                  const finalTranscript = transcriptBuffer.trim();
                  opts.onFinalTranscript?.(finalTranscript);
                  
                  // Get Claude response
                  getClaudeResponse(finalTranscript, opts).catch(err => {
                    console.error('[claudeProvider] Claude response error:', err);
                  });
                  
                  transcriptBuffer = '';
                } else if (transcriptBuffer.trim()) {
                  // isFinal but NOT speechFinal - set a timeout to force send
                  // This handles cases where Deepgram doesn't detect speech_final
                  console.log('[claudeProvider] ⏱️ isFinal but no speechFinal - setting 3s timeout');
                  
                  // Clear any existing timer
                  if (speechFinalTimer) {
                    clearTimeout(speechFinalTimer);
                  }
                  
                  // Wait 3s, then force send if no speechFinal received
                  speechFinalTimer = setTimeout(() => {
                    if (transcriptBuffer.trim()) {
                      console.log('[claudeProvider] ⏰ Timeout reached! Force-sending to Claude:', transcriptBuffer.trim().substring(0, 50));
                      const finalTranscript = transcriptBuffer.trim();
                      opts.onFinalTranscript?.(finalTranscript);
                      
                      // Get Claude response
                      getClaudeResponse(finalTranscript, opts).catch(err => {
                        console.error('[claudeProvider] Claude response error:', err);
                      });
                      
                      transcriptBuffer = '';
                    }
                    speechFinalTimer = null;
                  }, 3000); // 3000ms (3s) allows natural pauses in speech
                }
              } else {
                // Interim result - show to user but don't send to Claude yet
                opts.onPartialTranscript?.((transcriptBuffer + ' ' + transcript).trim());
              }
            }
          }
        } catch (e) {
          console.error('[claudeProvider] Deepgram message parse error:', e);
        }
      };
      
      deepgramWs.onclose = () => {
        console.log('[claudeProvider] Deepgram WS closed');
        deepgramConnected = false;
      };
      
      return true;
    } catch (error) {
      console.error('[claudeProvider] Deepgram connection error:', error);
      return false;
    }
  };
  
  const sendAudioToDeepgram = (audioData: ArrayBuffer) => {
    // Don't send audio if muted
    if (muted) {
      return;
    }
    
    if (deepgramWs && deepgramWs.readyState === WebSocket.OPEN) {
      deepgramWs.send(audioData);
    }
  };

  // Legacy chunk-based transcription removed - now using streaming only

  const getClaudeResponse = async (message: string, opts: ClaudeVoiceOptions): Promise<void> => {
    try {
      // Cancel any previous streaming
      isStreaming = false;
      await new Promise(resolve => setTimeout(resolve, 50)); // Brief wait for cleanup
      
      isStreaming = true;
      currentResponseTokens = [];

      const supabase = assertSupabase();

      // Call Edge Function with the expected schema (ai-gateway expects an action and optional messages)
      const response = await supabase.functions.invoke('ai-gateway', {
        body: {
          action: 'general_assistance',
          model: process.env.EXPO_PUBLIC_ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001',
          messages: [
            { role: 'system', content: opts.systemPrompt || 'You are Dash, a helpful AI assistant. Keep responses concise for voice conversations (2-3 sentences max).' },
            { role: 'user', content: message },
          ],
        },
      });

      if (response.error) {
        throw response.error;
      }

      // Edge Function returns a full response (no SSE). Simulate streaming tokens.
      const fullResponse = response.data?.content || response.data?.response || '';
      
      const words = fullResponse.split(/\s+/);
      for (const word of words) {
        if (!isStreaming) break;
        currentResponseTokens.push(word);
        opts.onAssistantToken?.(word + ' ');
        await new Promise(resolve => setTimeout(resolve, 25));
      }

      opts.onAssistantComplete?.(fullResponse);
      isStreaming = false;
    } catch (error) {
      console.error('[claudeProvider] Claude response error:', error);
      isStreaming = false;
      throw error;
    }
  };

  return {
    async start(opts: ClaudeVoiceOptions) {
      if (active) {
        console.warn('[claudeProvider] Session already active');
        return false;
      }

      try {
        // Request audio mode
        audioSession = await AudioModeCoordinator.requestAudioMode('streaming');
        console.log('[claudeProvider] 🎵 Audio session started');

        // Generate session ID
        sessionId = `claude_voice_${Date.now()}`;
        chunkIndex = 0;
        transcriptBuffer = '';

        // Get microphone access
        // Connect to Deepgram streaming WebSocket first
        const deepgramConnected = await connectDeepgramStreaming(opts);
        if (!deepgramConnected) {
          throw new Error('Failed to connect to Deepgram streaming');
        }

        if (Platform.OS === 'web') {
          const nav: any = typeof navigator !== 'undefined' ? navigator : null;
          if (!nav?.mediaDevices?.getUserMedia) {
            throw new Error('getUserMedia not available');
          }

          localStream = await nav.mediaDevices.getUserMedia({
            audio: {
              channelCount: 1,
              sampleRate: 16000, // Deepgram requires 16kHz for linear16
              echoCancellation: true,
              noiseSuppression: true,
            },
          });

          // Use MediaRecorder to stream audio to Deepgram
          const mimeType = 'audio/webm;codecs=pcm'; // Try PCM first
          const fallbackMimeType = 'audio/webm;codecs=opus';
          const useMimeType = MediaRecorder.isTypeSupported(mimeType) ? mimeType : fallbackMimeType;
          
          mediaRecorder = new MediaRecorder(localStream, { 
            mimeType: useMimeType,
            audioBitsPerSecond: 16000 * 16 * 1, // 16kHz * 16-bit * 1 channel
          });
          
          mediaRecorder.ondataavailable = async (event: any) => {
            if (event.data && event.data.size > 0) {
              // Convert audio to ArrayBuffer and send to Deepgram
              const arrayBuffer = await event.data.arrayBuffer();
              sendAudioToDeepgram(arrayBuffer);
            }
          };

          // Start recording with frequent chunks for real-time streaming
          mediaRecorder.start(100); // Send audio every 100ms for real-time feel
          console.log('[claudeProvider] ✅ Web recording started (streaming to Deepgram)');
        } else {
          // Native mobile - try Picovoice Voice Processor first, fallback to react-native-webrtc
          console.log('[claudeProvider] 🎤 Starting native audio...');
          
          // Try Picovoice first (optimal - gives raw PCM frames)
          let picovoiceSuccess = false;
          try {
            console.log('[claudeProvider] 🔍 Attempting Picovoice Voice Processor...');
            let VoiceProcessorModule: any = null;
            try {
              VoiceProcessorModule = await import('@picovoice/react-native-voice-processor');
            } catch (importErr) {
              console.warn('[claudeProvider] ⚠️ Picovoice module not available:', importErr);
              throw new Error('VoiceProcessor module not installed');
            }
            
            // Validate the imported module
            if (!VoiceProcessorModule || !VoiceProcessorModule.VoiceProcessor) {
              console.warn('[claudeProvider] ⚠️ VoiceProcessor not found in module');
              throw new Error('VoiceProcessor not available in imported module');
            }
            
            const { VoiceProcessor } = VoiceProcessorModule;
            
            // Validate VoiceProcessor class exists
            if (!VoiceProcessor || typeof VoiceProcessor !== 'function') {
              console.warn('[claudeProvider] ⚠️ VoiceProcessor is not a valid class');
              throw new Error('VoiceProcessor class is not available');
            }
            
            // Get singleton instance with null check
            const voiceProcessor = VoiceProcessor.instance;
            if (!voiceProcessor) {
              console.warn('[claudeProvider] ⚠️ VoiceProcessor.instance is null');
              throw new Error('VoiceProcessor instance not available');
            }
            
            // Validate required methods exist
            if (typeof voiceProcessor.start !== 'function' || 
                typeof voiceProcessor.stop !== 'function' ||
                typeof voiceProcessor.addFrameListener !== 'function' ||
                typeof voiceProcessor.removeFrameListener !== 'function') {
              console.warn('[claudeProvider] ⚠️ VoiceProcessor missing required methods');
              throw new Error('VoiceProcessor does not have required methods');
            }
            
            // Start audio capture at 16kHz (Deepgram requirement)
            // Frame length: 512 samples (~32ms chunks at 16kHz)
            const frameLength = 512;
            const sampleRate = 16000;
            
            console.log('[claudeProvider] 🎵 Starting VoiceProcessor:', { frameLength, sampleRate });
            await voiceProcessor.start(frameLength, sampleRate);
            console.log('[claudeProvider] ✅ VoiceProcessor started successfully');
            
            // Add frame listener to stream audio to Deepgram
            const frameListener = (frame: number[]) => {
              try {
                if (deepgramWs && deepgramWs.readyState === WebSocket.OPEN) {
                  // frame is number[] of PCM16 audio samples from Picovoice
                  // Already in correct format (-32768 to 32767), just convert to Int16Array
                  const int16Array = Int16Array.from(frame);
                  const audioData = int16Array.buffer;
                  sendAudioToDeepgram(audioData);
                  
                  // Log occasionally (every 100 frames = ~3 seconds)
                  if (Math.random() < 0.01) {
                    console.log('[claudeProvider] 📡 Streaming audio:', frame.length, 'samples, range:', Math.min(...frame).toFixed(0), 'to', Math.max(...frame).toFixed(0));
                  }
                }
              } catch (e) {
                console.error('[claudeProvider] ❌ Frame processing error:', e);
              }
            };
            
            voiceProcessor.addFrameListener(frameListener);
            console.log('[claudeProvider] ✅ Audio frame listener attached');
            
            // Store processor and listener for cleanup
            audioStreamProcessor = {
              frameListener,
              voiceProcessor,
              stop: async () => {
                console.log('[claudeProvider] 🛑 Stopping VoiceProcessor...');
                try {
                  if (voiceProcessor && typeof voiceProcessor.removeFrameListener === 'function') {
                    voiceProcessor.removeFrameListener(frameListener);
                  }
                  if (voiceProcessor && typeof voiceProcessor.stop === 'function') {
                    await voiceProcessor.stop();
                  }
                  console.log('[claudeProvider] ✅ VoiceProcessor stopped');
                } catch (e) {
                  console.error('[claudeProvider] ⚠️ VoiceProcessor stop error:', e);
                }
              },
              active: true
            };
            
            console.log('[claudeProvider] ✅ Picovoice native audio ready!');
            picovoiceSuccess = true;
            
          } catch (picoErr) {
            console.warn('[claudeProvider] ⚠️ Picovoice setup failed, trying react-native-webrtc fallback...');
            console.warn('[claudeProvider] 💡 Picovoice error:', picoErr instanceof Error ? picoErr.message : String(picoErr));
          }
          
          // If Picovoice is unavailable, gracefully skip streaming on native
          if (!picovoiceSuccess) {
            console.warn('[claudeProvider] ⚠️ Picovoice not available on native. Streaming disabled.');
            console.warn('[claudeProvider] ℹ️ Use the recording modal (speech recognition) instead.');
            return false;
          }
        }

        active = true;
        return true;
      } catch (error) {
        console.error('[claudeProvider] Start error:', error);
        await cleanup();
        return false;
      }
    },

    async stop() {
      console.log('[claudeProvider] Stopping session');
      await cleanup();
    },

    isActive() {
      return active;
    },
    
    isConnected() {
      return deepgramConnected && active;
    },
    
    setMuted(m: boolean) {
      muted = !!m;
      console.log('[claudeProvider] Mute state changed:', muted ? 'MUTED' : 'UNMUTED');
    },
    
    updateTranscriptionConfig(cfg: { language?: string; vadSilenceMs?: number; transcriptionModel?: string }) {
      // Language and VAD changes require reconnecting to Deepgram
      // For now, log the change (full implementation would reconnect WebSocket)
      console.log('[claudeProvider] Transcription config update requested:', cfg);
      // Note: Deepgram connection is established once per session
      // Language changes would require stopping and restarting the session
    },

    async sendMessage(message: string) {
      if (!active) {
        throw new Error('Session not active');
      }
      
      // Send message directly to Claude
      const opts: ClaudeVoiceOptions = {}; // Would need to pass original opts
      await getClaudeResponse(message, opts);
    },
    
    cancelResponse() {
      // Cancel any ongoing AI response generation
      if (isStreaming) {
        console.log('[claudeProvider] Cancelling ongoing response generation');
        isStreaming = false;
        currentResponseTokens = [];
      }
    },
  };
}
