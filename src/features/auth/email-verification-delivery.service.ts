import { InternalServerErrorException, Injectable } from '@nestjs/common';

@Injectable()
export class EmailVerificationDeliveryService {
  /**
   * Sends a 5-digit OTP to the given email via the Brevo transactional email API.
   * In non-production environments the method returns early — the controller
   * exposes the raw OTP in the response body instead.
   */
  async send(email: string, otp: string): Promise<void> {
    // Email is now sent in all environments (removed NODE_ENV early return).

    const apiKey = process.env.BREVO_API_KEY;
    const from = process.env.MAIL_FROM;
    const fromName = process.env.MAIL_FROM_NAME ?? 'Central Care';

    if (!apiKey || !from) {
      throw new InternalServerErrorException(
        'Email verification is not configured (BREVO_API_KEY / MAIL_FROM missing)',
      );
    }

    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': apiKey,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        sender: { name: fromName, email: from },
        to: [{ email }],
        subject: 'Your Central Care verification code',
        textContent: [
          `Your verification code is: ${otp}`,
          '',
          'Enter this 5-digit code to activate your account.',
          'It expires in 10 minutes.',
          '',
          'If you did not create a Central Care account, you can safely ignore this email.',
        ].join('\n'),
        htmlContent: `
          <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
            <h2 style="color:#1a1a1a">Verify your email</h2>
            <p>Use the code below to activate your Central Care account.</p>
            <div style="font-size:36px;font-weight:700;letter-spacing:8px;color:#2563eb;
                        background:#f1f5f9;border-radius:8px;padding:16px 24px;
                        display:inline-block;margin:16px 0">${otp}</div>
            <p style="color:#64748b;font-size:14px">This code expires in <strong>10 minutes</strong>.</p>
            <p style="color:#94a3b8;font-size:12px">
              If you did not create a Central Care account, you can safely ignore this email.
            </p>
          </div>`,
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new InternalServerErrorException(
        `Verification email could not be sent${body ? `: ${body}` : ''}`,
      );
    }
  }
}
