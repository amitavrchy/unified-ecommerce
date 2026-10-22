import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../../../../generated/prisma/client';
import { UserRole } from '../../../../generated/prisma/enums';
import { PrismaService } from '../../../database/prisma.service';
import { MediaUploadService } from '../../../service/cloudinary/media-upload.service';
import {
  AdminCreateEquipmentDto,
  AdminEquipmentMediaDto,
  AdminEquipmentQueryDto,
  AdminSetInletQuantityDto,
  AdminUpdateEquipmentDto,
} from './dto/equipment.dto';

const equipmentInclude = {
  inlets: { orderBy: [{ floor: 'asc' }, { type: 'asc' }] },
  media: { orderBy: { createdAt: 'desc' } },
} satisfies Prisma.EquipmentInclude;

const EQUIPMENT_MEDIA_FOLDER = 'vacuumCare/equipment';

@Injectable()
export class AdminEquipmentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly media: MediaUploadService,
  ) {}

  async list(customerId: string, query: AdminEquipmentQueryDto) {
    await this.requireCustomer(customerId);
    const where: Prisma.EquipmentWhereInput = { customerId };
    if (query.search) {
      where.OR = [
        { unitNumber: { contains: query.search, mode: 'insensitive' } },
        { manufacturer: { contains: query.search, mode: 'insensitive' } },
        { model: { contains: query.search, mode: 'insensitive' } },
        { serialNumber: { contains: query.search, mode: 'insensitive' } },
        { location: { contains: query.search, mode: 'insensitive' } },
      ];
    }
    const [items, total] = await this.prisma.$transaction([
      this.prisma.equipment.findMany({
        where,
        include: equipmentInclude,
        orderBy: { unitNumber: 'asc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.equipment.count({ where }),
    ]);
    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  async detail(customerId: string, id: string) {
    const equipment = await this.prisma.equipment.findFirst({
      where: { id, customerId },
      include: equipmentInclude,
    });
    if (!equipment) throw new NotFoundException('Equipment not found');
    return equipment;
  }

  async create(customerId: string, dto: AdminCreateEquipmentDto) {
    await this.requireCustomer(customerId);
    if (dto.requestId) {
      const request = await this.prisma.serviceRequest.findFirst({
        where: { id: dto.requestId, customerId },
        select: { id: true },
      });
      if (!request) {
        throw new BadRequestException(
          'requestId must belong to the selected customer',
        );
      }
    }
    const { inlets, ...data } = dto;
    return this.prisma.equipment.create({
      data: {
        ...data,
        customerId,
        inlets: inlets?.length ? { create: inlets } : undefined,
      },
      include: equipmentInclude,
    });
  }

  async update(customerId: string, id: string, dto: AdminUpdateEquipmentDto) {
    await this.requireEquipment(customerId, id);
    return this.prisma.equipment.update({
      where: { id },
      data: dto,
      include: equipmentInclude,
    });
  }

  async setInlet(
    customerId: string,
    equipmentId: string,
    floor: string,
    type: string,
    dto: AdminSetInletQuantityDto,
  ) {
    await this.requireEquipment(customerId, equipmentId);
    return this.prisma.inletCount.upsert({
      where: { equipmentId_floor_type: { equipmentId, floor, type } },
      create: { equipmentId, floor, type, quantity: dto.quantity },
      update: { quantity: dto.quantity },
    });
  }

  async addMedia(
    customerId: string,
    equipmentId: string,
    dto: AdminEquipmentMediaDto,
    file?: Express.Multer.File,
  ) {
    await this.requireEquipment(customerId, equipmentId);
    if (!file && !dto.url)
      throw new BadRequestException(
        'Either a file upload or a url is required',
      );
    if (file) this.media.assertMedia([file]);
    else if (
      dto.mimeType &&
      !/^(image|video)\/[a-z0-9.+-]+$/i.test(dto.mimeType)
    ) {
      throw new BadRequestException(
        'Only image and video attachments are supported',
      );
    }
    const uploaded = file
      ? (await this.media.upload([file], EQUIPMENT_MEDIA_FOLDER))[0]
      : undefined;
    return this.prisma.equipmentMedia.create({
      data: {
        equipmentId,
        caption: dto.caption,
        url: uploaded?.url ?? dto.url!,
        mimeType: uploaded?.mimeType ?? dto.mimeType,
      },
    });
  }

  private async requireCustomer(customerId: string) {
    const customer = await this.prisma.user.findFirst({
      where: { id: customerId, role: UserRole.CUSTOMER },
      select: { id: true },
    });
    if (!customer) throw new NotFoundException('Customer not found');
  }

  private async requireEquipment(customerId: string, id: string) {
    const equipment = await this.prisma.equipment.findFirst({
      where: { id, customerId },
      select: { id: true },
    });
    if (!equipment) throw new NotFoundException('Equipment not found');
  }
}
