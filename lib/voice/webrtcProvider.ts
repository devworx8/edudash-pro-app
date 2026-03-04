// OpenAI Realtime provider (WebSocket for web; native mobile uses WebRTC SDP negotiation)
// Streams mic to OpenAI Realtime and emits transcription/assistant tokens
// Now uses AudioModeCoordinator to prevent conflicts with TTS and notifications

import { Platform } from 'react-native';
import { wait } from '@/lib/utils/async';
import AudioModeCoordinator, { AudioModeSession } from '../AudioModeCoordinator';

export interface StartOptions {
  token: string; // OpenAI ephemeral client_secret
  url: string; // Realtime base URL (wss://api.openai.com/v1/realtime?model=...)
  language?: string; // 'en' | 'af' | 'zu' | 'xh' | 'nso'
  transcriptionModel?: string; // Must be 'whisper-1' for OpenAI Realtime API
  vadSilenceMs?: number; // VAD silence duration
  onPartialTranscript?: (t: string) => void;
  onFinalTranscript?: (t: string) => void;
  onAssistantToken?: (t: string) => void;
}

export interface WebRTCSession {
  start: (opts: StartOptions) => Promise<boolean>;
  stop: () => Promise<void>;
  isActive: () => boolean;
  updateTranscriptionConfig: (cfg: { language?: string; vadSilenceMs?: number; transcriptionModel?: string }) => void;
  setMuted: (muted: boolean) => void;
}

function buildRestUrlFromWs(wsUrl: string): string {
  // Convert wss://... to https://... for SDP negotiation
  try {
    const u = new URL(wsUrl);
    u.protocol = 'https:';
    return u.toString();
  } catch {
    return wsUrl.replace(/^wss:/, 'https:');
  }
}

