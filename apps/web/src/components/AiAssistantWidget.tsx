import React, { useState, useRef, useEffect, useCallback } from 'react';
import { AiChatMessage, AiProposedAction } from '@nexus-ways/shared';
import { aiApi } from '../services/ai';

interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: {
      isFinal: boolean;
      0: { transcript: string };
    };
  };
}

interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

function formatTextForSpeech(text: string): string {
  return text
    .replace(/\*\*/g, '')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/#+\s*/g, '')
    .replace(/\bkm\/h\b/gi, 'kilometers per hour')
    .replace(/\bETA\b/g, 'E T A')
    .replace(/\bHOS\b/g, 'H O S')
    .replace(/•/g, '')
    .trim();
}

function containsTamil(text: string): boolean {
  return /[\u0B80-\u0BFF]/.test(text);
}

/**
 * Lightweight formatter for **bold**, `code`, bullet lists, and compact markdown tables.
 */
const FormattedMessageContent: React.FC<{ content: string }> = ({ content }) => {
  const lines = content.split('\n');

  const renderInline = (line: string) => {
    const parts = line.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
    return parts.map((part, idx) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return (
          <strong key={idx} className="font-semibold text-slate-900">
            {part.slice(2, -2)}
          </strong>
        );
      }
      if (part.startsWith('`') && part.endsWith('`')) {
        return (
          <code key={idx} className="px-1 py-0.5 bg-slate-100 text-slate-800 rounded text-[12px] font-mono">
            {part.slice(1, -1)}
          </code>
        );
      }
      return <React.Fragment key={idx}>{part}</React.Fragment>;
    });
  };

  return (
    <div className="space-y-1 break-words">
      {lines.map((line, i) => {
        if (line.trim().startsWith('|') && line.trim().endsWith('|')) {
          if (/^\|[\s\-:|]+\|$/.test(line.trim())) return null;
          const cells = line
            .trim()
            .slice(1, -1)
            .split('|')
            .map((c) => c.trim());
          return (
            <div key={i} className="grid gap-1 text-[11px] bg-slate-50 border border-slate-200 rounded px-2 py-1"
              style={{ gridTemplateColumns: `repeat(${cells.length}, minmax(0, 1fr))` }}>
              {cells.map((cell, ci) => (
                <span key={ci} className="truncate font-mono">
                  {renderInline(cell)}
                </span>
              ))}
            </div>
          );
        }
        return (
          <div key={i} className={line.trim() === '' ? 'h-1.5' : ''}>
            {renderInline(line)}
          </div>
        );
      })}
    </div>
  );
};

