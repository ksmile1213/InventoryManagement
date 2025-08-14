import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateInventoryItemDto } from './dto/create-inventory-item.dto';
import { AddStockDto } from './dto/add-stock.dto';
import { EventsService } from '../events/events.service';

@Injectable()
export class InventoryService {
  constructor(private readonly prisma: PrismaService, private readonly events: EventsService) {}

  async createItem(dto: CreateInventoryItemDto) {
    const existing = await this.prisma.inventoryItem.findUnique({ where: { sku: dto.sku } });
    if (existing) {
      throw new BadRequestException('SKU already exists');
    }
    const item = await this.prisma.inventoryItem.create({ data: dto });
    this.events.push('item_created', { itemId: item.id, sku: item.sku });
    return item;
  }

  async addStock(dto: AddStockDto) {
    const item = await this.prisma.inventoryItem.findUnique({ where: { id: dto.itemId } });
    if (!item) throw new NotFoundException('Inventory item not found');

    const stock = await this.prisma.inventoryStock.upsert({
      where: { itemId_location: { itemId: dto.itemId, location: dto.location } },
      update: { quantity: { increment: dto.quantity } },
      create: { itemId: dto.itemId, location: dto.location, quantity: dto.quantity }
    });
    this.events.push('stock_added', { itemId: item.id, location: dto.location, quantity: dto.quantity });
    return stock;
  }

  async getAvailableQuantity(itemId: number): Promise<number> {
    const result = await this.prisma.inventoryStock.aggregate({
      where: { itemId },
      _sum: { quantity: true }
    });
    return result._sum.quantity ?? 0;
  }
}