export function createWebRTCSession(): WebRTCSession {
  let active = false;
  let closed = false;
  let ws: WebSocket | null = null; // web-only
  let localStream: any = null;
  let mediaRecorder: any = null; // web-only
  let audioChunkInterval: any = null; // legacy
  let isMuted = false;
  let audioSession: AudioModeSession | null = null; // Audio mode coordinator session

  // Native WebRTC refs
  let pc: any = null;
  let dc: any = null;

  return {
    async start(opts: StartOptions) {
      if (closed) {
        console.warn('[realtimeProvider] Session was closed, cannot restart');
        return false;
      }

      try {
        // Request streaming audio mode from coordinator
        audioSession = await AudioModeCoordinator.requestAudioMode('streaming');
        console.log('[realtimeProvider] 🎵 Streaming audio session started:', audioSession.id);

        const isWeb = Platform.OS === 'web';

        if (isWeb) {
          console.log('[realtimeProvider] Starting OpenAI Realtime over WebSocket (web)');
          const hasWebSocket = typeof WebSocket !== 'undefined';
          if (!hasWebSocket) throw new Error('WebSocket not available');

          // Browser: connect via WebSocket + MediaRecorder chunks
          const wsUrl = `${opts.url}${opts.url.includes('?') ? '&' : '?'}authorization=Bearer ${encodeURIComponent(opts.token)}`;
          ws = new WebSocket(wsUrl);
          ws.binaryType = 'arraybuffer';

          // Await open
          await new Promise<void>((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('WebSocket connection timeout')), 10000);
            ws!.onopen = () => { clearTimeout(timeout); resolve(); };
            ws!.onerror = (error) => { clearTimeout(timeout); reject(error as any); };
          });

          ws.onmessage = (event) => {
            try {
              const message = JSON.parse(event.data);
              
              // Log all event types for debugging
              if (message?.type) console.log('[realtimeProvider] WS event:', message.type);
              
              // Log error details
              if (message.type === 'error') {
                console.error('[realtimeProvider] ❌ ERROR from OpenAI:', JSON.stringify(message, null, 2));
                if (message.error) {
                  console.error('[realtimeProvider] Error type:', message.error.type);
                  console.error('[realtimeProvider] Error message:', message.error.message);
                  console.error('[realtimeProvider] Error code:', message.error.code);
                }
              }
              
              switch (message.type) {
                case 'conversation.item.input_audio_transcription.delta':
                  opts.onPartialTranscript?.(message.delta || '');
                  break;
                case 'conversation.item.input_audio_transcription.completed':
                  opts.onFinalTranscript?.(message.transcript || '');
                  break;
                case 'response.audio_transcript.delta':
                case 'response.output_text.delta':
                  opts.onAssistantToken?.(message.delta || '');
                  break;
                case 'response.audio_transcript.done':
                  if (message.transcript) opts.onAssistantToken?.(message.transcript);
                  break;
              }
            } catch { /* Intentional: non-fatal error */ }
          };

          // Mic capture
          const nav: any = typeof navigator !== 'undefined' ? navigator : null;
          if (!nav?.mediaDevices?.getUserMedia) throw new Error('getUserMedia not available');
          localStream = await nav.mediaDevices.getUserMedia({ audio: { channelCount: 1, sampleRate: 24000, echoCancellation: true, noiseSuppression: true } });

          const mimeType = (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported('audio/webm;codecs=opus'))
            ? 'audio/webm;codecs=opus' : 'audio/webm';
          mediaRecorder = new MediaRecorder(localStream, { mimeType, audioBitsPerSecond: 24000 });
          mediaRecorder.ondataavailable = async (event: any) => {
            if (event.data?.size > 0 && ws?.readyState === WebSocket.OPEN) {
              const arrayBuffer = await event.data.arrayBuffer();
              const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
              ws.send(JSON.stringify({ type: 'input_audio_buffer.append', audio: base64 }));
            }
          };
          mediaRecorder.start(100);

          // Start paused if muted
          try {
            if (isMuted && mediaRecorder.state === 'recording' && mediaRecorder.pause) mediaRecorder.pause();
          } catch { /* Intentional: non-fatal error */ }

          // Session config
          // OpenAI supported languages for Realtime API
          const supportedLanguages = ['af', 'ar', 'az', 'be', 'bg', 'bs', 'ca', 'cs', 'cy', 'da', 'de', 'el', 'en', 'es', 'et', 'fa', 'fi', 'fr', 'gl', 'he', 'hi', 'hr', 'hu', 'hy', 'id', 'is', 'it', 'ja', 'kk', 'kn', 'ko', 'lt', 'lv', 'mi', 'mk', 'mr', 'ms', 'ne', 'nl', 'no', 'pl', 'pt', 'ro', 'ru', 'sk', 'sl', 'sr', 'sv', 'sw', 'ta', 'th', 'tl', 'tr', 'uk', 'ur', 'vi', 'zh'];
          const langToSend = opts.language && supportedLanguages.includes(opts.language) ? opts.language : undefined;
          if (opts.language && !langToSend) {
            console.warn(`[realtimeProvider] ⚠️ Language '${opts.language}' not supported by OpenAI, using auto-detect`);
          }
          
          const sessionConfig = {
            type: 'session.update',
            session: {
              turn_detection: { type: 'server_vad', silence_duration_ms: Math.max(300, Math.min(2000, opts.vadSilenceMs ?? 500)) },
              input_audio_transcription: {
                model: opts.transcriptionModel || 'whisper-1',
                ...(langToSend ? { language: langToSend } : {}),
              },
              modalities: ['text', 'audio'],  // Ensure both text and audio responses
              voice: 'alloy',
            }
          };
          console.log('[realtimeProvider] 📤 Sending WS session config:', JSON.stringify(sessionConfig, null, 2));
          ws.send(JSON.stringify(sessionConfig));
          console.log('[realtimeProvider] ✅ WS session configuration sent');

          active = true;
          return true;
        }

        // Native (Android/iOS): Use react-native-webrtc + SDP negotiation
        console.log('[realtimeProvider] Starting OpenAI Realtime over WebRTC (native)');
        const { RTCPeerConnection, mediaDevices, RTCSessionDescription } = await import('react-native-webrtc');
        const restUrl = buildRestUrlFromWs(opts.url); // https://api.openai.com/v1/realtime?model=...

        // Get mic
        localStream = await mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 } as any, video: false } as any);

        // Create peer connection
        pc = new RTCPeerConnection({
          iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
        } as any);

        // Add audio track
        localStream.getAudioTracks().forEach((track: any) => {
          // Apply mute state immediately
          try { track.enabled = !isMuted; } catch { /* Intentional: non-fatal error */ }
          pc.addTrack(track, localStream);
        });

        // Data channel for events
        dc = pc.createDataChannel('oai-events');
        
        // Log data channel state changes
        dc.onclose = () => { console.log('[realtimeProvider] 🔴 Data channel state: closed'); };
        dc.onerror = (err: any) => { console.error('[realtimeProvider] ❌ Data channel error:', err); };
        
        dc.onmessage = (e: any) => {
          try {
            const raw = String(e.data || '');
            let message: any = {};
            try { message = JSON.parse(raw); } catch { console.log('[realtimeProvider] DC message (non-JSON):', raw.slice(0,120)); return; }
            
            // Log ALL events with full payload for debugging
            if (message?.type) {
              console.log('[realtimeProvider] 📨 DC event:', message.type);
              // Log full payload for important events
              if (message.type.includes('transcription') || message.type.includes('audio') || message.type === 'error' || message.type.includes('input_audio')) {
                console.log('[realtimeProvider] 📋 Full event:', JSON.stringify(message, null, 2));
              }
            }
            
            // Log error details
            if (message.type === 'error') {
              console.error('[realtimeProvider] ❌ ERROR from OpenAI:', JSON.stringify(message, null, 2));
              if (message.error) {
                console.error('[realtimeProvider] Error type:', message.error.type);
                console.error('[realtimeProvider] Error message:', message.error.message);
                console.error('[realtimeProvider] Error code:', message.error.code);
              }
            }
            
            // Log audio buffer events
            if (message.type === 'input_audio_buffer.speech_started') {
              console.log('[realtimeProvider] 🎤 Speech detected!');
            }
            if (message.type === 'input_audio_buffer.speech_stopped') {
              console.log('[realtimeProvider] 🛑 Speech stopped, processing...');
            }
            if (message.type === 'input_audio_buffer.committed') {
              console.log('[realtimeProvider] ✅ Audio buffer committed');
            }
            
            // Handle transcription failures
            if (message.type === 'conversation.item.input_audio_transcription.failed') {
              console.error('[realtimeProvider] ❌ Transcription failed:', message.error?.message);
              console.error('[realtimeProvider] 👉 Check: Is transcription model valid? Using whisper-1?');
              // Don't call error callbacks here as this is handled per-item, not fatal
            }
            
            switch (message.type) {
              case 'conversation.item.input_audio_transcription.delta':
                console.log('[realtimeProvider] 🎙️ PARTIAL transcript delta:', message.delta);
                opts.onPartialTranscript?.(message.delta || '');
                break;
              case 'conversation.item.input_audio_transcription.completed':
                console.log('[realtimeProvider] ✅ FINAL transcript:', message.transcript);
                opts.onFinalTranscript?.(message.transcript || '');
                break;
              case 'response.audio_transcript.delta':
              case 'response.output_text.delta':
                opts.onAssistantToken?.(message.delta || '');
                break;
              case 'response.audio_transcript.done':
                if (message.transcript) opts.onAssistantToken?.(message.transcript);
                break;
            }
          } catch (err) {
            console.error('[realtimeProvider] ❌ Message handler error:', err);
          }
        };

        // Create offer
        const offer = await pc.createOffer({ offerToReceiveAudio: false } as any);
        await pc.setLocalDescription(offer);

        // Wait briefly for ICE gathering (simple approach)
        const waitForIce = new Promise<void>((resolve) => {
          if (pc.iceGatheringState === 'complete') return resolve();
          const check = () => {
            if (pc.iceGatheringState === 'complete') resolve();
          };
          pc.addEventListener('icegatheringstatechange', check);
          setTimeout(() => resolve(), 1500);
        });
        await waitForIce;

        // POST SDP offer -> receive SDP answer
        const sdp = pc.localDescription?.sdp || offer.sdp || '';
        const resp = await fetch(restUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${opts.token}`,
            'Content-Type': 'application/sdp',
            'OpenAI-Beta': 'realtime=v1',
          },
          body: sdp,
        });
        if (!resp.ok) throw new Error(`Realtime SDP negotiation failed: ${resp.status}`);
        const answerSdp = await resp.text();
        await pc.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp: answerSdp } as any));

        // Wait for data channel to open (critical for transcription to work)
        console.log('[realtimeProvider] ⏳ Waiting for data channel to open...');
        const dataChannelReady = new Promise<boolean>((resolve, reject) => {
          const timeout = setTimeout(() => {
            console.error('[realtimeProvider] ❌ Data channel open timeout');
            reject(new Error('Data channel failed to open within 10 seconds'));
          }, 10000);
          
          dc.onopen = () => {
            clearTimeout(timeout);
            console.log('[realtimeProvider] 🟢 Data channel opened, configuring session...');
            try {
              // OpenAI supported languages for Realtime API
              const supportedLanguages = ['af', 'ar', 'az', 'be', 'bg', 'bs', 'ca', 'cs', 'cy', 'da', 'de', 'el', 'en', 'es', 'et', 'fa', 'fi', 'fr', 'gl', 'he', 'hi', 'hr', 'hu', 'hy', 'id', 'is', 'it', 'ja', 'kk', 'kn', 'ko', 'lt', 'lv', 'mi', 'mk', 'mr', 'ms', 'ne', 'nl', 'no', 'pl', 'pt', 'ro', 'ru', 'sk', 'sl', 'sr', 'sv', 'sw', 'ta', 'th', 'tl', 'tr', 'uk', 'ur', 'vi', 'zh'];
              const langToSend = opts.language && supportedLanguages.includes(opts.language) ? opts.language : undefined;
              if (opts.language && !langToSend) {
                console.warn(`[realtimeProvider] ⚠️ Language '${opts.language}' not supported by OpenAI, using auto-detect`);
              }
              
              const sessionConfig = {
                type: 'session.update',
                session: {
                  turn_detection: { type: 'server_vad', silence_duration_ms: Math.max(300, Math.min(2000, opts.vadSilenceMs ?? 700)) },
                  input_audio_transcription: {
                    model: opts.transcriptionModel || 'whisper-1',
                    ...(langToSend ? { language: langToSend } : {}),
                  },
                  modalities: ['text', 'audio'],  // Ensure both text and audio responses
                  voice: 'alloy',
                },
              };
              console.log('[realtimeProvider] 📤 Sending session config:', JSON.stringify(sessionConfig, null, 2));
              dc.send(JSON.stringify(sessionConfig));
              console.log('[realtimeProvider] ✅ Session configuration sent');
              resolve(true);
            } catch (e) {
              console.error('[realtimeProvider] ❌ Failed to send session config:', e);
              reject(e);
            }
          };
        });
        
        await dataChannelReady;
        console.log('[realtimeProvider] ✅ Data channel ready, stream fully initialized');
        active = true;
        return true;
      } catch (e) {
        console.warn('[realtimeProvider] ❌ start failed:', e);
        
        // Release audio session on failure
        if (audioSession) {
          await audioSession.release();
          console.log('[realtimeProvider] 🔓 Streaming audio session released (error)');
          audioSession = null;
        }
        
        // Cleanup on failure
        try {
          if (mediaRecorder?.stop) mediaRecorder.stop();
          if (mediaRecorder?.audioContext) {
            try { mediaRecorder.processor?.disconnect(); } catch { /* Intentional: non-fatal error */ }
            try { mediaRecorder.source?.disconnect(); } catch { /* Intentional: non-fatal error */ }
            try { mediaRecorder.audioContext?.close(); } catch { /* Intentional: non-fatal error */ }
          }
        } catch { /* Intentional: non-fatal error */ }
        try { if (audioChunkInterval) clearInterval(audioChunkInterval); } catch { /* Intentional: non-fatal error */ }
        try { localStream?.getTracks?.().forEach((t: any) => t.stop()); } catch { /* Intentional: non-fatal error */ }
        try { ws?.close(); } catch { /* Intentional: non-fatal error */ }
        try { dc?.close?.(); } catch { /* Intentional: non-fatal error */ }
        try { pc?.close?.(); } catch { /* Intentional: non-fatal error */ }
        active = false;
        return false;
      }
    },
    
    updateTranscriptionConfig: (cfg: { language?: string; vadSilenceMs?: number; transcriptionModel?: string }) => {
      try {
        const payload = {
          type: 'session.update',
          session: {
            ...(cfg.vadSilenceMs ? { turn_detection: { type: 'server_vad', silence_duration_ms: Math.max(300, Math.min(2000, cfg.vadSilenceMs)) } } : {}),
            ...(cfg.language || cfg.transcriptionModel
              ? { input_audio_transcription: {
                    ...(cfg.transcriptionModel ? { model: cfg.transcriptionModel } : {}),
                    ...(cfg.language ? { language: cfg.language } : {}),
                 } }
              : {}),
          },
        } as any;
        if (Platform.OS === 'web') {
          if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(payload));
        } else {
          try { dc?.send?.(JSON.stringify(payload)); } catch { /* Intentional: non-fatal error */ }
        }
      } catch { /* Intentional: non-fatal error */ }
    },

    setMuted: (muted: boolean) => {
      isMuted = !!muted;
      try {
        if (Platform.OS === 'web') {
          // Pause/resume MediaRecorder if available
          if (mediaRecorder) {
            try {
              if (isMuted && mediaRecorder.state === 'recording' && mediaRecorder.pause) mediaRecorder.pause();
              if (!isMuted && mediaRecorder.state === 'paused' && mediaRecorder.resume) mediaRecorder.resume();
            } catch { /* Intentional: non-fatal error */ }
          }
          // Also disable mic track to be safe
          const stream: any = localStream;
          if (stream?.getAudioTracks) {
            stream.getAudioTracks().forEach((t: any) => { try { t.enabled = !isMuted; } catch { /* Intentional: non-fatal error */ } });
          }
        } else {
          // Native: toggle track enabled
          const stream: any = localStream;
          if (stream?.getAudioTracks) {
            stream.getAudioTracks().forEach((t: any) => { try { t.enabled = !isMuted; } catch { /* Intentional: non-fatal error */ } });
          }
        }
      } catch { /* Intentional: non-fatal error */ }
    },
    
    async stop() {
      // Prevent re-entry
      if (closed || !active) {
        console.log('[realtimeProvider] Already stopped or not active');
        return;
      }
      
      closed = true;
      active = false;
      
      console.log('[realtimeProvider] Beginning cleanup...');
      
      try {
        // Stop MediaRecorder or AudioContext (web)
        if (mediaRecorder) {
          try {
            if (mediaRecorder.state !== undefined && mediaRecorder.state !== 'inactive') {
              mediaRecorder.stop();
            } else if (mediaRecorder.audioContext) {
              try { mediaRecorder.processor?.disconnect(); } catch { /* Intentional: non-fatal error */ }
              try { mediaRecorder.source?.disconnect(); } catch { /* Intentional: non-fatal error */ }
              try { mediaRecorder.audioContext?.close(); } catch { /* Intentional: non-fatal error */ }
            }
            mediaRecorder = null;
          } catch (e) {
            console.warn('[realtimeProvider] Media recorder stop error:', e);
          }
        }
        
        // Clear interval
        if (audioChunkInterval) {
          try { clearInterval(audioChunkInterval); audioChunkInterval = null; } catch { /* Intentional: non-fatal error */ }
        }
        
        // Stop all media tracks
        if (localStream) {
          try {
            const tracks = localStream.getTracks?.() || [];
            tracks.forEach((track: any) => { try { track.stop(); } catch { /* Intentional: non-fatal error */ } });
            localStream = null;
          } catch (e) {
            console.warn('[realtimeProvider] Stream getTracks error:', e);
          }
        }
        
        // Close WS (web)
        if (ws) {
          try {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: 'input_audio_buffer.commit' }));
              await wait(100);
            }
            ws.close();
            ws = null;
          } catch (e) {
            console.warn('[realtimeProvider] WebSocket close error:', e);
          }
        }

        // Native: commit audio buffer before closing
        try {
          if (dc && (dc as any).readyState === 'open') {
            try {
              (dc as any).send(JSON.stringify({ type: 'input_audio_buffer.commit' }));
              await wait(150);
              console.log('[realtimeProvider] ✅ Sent input_audio_buffer.commit (native)');
            } catch (e) {
              console.warn('[realtimeProvider] ⚠️ Failed to send commit on native:', e);
            }
          }
        } catch { /* Intentional: non-fatal error */ }
        
        // Close data channel / peer connection (native)
        try { dc?.close?.(); } catch { /* Intentional: non-fatal error */ }
        try { pc?.close?.(); } catch { /* Intentional: non-fatal error */ }
        dc = null; pc = null;
        
        // Release audio session
        if (audioSession) {
          try {
            await audioSession.release();
            console.log('[realtimeProvider] 🔓 Streaming audio session released');
            audioSession = null;
          } catch (e) {
            console.warn('[realtimeProvider] ⚠️ Failed to release audio session:', e);
          }
        }
        
        console.log('[realtimeProvider] ✅ Cleanup complete');
      } catch (error) {
        console.error('[realtimeProvider] Stop error:', error);
        mediaRecorder = null;
        localStream = null;
        ws = null;
        try { dc?.close?.(); } catch { /* Intentional: non-fatal error */ }
        try { pc?.close?.(); } catch { /* Intentional: non-fatal error */ }
        dc = null; pc = null;
        if (audioChunkInterval) { try { clearInterval(audioChunkInterval); } catch { /* Intentional: non-fatal error */ }; audioChunkInterval = null; }
      }
    },
    
    isActive() {
      return active && !closed;
    },
  };
}

