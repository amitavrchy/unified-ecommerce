import { Injectable, InternalServerErrorException } from '@nestjs/common';

@Injectable()
export class PasswordResetDeliveryService {
  /**
   * Production email delivery uses Resend's HTTPS API so the backend does not
   * need an SMTP client or expose reset tokens in API responses. Development
   * keeps the token available to local clients/tests through the controller.
   */
  async send(email: string, token: string) {
    if (process.env.NODE_ENV !== 'production') return;
    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.RESET_EMAIL_FROM;
    const resetUrl = process.env.PASSWORD_RESET_URL;
    if (!apiKey || !from || !resetUrl) {
      throw new InternalServerErrorException(
        'Password reset email is not configured',
      );
    }
    let link: URL;
    try {
      link = new URL(resetUrl);
      link.searchParams.set('token', token);
    } catch {
      throw new InternalServerErrorException(
        'PASSWORD_RESET_URL must be an absolute frontend URL',
      );
    }
    let response: Response;
    try {
      response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from,
          to: [email],
          subject: 'Reset your Central Care password',
          text: `Use this one-time link to reset your password (valid for 15 minutes): ${link.toString()}`,
        }),
      });
    } catch {
      throw new InternalServerErrorException(
        'Password reset email could not be sent',
      );
    }
    if (!response.ok) {
      throw new InternalServerErrorException(
        'Password reset email could not be sent',
      );
    }
  }
}
