import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, OrderStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { FulfillOrderDto } from './dto/fulfill-order.dto';
import { EventsService } from '../events/events.service';

@Injectable()
export class OrdersService {
  constructor(private readonly prisma: PrismaService, private readonly events: EventsService) {}

  async createOrder(dto: CreateOrderDto) {
    const existing = await this.prisma.order.findUnique({ where: { orderNumber: dto.orderNumber } });
    if (existing) {
      throw new BadRequestException('order_number already exists');
    }
    const order = await this.prisma.order.create({
      data: {
        orderNumber: dto.orderNumber,
        items: {
          create: dto.items.map((i) => ({ itemId: i.itemId, quantity: i.quantity }))
        }
      },
      include: { items: true }
    });
    this.events.push('order_created', { orderId: order.id, orderNumber: order.orderNumber });
    return order;
  }

  async fulfillOrder(orderId: number, dto: FulfillOrderDto) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId }, include: { items: true } });
    if (!order) throw new NotFoundException('Order not found');
    if (order.status !== OrderStatus.PENDING) throw new BadRequestException('Order is not pending');
    if (!order.items.length) throw new BadRequestException('Order has no items');

    const result = await this.prisma.$transaction(async (tx) => {
      // Check availability per item
      for (const item of order.items) {
        const available = await tx.inventoryStock.aggregate({
          where: dto.location ? { itemId: item.itemId, location: dto.location } : { itemId: item.itemId },
          _sum: { quantity: true }
        });
        const total = available._sum.quantity ?? 0;
        if (total < item.quantity) {
          throw new BadRequestException(`Insufficient stock for item ${item.itemId}. Needed ${item.quantity}, available ${total}`);
        }
      }

      // Reserve stock in FIFO by oldest stock entries first
      for (const item of order.items) {
        let remaining = item.quantity;
        const stocks = await tx.inventoryStock.findMany({
          where: dto.location ? { itemId: item.itemId, location: dto.location } : { itemId: item.itemId },
          orderBy: { createdAt: 'asc' }
        });
        for (const stock of stocks) {
          if (remaining <= 0) break;
          const deduct = Math.min(remaining, stock.quantity);
          if (deduct > 0) {
            await tx.inventoryStock.update({ where: { id: stock.id }, data: { quantity: { decrement: deduct } } });
            this.events.push('item_reserved', { orderId: order.id, itemId: item.itemId, quantity: deduct, fromStockId: stock.id });
            remaining -= deduct;
          }
        }
        if (remaining > 0) {
          throw new BadRequestException(`Unexpected stock shortage during reservation for item ${item.itemId}`);
        }
        // Optional: emit stock_low if total remaining stock < threshold (e.g., 10)
        const afterAgg = await tx.inventoryStock.aggregate({ where: { itemId: item.itemId }, _sum: { quantity: true } });
        const remainingTotal = afterAgg._sum.quantity ?? 0;
        if (remainingTotal < 10) {
          this.events.push('stock_low', { itemId: item.itemId, remaining: remainingTotal });
        }
      }

      const updated = await tx.order.update({ where: { id: order.id }, data: { status: OrderStatus.FULFILLED } });
      this.events.push('order_fulfilled', { orderId: order.id });
      return updated;
    });

    return result;
  }

  getById(orderId: number) {
    return this.prisma.order.findUnique({ where: { id: orderId }, include: { items: true } });
  }
}