export const AiAssistantWidget: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState('Analysing fleet twin & operations data...');
  const [lastFailedPrompt, setLastFailedPrompt] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [expandedTools, setExpandedTools] = useState<Record<string, boolean>>({});
  const [actionLoadingByMsg, setActionLoadingByMsg] = useState<Record<string, boolean>>({});
  const [actionErrorByMsg, setActionErrorByMsg] = useState<Record<string, string | null>>({});

  // Voice Input state
  const [isRecording, setIsRecording] = useState(false);
  const [speechLang, setSpeechLang] = useState<'en-IN' | 'ta-IN'>('en-IN');
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [interimTranscript, setInterimTranscript] = useState('');
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  // Text-to-Speech state
  const [speakingMsgId, setSpeakingMsgId] = useState<string | null>(null);
  const [isPaused, setIsPaused] = useState(false);
  const [ttsNotice, setTtsNotice] = useState<string | null>(null);

  const [messages, setMessages] = useState<AiChatMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content:
        'Hello! I am your NEXUS WAYS Operations Copilot. Ask me in English, தமிழ், or Tanglish about live fleet status, vehicle delays, routes, alerts, or Digital Twin predictions.',
      createdAt: new Date().toISOString(),
    },
  ]);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView?.({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
    }
  }, [messages, isOpen, loading]);

  // Cleanup speech synthesis & recognition on unmount
  useEffect(() => {
    return () => {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {
          // ignore
        }
      }
    };
  }, []);

  const sendMessageText = useCallback(
    async (textToSend: string) => {
      const trimmed = textToSend.trim();
      if (!trimmed || loading) return;

      const userMessage: AiChatMessage = {
        id: `usr_${Date.now()}`,
        role: 'user',
        content: trimmed,
        createdAt: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, userMessage]);
      setInput('');
      setLastFailedPrompt(null);
      setLoading(true);
      setLoadingStatus('Analysing fleet twin & querying live operations...');

      try {
        const response = await aiApi.chat({
          message: userMessage.content,
          conversationHistory: messages.slice(-10).map((m) => ({
            role: m.role === 'user' ? 'user' : 'assistant',
            content: m.content,
          })),
        });

        setMessages((prev) => [...prev, response]);
      } catch (err: any) {
        console.error('AI chat error:', err);
        setLastFailedPrompt(trimmed);
        setMessages((prev) => [
          ...prev,
          {
            id: `err_${Date.now()}`,
            role: 'assistant',
            content: `Sorry, I encountered an error processing your request: ${err?.message || 'Network error'}. Click Retry below to try again.`,
            createdAt: new Date().toISOString(),
            isFallback: true,
            fallbackReason: 'REQUEST_FAILED',
          },
        ]);
      } finally {
        setLoading(false);
      }
    },
    [loading, messages],
  );

  const handleSend = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    await sendMessageText(input);
  };

  // Voice Input (Web Speech API)
  const toggleRecording = () => {
    setVoiceError(null);
    if (isRecording) {
      try {
        recognitionRef.current?.stop();
      } catch {
        // ignore
      }
      setIsRecording(false);
      setInterimTranscript('');
      return;
    }

    const win = window as any;
    const SpeechRecognitionCtor = win.SpeechRecognition || win.webkitSpeechRecognition;
    if (!SpeechRecognitionCtor) {
      setVoiceError('Voice input is not supported in this browser. Please use Chrome or Edge, or type your message.');
      return;
    }

    try {
      const recognition: SpeechRecognitionLike = new SpeechRecognitionCtor();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = speechLang;

      let finalText = '';

      recognition.onresult = (event: SpeechRecognitionEventLike) => {
        let interim = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalText += transcript + ' ';
          } else {
            interim += transcript;
          }
        }
        setInterimTranscript(interim);
        if (finalText.trim()) {
          setInput(finalText.trim());
        }
      };

      recognition.onerror = (event: { error: string }) => {
        setIsRecording(false);
        setInterimTranscript('');
        if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
          setVoiceError('Microphone permission denied. Please allow microphone access in browser settings.');
        } else if (event.error === 'no-speech') {
          setVoiceError('No speech detected. Please speak clearly and try again.');
        } else {
          setVoiceError(`Voice recognition error: ${event.error}`);
        }
      };

      recognition.onend = () => {
        setIsRecording(false);
        setInterimTranscript('');
        if (finalText.trim()) {
          sendMessageText(finalText.trim());
        }
      };

      recognitionRef.current = recognition;
      recognition.start();
      setIsRecording(true);
    } catch (err: any) {
      setIsRecording(false);
      setVoiceError(err?.message || 'Unable to start voice recognition.');
    }
  };

  // Text-to-Speech (Web SpeechSynthesis)
  const handleSpeak = (msg: AiChatMessage) => {
    setTtsNotice(null);
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      setTtsNotice('Text-to-speech is not supported in this browser.');
      return;
    }

    const synth = window.speechSynthesis;

    // If clicking the currently active message: toggle pause/resume
    if (speakingMsgId === msg.id) {
      if (isPaused) {
        synth.resume();
        setIsPaused(false);
      } else {
        synth.pause();
        setIsPaused(true);
      }
      return;
    }

    // Stop any previous playback before starting new message
    synth.cancel();
    setIsPaused(false);

    const cleanText = formatTextForSpeech(msg.content);
    const utterance = new SpeechSynthesisUtterance(cleanText);
    const isTamilText = containsTamil(msg.content);
    const targetLang = isTamilText ? 'ta-IN' : 'en-IN';
    utterance.lang = targetLang;
    utterance.rate = 1.0;

    const voices = synth.getVoices();
    if (voices.length > 0) {
      const matchedVoice =
        voices.find((v) => v.lang.toLowerCase() === targetLang.toLowerCase()) ||
        voices.find((v) => v.lang.toLowerCase().startsWith(isTamilText ? 'ta' : 'en'));
      if (matchedVoice) {
        utterance.voice = matchedVoice;
      } else if (isTamilText) {
        setTtsNotice('Tamil system voice unavailable; using default voice.');
      }
    }

    utterance.onend = () => {
      setSpeakingMsgId(null);
      setIsPaused(false);
    };
    utterance.onerror = () => {
      setSpeakingMsgId(null);
      setIsPaused(false);
    };

    setSpeakingMsgId(msg.id);
    synth.speak(utterance);
  };

  const handleStopSpeak = () => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setSpeakingMsgId(null);
    setIsPaused(false);
  };

  const handleCopy = async (msg: AiChatMessage) => {
    try {
      await navigator.clipboard.writeText(msg.content);
      setCopiedId(msg.id);
      setTimeout(() => setCopiedId(null), 1500);
    } catch {
      // ignore
    }
  };

  const handleConfirmAction = async (action: AiProposedAction, confirm: boolean, messageId: string) => {
    if (actionLoadingByMsg[messageId]) return;

    setActionLoadingByMsg((prev) => ({ ...prev, [messageId]: true }));
    setActionErrorByMsg((prev) => ({ ...prev, [messageId]: null }));

    try {
      const result = await aiApi.confirmAction({
        actionId: action.id,
        actionType: action.actionType,
        payload: action.payload,
        confirmed: confirm,
      });

      setMessages((prev) =>
        prev.map((m) => {
          if (m.id === messageId && m.proposedAction) {
            return {
              ...m,
              proposedAction: {
                ...m.proposedAction,
                status: confirm ? 'confirmed' : 'rejected',
              },
            };
          }
          return m;
        }),
      );

      setMessages((prev) => [
        ...prev,
        {
          id: `act_res_${Date.now()}`,
          role: 'assistant',
          content: result.message,
          createdAt: new Date().toISOString(),
        },
      ]);
    } catch (err: any) {
      console.error('Action execution failed:', err);
      const errMsg = err?.message || 'Unknown error';
      // Preserve pending status so the user can retry safely
      setActionErrorByMsg((prev) => ({
        ...prev,
        [messageId]: `Failed to execute action: ${errMsg}`,
      }));
    } finally {
      setActionLoadingByMsg((prev) => ({ ...prev, [messageId]: false }));
    }
  };

  return (
    <div className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-[9999] flex flex-col items-end pointer-events-auto">
      {/* Floating Trigger Button */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-lg hover:shadow-xl transition-all duration-200 transform hover:scale-105 border border-blue-400/30 cursor-pointer"
          aria-label="Open AI Assistant"
        >
          <svg className="w-5 h-5 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          <span className="font-semibold text-sm tracking-wide">NEXUS AI</span>
        </button>
      )}

      {/* Chat Window */}
      {isOpen && (
        <div className="w-[calc(100vw-2rem)] sm:w-[420px] h-[580px] max-h-[85vh] bg-white border border-slate-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden text-slate-800 animate-in fade-in zoom-in-95 duration-200">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 bg-slate-50 border-b border-slate-200/80">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-full bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600 font-bold text-xs">
                AI
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900 tracking-wide">Operations Copilot</h3>
                <span className="text-[10px] text-emerald-600 font-mono font-medium">
                  Gemini 3 Flash • EN / தமிழ் • Live Tools
                </span>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setSpeechLang((prev) => (prev === 'en-IN' ? 'ta-IN' : 'en-IN'))}
                className="px-2 py-0.5 text-[10px] font-mono font-semibold bg-white border border-slate-300 rounded text-slate-700 hover:bg-slate-100 cursor-pointer"
                title="Switch voice recognition language (English / Tamil)"
                aria-label="Toggle voice language"
              >
                {speechLang === 'en-IN' ? 'MIC: EN' : 'MIC: தமிழ்'}
              </button>
              <button
                onClick={() => setIsOpen(false)}
                className="text-slate-400 hover:text-slate-700 p-1 rounded-lg hover:bg-slate-100 transition cursor-pointer"
                aria-label="Close AI chat"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {/* Messages Area */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/50">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
              >
                {/* Fallback Mode Badge */}
                {msg.isFallback && (
                  <div className="text-[10px] bg-amber-50 text-amber-700 border border-amber-200 rounded px-2 py-0.5 mb-1.5 font-mono">
                    Fallback Mode Active{msg.fallbackReason ? ` (${msg.fallbackReason})` : ''}
                  </div>
                )}

                {/* Tool Calls Execution Badges (collapsible) */}
                {msg.toolCalls && msg.toolCalls.length > 0 && (
                  <div className="mb-2 space-y-1.5 w-full max-w-[90%]">
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedTools((prev) => ({ ...prev, [msg.id]: !prev[msg.id] }))
                      }
                      className="text-[11px] bg-white text-slate-700 border border-slate-300 rounded-md px-2.5 py-1 flex items-center gap-1.5 shadow-xs font-mono hover:bg-slate-50 cursor-pointer"
                    >
                      <span className="text-blue-600 font-bold">⚡</span>
                      <span>
                        Executed {msg.toolCalls.length} live tool{msg.toolCalls.length > 1 ? 's' : ''}:{' '}
                        {msg.toolCalls.map((t) => t.name).join(', ')}
                      </span>
                      <span className="text-slate-400 ml-1">{expandedTools[msg.id] ? '▲' : '▼'}</span>
                    </button>

                    {!expandedTools[msg.id] &&
                      msg.toolCalls.map((tool, idx) => (
                        <div
                          key={idx}
                          className={`text-[11px] bg-white text-slate-700 border rounded-md p-2 flex items-start gap-2 shadow-xs font-mono ${tool.result?.error ? 'border-rose-400 bg-rose-50/40' : 'border-slate-800'
                            }`}
                        >
                          <span className={`font-bold ${tool.result?.error ? 'text-rose-600' : 'text-blue-600'}`}>
                            {tool.result?.error ? '⚠' : '⚡'} tool:
                          </span>
                          <div className="flex-1 overflow-hidden">
                            <div className="font-semibold text-slate-900 flex items-center justify-between gap-2">
                              <span>{tool.name}()</span>
                              <span className={`text-[10px] ${tool.result?.error ? 'text-rose-600' : 'text-emerald-600'}`}>
                                {tool.result?.error ? 'FAILED' : 'OK'}
                              </span>
                            </div>
                            {tool.result && (
                              <div className="text-[10px] text-slate-500 truncate mt-0.5">
                                Result: {typeof tool.result === 'object' ? JSON.stringify(tool.result) : tool.result}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                  </div>
                )}

                {/* Message Bubble */}
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${msg.role === 'user'
                    ? 'bg-blue-600 text-white rounded-tr-none shadow-xs'
                    : 'bg-white text-slate-800 border border-slate-800 rounded-tl-none shadow-xs'
                    }`}
                >
                  {msg.role === 'user' ? (
                    <div className="whitespace-pre-wrap">{msg.content}</div>
                  ) : (
                    <FormattedMessageContent content={msg.content} />
                  )}
                </div>

                {/* Assistant Action Bar: Listen (TTS) + Copy + Retry */}
                {msg.role === 'assistant' && (
                  <div className="flex items-center gap-2 mt-1 px-1">
                    <button
                      type="button"
                      onClick={() => handleSpeak(msg)}
                      className="text-[11px] text-slate-500 hover:text-blue-600 flex items-center gap-1 py-0.5 px-1.5 rounded hover:bg-slate-100 transition cursor-pointer"
                      aria-label={speakingMsgId === msg.id ? (isPaused ? 'Resume audio' : 'Pause audio') : 'Listen to response'}
                    >
                      <span>{speakingMsgId === msg.id ? (isPaused ? '▶️ Resume' : '⏸️ Pause') : '🔊 Listen'}</span>
                    </button>

                    {speakingMsgId === msg.id && (
                      <button
                        type="button"
                        onClick={handleStopSpeak}
                        className="text-[11px] text-rose-600 hover:text-rose-700 py-0.5 px-1.5 rounded hover:bg-rose-50 transition cursor-pointer"
                        aria-label="Stop audio"
                      >
                        ⏹️ Stop
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => handleCopy(msg)}
                      className="text-[11px] text-slate-500 hover:text-slate-800 py-0.5 px-1.5 rounded hover:bg-slate-100 transition cursor-pointer"
                      aria-label="Copy response"
                    >
                      {copiedId === msg.id ? '✓ Copied' : '📋 Copy'}
                    </button>

                    {msg.fallbackReason === 'REQUEST_FAILED' && lastFailedPrompt && (
                      <button
                        type="button"
                        onClick={() => sendMessageText(lastFailedPrompt)}
                        className="text-[11px] text-blue-600 hover:text-blue-700 font-medium py-0.5 px-1.5 rounded hover:bg-blue-50 transition cursor-pointer"
                      >
                        ↻ Retry
                      </button>
                    )}
                  </div>
                )}

                {/* Proposed Action Confirmation Card */}
                {msg.proposedAction && (
                  <div
                    data-testid="proposed-action-card"
                    className="mt-3 w-full max-w-[90%] bg-amber-50/80 border border-amber-200 rounded-xl p-3.5 shadow-xs"
                  >
                    <div className="flex items-center gap-2 text-xs font-bold text-amber-800 uppercase tracking-wider mb-1">
                      <svg className="w-4 h-4 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                      <span>Action Confirmation Required</span>
                    </div>
                    <div className="text-xs text-slate-700 mb-3">{msg.proposedAction.description}</div>

                    {actionErrorByMsg[msg.id] && (
                      <div
                        data-testid="action-error-banner"
                        className="mb-2.5 text-[11px] bg-rose-50 text-rose-700 border border-rose-200 rounded-md px-2.5 py-1.5"
                      >
                        {actionErrorByMsg[msg.id]}
                      </div>
                    )}

                    {msg.proposedAction.status === 'pending' ? (
                      <div className="flex items-center gap-2">
                        <button
                          data-testid="apply-action-btn"
                          disabled={!!actionLoadingByMsg[msg.id]}
                          onClick={() => handleConfirmAction(msg.proposedAction!, true, msg.id)}
                          className="flex-1 py-1.5 px-3 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-300 text-white rounded font-medium text-xs transition cursor-pointer"
                        >
                          {actionLoadingByMsg[msg.id]
                            ? 'Applying...'
                            : actionErrorByMsg[msg.id]
                            ? 'Retry Apply'
                            : 'Apply'}
                        </button>
                        <button
                          data-testid="reject-action-btn"
                          disabled={!!actionLoadingByMsg[msg.id]}
                          onClick={() => handleConfirmAction(msg.proposedAction!, false, msg.id)}
                          className="flex-1 py-1.5 px-3 bg-slate-200 hover:bg-slate-300 disabled:opacity-50 text-slate-700 rounded font-medium text-xs transition cursor-pointer"
                        >
                          Reject
                        </button>
                      </div>
                    ) : (
                      <div className="text-xs font-mono">
                        <span className="text-slate-500">Status: </span>
                        <span
                          className={`font-semibold uppercase ${msg.proposedAction.status === 'confirmed' ? 'text-emerald-700' : 'text-rose-700'
                            }`}
                        >
                          {msg.proposedAction.status}
                        </span>
                      </div>
                    )}
                  </div>
                )}

                <span className="text-[10px] text-slate-400 mt-0.5 px-1">
                  {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            ))}

            {loading && (
              <div className="flex items-center gap-2 text-slate-500 text-xs py-2">
                <div className="w-2 h-2 rounded-full bg-blue-600 animate-ping" />
                <span>{loadingStatus}</span>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Voice / TTS Status Banners */}
          {(isRecording || voiceError || ttsNotice) && (
            <div className="px-3 py-1.5 bg-slate-100 border-t border-slate-200 text-[11px] flex items-center justify-between">
              {isRecording ? (
                <span className="text-rose-600 font-medium flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-rose-600 animate-pulse" />
                  Listening ({speechLang === 'ta-IN' ? 'தமிழ்' : 'English'}):{' '}
                  {interimTranscript || 'Speak now...'}
                </span>
              ) : (
                <span className="text-amber-700">{voiceError || ttsNotice}</span>
              )}
              <button
                type="button"
                onClick={() => {
                  setVoiceError(null);
                  setTtsNotice(null);
                }}
                className="text-slate-400 hover:text-slate-600 ml-2 cursor-pointer"
              >
                ✕
              </button>
            </div>
          )}

          {/* Quick Prompts Bar */}
          <div className="px-3 py-1.5 bg-slate-50 border-t border-slate-200/80 flex items-center gap-1.5 overflow-x-auto text-[11px] text-slate-600">
            <button
              type="button"
              onClick={() => sendMessageText('Show me the fleet twin overview with all active vehicles')}
              className="px-2 py-1 bg-white hover:bg-slate-100 border border-slate-200 rounded-md whitespace-nowrap transition cursor-pointer"
            >
              🚛 Fleet Overview
            </button>
            <button
              type="button"
              onClick={() => sendMessageText('Which vehicle has the highest delay and risk?')}
              className="px-2 py-1 bg-white hover:bg-slate-100 border border-slate-200 rounded-md whitespace-nowrap transition cursor-pointer"
            >
              ⚠️ Highest Risk
            </button>
            <button
              type="button"
              onClick={() => sendMessageText('Show me unacknowledged alerts')}
              className="px-2 py-1 bg-white hover:bg-slate-100 border border-slate-200 rounded-md whitespace-nowrap transition cursor-pointer"
            >
              🚨 Active Alerts
            </button>
            <button
              type="button"
              onClick={() => sendMessageText('List active trips')}
              className="px-2 py-1 bg-white hover:bg-slate-100 border border-slate-200 rounded-md whitespace-nowrap transition cursor-pointer"
            >
              🚚 Active Trips
            </button>
          </div>

          {/* Input Form */}
          <form onSubmit={handleSend} className="p-3 bg-white border-t border-slate-200/80 flex items-center gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={isRecording ? 'Listening...' : 'Ask assistant or request fleet action...'}
              className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:bg-white"
              disabled={loading}
            />
            <button
              type="button"
              onClick={toggleRecording}
              disabled={loading}
              className={`p-2 rounded-xl transition cursor-pointer ${isRecording
                ? 'bg-rose-600 hover:bg-rose-700 text-white animate-pulse'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                }`}
              aria-label={isRecording ? 'Stop voice input' : 'Start voice input'}
              title={isRecording ? 'Stop recording' : `Voice input (${speechLang})`}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
                />
              </svg>
            </button>
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="p-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 text-white rounded-xl transition cursor-pointer"
              aria-label="Send message"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            </button>
          </form>
        </div>
      )}
    </div>
  );
};
