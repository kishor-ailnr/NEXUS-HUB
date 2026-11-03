import React, { useState, useRef, useEffect } from 'react';
import { AiChatMessage, AiProposedAction } from '@nexus-ways/shared';
import { aiApi } from '../services/ai';

export const AiAssistantWidget: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<AiChatMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content:
        'Hello! I am your NEXUS WAYS Operations Assistant. I can check fleet status, analyze trips, monitor alerts, and help manage operational workflows.',
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
  }, [messages, isOpen]);

  const handleSend = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!input.trim() || loading) return;

    const userMessage: AiChatMessage = {
      id: `usr_${Date.now()}`,
      role: 'user',
      content: input.trim(),
      createdAt: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setLoading(true);

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
      setMessages((prev) => [
        ...prev,
        {
          id: `err_${Date.now()}`,
          role: 'assistant',
          content: 'Sorry, I encountered an error processing your request. Please try again.',
          createdAt: new Date().toISOString(),
          isFallback: true,
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmAction = async (action: AiProposedAction, confirm: boolean, messageId: string) => {
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
      setMessages((prev) => [
        ...prev,
        {
          id: `act_err_${Date.now()}`,
          role: 'assistant',
          content: `Failed to execute action: ${err.message || 'Unknown error'}`,
          createdAt: new Date().toISOString(),
        },
      ]);
    }
  };

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end">
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
        <div className="w-[420px] h-[580px] bg-white border border-slate-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden text-slate-800 animate-in fade-in zoom-in-95 duration-200">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 bg-slate-50 border-b border-slate-200/80">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-full bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600 font-bold text-xs">
                AI
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900 tracking-wide">Operations Copilot</h3>
                <span className="text-[10px] text-emerald-600 font-mono font-medium">Gemini 2.0 Flash / Live Tools</span>
              </div>
            </div>
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
                    Fallback Mode Active
                  </div>
                )}

                {/* Tool Calls Execution Badges */}
                {msg.toolCalls && msg.toolCalls.length > 0 && (
                  <div className="mb-2 space-y-1.5 w-full max-w-[90%]">
                    {msg.toolCalls.map((tool, idx) => (
                      <div
                        key={idx}
                        className="text-[11px] bg-white text-slate-700 border border-slate-800 rounded-md p-2 flex items-start gap-2 shadow-xs font-mono"
                      >
                        <span className="text-blue-600 font-bold">⚡ tool:</span>
                        <div className="flex-1 overflow-hidden">
                          <div className="font-semibold text-slate-900">{tool.name}()</div>
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
                  className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                    msg.role === 'user'
                      ? 'bg-blue-600 text-white rounded-tr-none shadow-xs'
                      : 'bg-white text-slate-800 border border-slate-800 rounded-tl-none shadow-xs'
                  }`}
                >
                  <div className="whitespace-pre-wrap">{msg.content}</div>
                </div>

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

                    {msg.proposedAction.status === 'pending' ? (
                      <div className="flex items-center gap-2">
                        <button
                          data-testid="apply-action-btn"
                          onClick={() => handleConfirmAction(msg.proposedAction!, true, msg.id)}
                          className="flex-1 py-1.5 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded font-medium text-xs transition cursor-pointer"
                        >
                          Apply
                        </button>
                        <button
                          data-testid="reject-action-btn"
                          onClick={() => handleConfirmAction(msg.proposedAction!, false, msg.id)}
                          className="flex-1 py-1.5 px-3 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded font-medium text-xs transition cursor-pointer"
                        >
                          Reject
                        </button>
                      </div>
                    ) : (
                      <div className="text-xs font-mono">
                        <span className="text-slate-500">Status: </span>
                        <span
                          className={`font-semibold uppercase ${
                            msg.proposedAction.status === 'confirmed' ? 'text-emerald-700' : 'text-rose-700'
                          }`}
                        >
                          {msg.proposedAction.status}
                        </span>
                      </div>
                    )}
                  </div>
                )}

                <span className="text-[10px] text-slate-400 mt-1 px-1">
                  {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            ))}

            {loading && (
              <div className="flex items-center gap-2 text-slate-500 text-xs py-2">
                <div className="w-2 h-2 rounded-full bg-blue-600 animate-ping" />
                <span>Thinking & querying operations data...</span>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Quick Prompts Bar */}
          <div className="px-3 py-1.5 bg-slate-50 border-t border-slate-200/80 flex items-center gap-1.5 overflow-x-auto text-[11px] text-slate-600">
            <button
              onClick={() => { setInput('How many active alerts and active trips are there?'); }}
              className="px-2 py-1 bg-white hover:bg-slate-100 border border-slate-200 rounded-md whitespace-nowrap transition cursor-pointer"
            >
              📊 Fleet Status
            </button>
            <button
              onClick={() => { setInput('Show me unacknowledged alerts'); }}
              className="px-2 py-1 bg-white hover:bg-slate-100 border border-slate-200 rounded-md whitespace-nowrap transition cursor-pointer"
            >
              🚨 Active Alerts
            </button>
            <button
              onClick={() => { setInput('List active trips'); }}
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
              placeholder="Ask assistant or request fleet action..."
              className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:bg-white"
              disabled={loading}
            />
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
