import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import type { SubmitContactDto } from './dto/contact.dto';

@Injectable()
export class ContactService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async submit(dto: SubmitContactDto) {
    const apiKey = process.env.BREVO_API_KEY;
    const from = process.env.MAIL_FROM;
    const fromName = process.env.MAIL_FROM_NAME ?? 'Elite Central Vacuum';
    if (!apiKey || !from) {
      throw new InternalServerErrorException(
        'Contact email is not configured (BREVO_API_KEY / MAIL_FROM missing)',
      );
    }

    const settings = await this.prisma.businessSettings.findUnique({
      where: { id: 1 },
    });
    const to = settings?.supportEmail || process.env.MAIL_TO || from;

    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': apiKey,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        sender: { name: fromName, email: from },
        to: [{ email: to }],
        replyTo: { email: dto.email, name: dto.fullName },
        subject: `Contact form: ${dto.service || 'General inquiry'}`,
        textContent: [
          `Name: ${dto.fullName}`,
          `Email: ${dto.email}`,
          `Phone: ${dto.phone || '—'}`,
          `Service: ${dto.service || '—'}`,
          '',
          dto.message,
        ].join('\n'),
        htmlContent: `
          <div style="font-family:sans-serif;max-width:560px;margin:0 auto">
            <h2 style="color:#1a73e8">New contact form message</h2>
            <p><strong>Name:</strong> ${escapeHtml(dto.fullName)}</p>
            <p><strong>Email:</strong> ${escapeHtml(dto.email)}</p>
            <p><strong>Phone:</strong> ${escapeHtml(dto.phone || '—')}</p>
            <p><strong>Service:</strong> ${escapeHtml(dto.service || '—')}</p>
            <p style="white-space:pre-wrap">${escapeHtml(dto.message)}</p>
          </div>`,
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new InternalServerErrorException(
        `Contact email could not be sent${body ? `: ${body}` : ''}`,
      );
    }

    await this.notifications.fanOutToActiveAdmins({
      title: 'New support request',
      body: `${dto.fullName} submitted a ${dto.service || 'general'} inquiry`,
      data: {
        source: 'contact',
        email: dto.email,
        service: dto.service ?? null,
      },
    });

    return { success: true };
  }
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}
