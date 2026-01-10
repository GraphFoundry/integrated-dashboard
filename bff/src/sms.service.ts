
import axios from 'axios';

interface FitSmsPayload {
    recipient: string;
    sender_id: string;
    type: string;
    message: string;
    expiry_time?: string;
}

interface OpenAIChatResponse {
    choices: {
        message: {
            content: string;
        };
    }[];
}

export class SmsService {
    private fitSmsUrl = 'https://app.fitsms.lk/api/v3/sms/send';
    private fitSmsToken = process.env.FITSMS_API_KEY || ' '; // Fallback to user provided key
    // ideally utilize process.env.OPENAI_API_KEY
    private openaiApiKey = process.env.OPENAI_API_KEY || ' ';
    private defaultSenderId = process.env.FITSMS_SENDER_ID || ' ';
    private defaultRecipient = process.env.SMS_RECIPIENT || ' ';

    constructor() {
        if (!this.openaiApiKey) {
            console.warn('OPENAI_API_KEY is not set. Summarization will fail.');
        }
        if (!this.defaultRecipient) {
            console.warn('SMS_RECIPIENT is not set. SMS notifications for webhooks might fail if no recipient provided.');
        }
    }

    /**
     * Helper to send an SMS from a raw alert event/object
     */
    public async sendAlertSms(event: any): Promise<void> {
        if (!this.defaultRecipient) {
            console.warn('Skipping SMS alert: No default recipient configured (SMS_RECIPIENT).');
            return;
        }

        const message = JSON.stringify(event, null, 2); // Pretty print slightly for better raw reading if summarization fails
        await this.sendSms({
            recipient: this.defaultRecipient,
            message,
            shouldSummarize: true
        });
    }

    /**
     * Summarizes the text using OpenAI GPT-4o
     */
    private async summarizeMessage(text: string): Promise<string> {
        if (!this.openaiApiKey) {
            // gracefully fail if no key
            console.warn('No OpenAI Key, skipping summarization');
            return text.substring(0, 157) + (text.length > 157 ? '...' : '');
        }

        try {
            const response = await axios.post<OpenAIChatResponse>(
                'https://api.openai.com/v1/chat/completions',
                {
                    model: 'gpt-4o',
                    messages: [
                        {
                            role: 'system',
                            content: 'Summarize technical alerts for SMS. Format: "[SEVERITY] Service: <Name> \nIssue: <Concise Issue> \nValue: <Key Metric>". Keep it under 160 characters total. Use newlines for readability.'
                        },
                        {
                            role: 'user',
                            content: `Summarize this alert: ${text}`
                        }
                    ],
                    max_tokens: 60
                },
                {
                    headers: {
                        'Authorization': `Bearer ${this.openaiApiKey}`,
                        'Content-Type': 'application/json'
                    }
                }
            );

            const summary = response.data.choices[0]?.message?.content?.trim();
            return summary || text.substring(0, 157) + '...';
        } catch (error: any) {
            console.error('OpenAI summarization failed:', error?.response?.data || error.message);
            // Fallback: truncate original text
            return text.length > 160 ? text.substring(0, 157) + '...' : text;
        }
    }

    /**
     * Sends an SMS via FitSMS, optionally summarizing the message first.
     */
    public async sendSms(options: {
        recipient: string;
        message: string;
        senderId?: string;
        shouldSummarize?: boolean;
    }): Promise<{ success: boolean; data?: any; error?: string }> {
        const { recipient, message, senderId, shouldSummarize = true } = options;

        // Use provided senderId, or env var, or fallback to 'FitSMS' (common default) or user's preference
        const finalSenderId = senderId || this.defaultSenderId;

        try {
            // 1. Summarize if requested
            let finalMessage = message;
            if (shouldSummarize) {
                console.log(`[SmsService] Summarizing message via OpenAI (len: ${message.length})...`);
                finalMessage = await this.summarizeMessage(message);
                console.log(`[SmsService] Summarized: "${finalMessage}"`);
            }

            // 2. Prepare payload
            const payload: FitSmsPayload = {
                recipient,
                sender_id: finalSenderId,
                type: 'plain',
                message: finalMessage
            };

            // 3. Send to FitSMS
            const response = await axios.post(this.fitSmsUrl, payload, {
                headers: {
                    'Authorization': `Bearer ${this.fitSmsToken}`,
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                }
            });

            console.log('SMS sent successfully:', response.data);
            return { success: true, data: response.data };

        } catch (error: any) {
            console.error('FitSMS send failed:', error?.response?.data || error.message);
            return { success: false, error: error?.response?.data?.message || error.message };
        }
    }
}
