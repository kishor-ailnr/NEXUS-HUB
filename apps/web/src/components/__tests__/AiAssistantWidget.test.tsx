import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AiAssistantWidget } from '../AiAssistantWidget';
import { aiApi } from '../../services/ai';

vi.mock('../../services/ai', () => ({
  aiApi: {
    chat: vi.fn(),
    confirmAction: vi.fn(),
  },
}));

describe('AiAssistantWidget', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (window as any).SpeechRecognition = undefined;
    (window as any).webkitSpeechRecognition = undefined;
  });

  it('opens chat, sends message, and displays AI response with collapsible tool calls', async () => {
    (aiApi.chat as any).mockResolvedValueOnce({
      id: 'ai-1',
      role: 'assistant',
      content: '**TN 01 AB 4021** is delayed by 45 minutes.',
      toolCalls: [{ name: 'get_fleet_twin_overview', args: {}, result: { totalFleet: 2 } }],
      isFallback: false,
      createdAt: new Date().toISOString(),
    });

    render(<AiAssistantWidget />);
    fireEvent.click(screen.getByLabelText('Open AI Assistant'));

    const input = screen.getByPlaceholderText(/Ask assistant or request fleet action/i);
    fireEvent.change(input, { target: { value: 'Which vehicle is delayed?' } });
    fireEvent.click(screen.getByLabelText('Send message'));

    await waitFor(() => {
      expect(screen.getByText(/is delayed by 45 minutes/i)).toBeTruthy();
    });

    expect(screen.getByText(/Executed 1 live tool/i)).toBeTruthy();
  });

  it('shows graceful error when voice input is unsupported in browser', () => {
    render(<AiAssistantWidget />);
    fireEvent.click(screen.getByLabelText('Open AI Assistant'));
    fireEvent.click(screen.getByLabelText('Start voice input'));

    expect(screen.getByText(/Voice input is not supported/i)).toBeTruthy();
  });

  it('supports SpeechRecognition voice input and sends transcribed text to AI', async () => {
    const startMock = vi.fn();
    let instance: any;
    (window as any).webkitSpeechRecognition = class {
      continuous = false;
      interimResults = false;
      lang = 'en-IN';
      onresult: any = null;
      onerror: any = null;
      onend: any = null;
      constructor() {
        instance = this;
      }
      start = startMock;
      stop = vi.fn();
    };

    (aiApi.chat as any).mockResolvedValueOnce({
      id: 'ai-voice-1',
      role: 'assistant',
      content: 'வண்டி வேலூர் அருகே உள்ளது.',
      isFallback: false,
      createdAt: new Date().toISOString(),
    });

    render(<AiAssistantWidget />);
    fireEvent.click(screen.getByLabelText('Open AI Assistant'));
    fireEvent.click(screen.getByLabelText('Toggle voice language')); // switch to ta-IN
    fireEvent.click(screen.getByLabelText('Start voice input'));

    expect(startMock).toHaveBeenCalled();
    expect(instance.lang).toBe('ta-IN');

    // Simulate speech recognition result and end
    instance.onresult({
      resultIndex: 0,
      results: {
        length: 1,
        0: { isFinal: true, 0: { transcript: 'வண்டி எங்க இருக்கு?' } },
      },
    });
    instance.onend();

    await waitFor(() => {
      expect(aiApi.chat).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'வண்டி எங்க இருக்கு?' }),
      );
    });
  });

  it('triggers speechSynthesis when clicking Listen button', async () => {
    const speakMock = vi.fn();
    const cancelMock = vi.fn();
    (window as any).speechSynthesis = {
      speak: speakMock,
      cancel: cancelMock,
      pause: vi.fn(),
      resume: vi.fn(),
      getVoices: vi.fn().mockReturnValue([{ lang: 'en-IN', name: 'English India' }]),
    };
    (globalThis as any).SpeechSynthesisUtterance = class {
      text: string;
      lang = '';
      rate = 1;
      voice: any = null;
      onend: any = null;
      onerror: any = null;
      constructor(t: string) {
        this.text = t;
      }
    };

    render(<AiAssistantWidget />);
    fireEvent.click(screen.getByLabelText('Open AI Assistant'));
    fireEvent.click(screen.getByLabelText('Listen to response'));

    expect(cancelMock).toHaveBeenCalled();
    expect(speakMock).toHaveBeenCalled();
  });

  it('preserves confirmation card on Apply failure and allows Retry Apply', async () => {
    (aiApi.chat as any).mockResolvedValueOnce({
      id: 'ai-act-1',
      role: 'assistant',
      content: 'Weather alert detected for TN 38 FF 2345.',
      proposedAction: {
        id: 'act-twin-1',
        actionType: 'acknowledge_alert',
        description: 'Acknowledge Digital Twin alert for TN 38 FF 2345',
        payload: { alertId: 'twin-alert-v1-0', alertSource: 'fleet_twin' },
        status: 'pending',
      },
      createdAt: new Date().toISOString(),
    });

    (aiApi.confirmAction as any)
      .mockRejectedValueOnce(new Error('Temporary backend error'))
      .mockResolvedValueOnce({ success: true, message: 'Digital Twin alert for TN 38 FF 2345 successfully acknowledged.' });

    render(<AiAssistantWidget />);
    fireEvent.click(screen.getByLabelText('Open AI Assistant'));

    const input = screen.getByPlaceholderText(/Ask assistant or request fleet action/i);
    fireEvent.change(input, { target: { value: 'Acknowledge alert' } });
    fireEvent.click(screen.getByLabelText('Send message'));

    await waitFor(() => {
      expect(screen.getByTestId('proposed-action-card')).toBeTruthy();
    });

    // First Apply fails -> error banner shown, Retry Apply button preserved
    fireEvent.click(screen.getByTestId('apply-action-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('action-error-banner').textContent).toContain('Temporary backend error');
      expect(screen.getByTestId('apply-action-btn').textContent).toBe('Retry Apply');
    });

    // Second Apply succeeds -> status confirmed
    fireEvent.click(screen.getByTestId('apply-action-btn'));
    await waitFor(() => {
      expect(screen.getByText(/successfully acknowledged/i)).toBeTruthy();
    });
  });
});
