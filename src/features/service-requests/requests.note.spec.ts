import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { UserRole } from '../../../generated/prisma/enums';
import type { AuthUser } from '../../common/auth/auth.types';
import { PrismaService } from '../../database/prisma.service';
import { RequestsService } from './requests.service';

describe('RequestsService job notes', () => {
  const technician: AuthUser = {
    id: 'tech-1',
    email: 'marc@example.com',
    role: UserRole.TECHNICIAN,
  };
  const prisma = {
    serviceRequest: { findUnique: jest.fn() },
    serviceRequestNote: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  };
  let service: RequestsService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new RequestsService(
      prisma as unknown as PrismaService,
      {} as never,
      {} as never,
      {} as never,
    );
    prisma.serviceRequest.findUnique.mockResolvedValue({
      id: 'req-1',
      technicianId: 'tech-1',
    });
  });

  it('creates a note with only text', async () => {
    prisma.serviceRequestNote.findUnique.mockResolvedValue(null);
    prisma.serviceRequestNote.create.mockResolvedValue({
      id: 'note-1',
      requestId: 'req-1',
      text: 'Check garage inlet',
    });

    await expect(service.addNote(technician, 'req-1', 'Check garage inlet')).resolves.toMatchObject({
      requestId: 'req-1',
      text: 'Check garage inlet',
    });
    expect(prisma.serviceRequestNote.create).toHaveBeenCalledWith({
      data: { requestId: 'req-1', text: 'Check garage inlet' },
    });
  });

  it('rejects a second note on the same request', async () => {
    prisma.serviceRequestNote.findUnique.mockResolvedValue({ id: 'note-1' });

    await expect(
      service.addNote(technician, 'req-1', 'Another note'),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('updates an existing note', async () => {
    prisma.serviceRequestNote.findUnique.mockResolvedValue({ id: 'note-1' });
    prisma.serviceRequestNote.update.mockResolvedValue({
      id: 'note-1',
      text: 'Updated',
    });

    await expect(service.updateNote(technician, 'req-1', 'Updated')).resolves.toMatchObject({
      text: 'Updated',
    });
  });

  it('returns 404 when the note is missing', async () => {
    prisma.serviceRequestNote.findUnique.mockResolvedValue(null);

    await expect(service.getNote(technician, 'req-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(service.updateNote(technician, 'req-1', 'x')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('rejects a technician who is not assigned', async () => {
    prisma.serviceRequest.findUnique.mockResolvedValue({
      id: 'req-1',
      technicianId: 'other-tech',
    });

    await expect(service.getNote(technician, 'req-1')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});
