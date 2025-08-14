import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { OrderStatus } from '@prisma/client';
import { OrdersService } from './orders.service';
import { PrismaService } from '../prisma/prisma.service';
import { EventsService } from '../events/events.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { FulfillOrderDto } from './dto/fulfill-order.dto';
import { mockPrismaService, mockEventsService, createMockOrder, createMockOrderItem, createMockInventoryStock } from '../test/mocks';

describe('OrdersService', () => {
  let service: OrdersService;
  let prisma: any; // Use any to bypass Prisma type conflicts
  let events: any; // Use any to bypass type conflicts

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrdersService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: EventsService, useValue: mockEventsService },
      ],
    }).compile();

    service = module.get<OrdersService>(OrdersService);
    prisma = module.get(PrismaService);
    events = module.get(EventsService);

    // Reset all mocks before each test
    jest.clearAllMocks();
  });

  describe('createOrder', () => {
    const createOrderDto: CreateOrderDto = {
      orderNumber: 'SO-1001',
      items: [{ itemId: 1, quantity: 10 }],
    };

    it('should create a new order successfully', async () => {
      const mockOrder = createMockOrder();
      prisma.order.findUnique.mockResolvedValue(null);
      prisma.order.create.mockResolvedValue(mockOrder);

      const result = await service.createOrder(createOrderDto);

      expect(prisma.order.findUnique).toHaveBeenCalledWith({ where: { orderNumber: 'SO-1001' } });
      expect(prisma.order.create).toHaveBeenCalledWith({
        data: {
          orderNumber: 'SO-1001',
          items: {
            create: [{ itemId: 1, quantity: 10 }],
          },
        },
        include: { items: true },
      });
      expect(events.push).toHaveBeenCalledWith('order_created', { orderId: 1, orderNumber: 'SO-1001' });
      expect(result).toEqual(mockOrder);
    });

    it('should throw BadRequestException if order number already exists', async () => {
      const existingOrder = createMockOrder();
      prisma.order.findUnique.mockResolvedValue(existingOrder);

      await expect(service.createOrder(createOrderDto)).rejects.toThrow(
        new BadRequestException('order_number already exists')
      );

      expect(prisma.order.create).not.toHaveBeenCalled();
      expect(events.push).not.toHaveBeenCalled();
    });
  });

  describe('fulfillOrder', () => {
    const fulfillOrderDto: FulfillOrderDto = {};
    const orderId = 1;

    it('should fulfill an order successfully with sufficient stock', async () => {
      const mockOrder = createMockOrder({ id: orderId, status: OrderStatus.PENDING });
      const mockStocks = [createMockInventoryStock({ quantity: 100 })];

      prisma.order.findUnique.mockResolvedValue(mockOrder);
      prisma.inventoryStock.aggregate.mockResolvedValue({ _sum: { quantity: 100 } });
      prisma.inventoryStock.findMany.mockResolvedValue(mockStocks);
      prisma.inventoryStock.update.mockResolvedValue(mockStocks[0]);
      prisma.order.update.mockResolvedValue({ ...mockOrder, status: OrderStatus.FULFILLED });

      // Mock transaction
      prisma.$transaction.mockImplementation(async (callback: any) => {
        return await callback(prisma);
      });

      const result = await service.fulfillOrder(orderId, fulfillOrderDto);

      expect(prisma.order.findUnique).toHaveBeenCalledWith({ where: { id: orderId }, include: { items: true } });
      expect(prisma.inventoryStock.aggregate).toHaveBeenCalledWith({
        where: { itemId: 1 },
        _sum: { quantity: true },
      });
      expect(prisma.inventoryStock.findMany).toHaveBeenCalledWith({
        where: { itemId: 1 },
        orderBy: { createdAt: 'asc' },
      });
      expect(prisma.inventoryStock.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { quantity: { decrement: 10 } },
      });
      expect(prisma.order.update).toHaveBeenCalledWith({
        where: { id: orderId },
        data: { status: OrderStatus.FULFILLED },
      });
      expect(events.push).toHaveBeenCalledWith('item_reserved', {
        orderId: 1,
        itemId: 1,
        quantity: 10,
        fromStockId: 1,
      });
      expect(events.push).toHaveBeenCalledWith('order_fulfilled', { orderId: 1 });
      expect(result.status).toBe(OrderStatus.FULFILLED);
    });

    it('should throw NotFoundException if order not found', async () => {
      prisma.order.findUnique.mockResolvedValue(null);

      await expect(service.fulfillOrder(orderId, fulfillOrderDto)).rejects.toThrow(
        new NotFoundException('Order not found')
      );
    });

    it('should throw BadRequestException if order is not pending', async () => {
      const mockOrder = createMockOrder({ id: orderId, status: OrderStatus.FULFILLED });
      prisma.order.findUnique.mockResolvedValue(mockOrder);

      await expect(service.fulfillOrder(orderId, fulfillOrderDto)).rejects.toThrow(
        new BadRequestException('Order is not pending')
      );
    });

    it('should throw BadRequestException if order has no items', async () => {
      const mockOrder = createMockOrder({ id: orderId, status: OrderStatus.PENDING, items: [] });
      prisma.order.findUnique.mockResolvedValue(mockOrder);

      await expect(service.fulfillOrder(orderId, fulfillOrderDto)).rejects.toThrow(
        new BadRequestException('Order has no items')
      );
    });

    it('should throw BadRequestException if insufficient stock', async () => {
      const mockOrder = createMockOrder({ id: orderId, status: OrderStatus.PENDING });
      prisma.order.findUnique.mockResolvedValue(mockOrder);
      prisma.inventoryStock.aggregate.mockResolvedValue({ _sum: { quantity: 5 } });

      // Mock transaction
      prisma.$transaction.mockImplementation(async (callback : any) => {
        return await callback(prisma);
      });

      await expect(service.fulfillOrder(orderId, fulfillOrderDto)).rejects.toThrow(
        new BadRequestException('Insufficient stock for item 1. Needed 10, available 5')
      );
    });

    it('should fulfill order with specific location when provided', async () => {
      const mockOrder = createMockOrder({ id: orderId, status: OrderStatus.PENDING });
      const mockStocks = [createMockInventoryStock({ quantity: 100, location: 'B2' })];
      const locationDto: FulfillOrderDto = { location: 'B2' };

      prisma.order.findUnique.mockResolvedValue(mockOrder);
      prisma.inventoryStock.aggregate.mockResolvedValue({ _sum: { quantity: 100 } });
      prisma.inventoryStock.findMany.mockResolvedValue(mockStocks);
      prisma.inventoryStock.update.mockResolvedValue(mockStocks[0]);
      prisma.order.update.mockResolvedValue({ ...mockOrder, status: OrderStatus.FULFILLED });

      // Mock transaction
      prisma.$transaction.mockImplementation(async (callback : any) => {
        return await callback(prisma);
      });

      await service.fulfillOrder(orderId, locationDto);

      expect(prisma.inventoryStock.aggregate).toHaveBeenCalledWith({
        where: { itemId: 1, location: 'B2' },
        _sum: { quantity: true },
      });
      expect(prisma.inventoryStock.findMany).toHaveBeenCalledWith({
        where: { itemId: 1, location: 'B2' },
        orderBy: { createdAt: 'asc' },
      });
    });

    it('should emit stock_low event when remaining stock is below threshold', async () => {
      const mockOrder = createMockOrder({ id: orderId, status: OrderStatus.PENDING });
      const mockStocks = [createMockInventoryStock({ quantity: 15 })];

      prisma.order.findUnique.mockResolvedValue(mockOrder);
      prisma.inventoryStock.aggregate
        .mockResolvedValueOnce({ _sum: { quantity: 15 } }) // Initial check
        .mockResolvedValueOnce({ _sum: { quantity: 5 } }); // After reservation
      prisma.inventoryStock.findMany.mockResolvedValue(mockStocks);
      prisma.inventoryStock.update.mockResolvedValue(mockStocks[0]);
      prisma.order.update.mockResolvedValue({ ...mockOrder, status: OrderStatus.FULFILLED });

      // Mock transaction
      prisma.$transaction.mockImplementation(async (callback : any) => {
        return await callback(prisma);
      });

      await service.fulfillOrder(orderId, fulfillOrderDto);

      expect(events.push).toHaveBeenCalledWith('stock_low', { itemId: 1, remaining: 5 });
    });

    // Additional tests for complex FIFO scenarios
    describe('FIFO stock reservation', () => {
      it('should reserve stock from oldest entries first', async () => {
        const mockOrder = createMockOrder({ 
          id: orderId, 
          status: OrderStatus.PENDING,
          items: [{ id: 1, orderId: 1, itemId: 1, quantity: 25 }]
        });
        
        // Create multiple stock entries with different creation dates
        const mockStocks = [
          createMockInventoryStock({ id: 1, quantity: 20, createdAt: new Date('2024-01-01') }),
          createMockInventoryStock({ id: 2, quantity: 15, createdAt: new Date('2024-01-02') }),
          createMockInventoryStock({ id: 3, quantity: 10, createdAt: new Date('2024-01-03') }),
        ];

        prisma.order.findUnique.mockResolvedValue(mockOrder);
        prisma.inventoryStock.aggregate.mockResolvedValue({ _sum: { quantity: 45 } });
        prisma.inventoryStock.findMany.mockResolvedValue(mockStocks);
        prisma.inventoryStock.update.mockResolvedValue(mockStocks[0]);
        prisma.order.update.mockResolvedValue({ ...mockOrder, status: OrderStatus.FULFILLED });

        // Mock transaction
        prisma.$transaction.mockImplementation(async (callback : any) => {
          return await callback(prisma);
        });

        await service.fulfillOrder(orderId, fulfillOrderDto);

        // Should update first stock (oldest) to 0, second to 10
        expect(prisma.inventoryStock.update).toHaveBeenCalledWith({
          where: { id: 1 },
          data: { quantity: { decrement: 20 } },
        });
        expect(prisma.inventoryStock.update).toHaveBeenCalledWith({
          where: { id: 2 },
          data: { quantity: { decrement: 5 } },
        });
        expect(prisma.inventoryStock.update).toHaveBeenCalledTimes(2);
      });

      it('should handle partial stock consumption across multiple locations', async () => {
        const mockOrder = createMockOrder({ 
          id: orderId, 
          status: OrderStatus.PENDING,
          items: [{ id: 1, orderId: 1, itemId: 1, quantity: 30 }]
        });
        
        const mockStocks = [
          createMockInventoryStock({ id: 1, quantity: 10, location: 'A1' }),
          createMockInventoryStock({ id: 2, quantity: 15, location: 'A2' }),
          createMockInventoryStock({ id: 3, quantity: 20, location: 'A3' }),
        ];

        prisma.order.findUnique.mockResolvedValue(mockOrder);
        prisma.inventoryStock.aggregate.mockResolvedValue({ _sum: { quantity: 45 } });
        prisma.inventoryStock.findMany.mockResolvedValue(mockStocks);
        prisma.inventoryStock.update.mockResolvedValue(mockStocks[0]);
        prisma.order.update.mockResolvedValue({ ...mockOrder, status: OrderStatus.FULFILLED });

        // Mock transaction
        prisma.$transaction.mockImplementation(async (callback : any) => {
          return await callback(prisma);
        });

        await service.fulfillOrder(orderId, fulfillOrderDto);

        // Should consume from all three locations
        expect(prisma.inventoryStock.update).toHaveBeenCalledWith({
          where: { id: 1 },
          data: { quantity: { decrement: 10 } },
        });
        expect(prisma.inventoryStock.update).toHaveBeenCalledWith({
          where: { id: 2 },
          data: { quantity: { decrement: 15 } },
        });
        expect(prisma.inventoryStock.update).toHaveBeenCalledWith({
          where: { id: 3 },
          data: { quantity: { decrement: 5 } },
        });
      });

      it('should throw error if unexpected stock shortage during reservation', async () => {
        const mockOrder = createMockOrder({ 
          id: orderId, 
          status: OrderStatus.PENDING,
          items: [{ id: 1, orderId: 1, itemId: 1, quantity: 30 }]
        });
        
        const mockStocks = [
          createMockInventoryStock({ id: 1, quantity: 10 }),
          createMockInventoryStock({ id: 2, quantity: 15 }),
        ];

        prisma.order.findUnique.mockResolvedValue(mockOrder);
        // Mock initial stock check to pass (total 25 >= needed 30)
        prisma.inventoryStock.aggregate.mockResolvedValue({ _sum: { quantity: 25 } });
        prisma.inventoryStock.findMany.mockResolvedValue(mockStocks);
        prisma.inventoryStock.update.mockResolvedValue(mockStocks[0]);

        // Mock transaction
        prisma.$transaction.mockImplementation(async (callback: any) => {
          return await callback(prisma);
        });

        await expect(service.fulfillOrder(orderId, fulfillOrderDto)).rejects.toThrow(
          new BadRequestException('Insufficient stock for item 1. Needed 30, available 25')
        );
      });
    });

    describe('multi-item orders', () => {
      it('should fulfill order with multiple items', async () => {
        const mockOrder = createMockOrder({ 
          id: orderId, 
          status: OrderStatus.PENDING,
          items: [
            { id: 1, orderId: 1, itemId: 1, quantity: 10 },
            { id: 2, orderId: 1, itemId: 2, quantity: 5 }
          ]
        });
        
        const mockStocks1 = [createMockInventoryStock({ id: 1, itemId: 1, quantity: 15 })];
        const mockStocks2 = [createMockInventoryStock({ id: 2, itemId: 2, quantity: 8 })];

        prisma.order.findUnique.mockResolvedValue(mockOrder);
        prisma.inventoryStock.aggregate
          .mockResolvedValueOnce({ _sum: { quantity: 15 } }) // Item 1
          .mockResolvedValueOnce({ _sum: { quantity: 8 } })  // Item 2
          .mockResolvedValueOnce({ _sum: { quantity: 5 } })  // Item 1 after reservation
          .mockResolvedValueOnce({ _sum: { quantity: 3 } }); // Item 2 after reservation
        prisma.inventoryStock.findMany
          .mockResolvedValueOnce(mockStocks1)
          .mockResolvedValueOnce(mockStocks2);
        prisma.inventoryStock.update.mockResolvedValue(mockStocks1[0]);
        prisma.order.update.mockResolvedValue({ ...mockOrder, status: OrderStatus.FULFILLED });

        // Mock transaction
        prisma.$transaction.mockImplementation(async (callback : any) => {
          return await callback(prisma);
        });

        await service.fulfillOrder(orderId, fulfillOrderDto);

        expect(prisma.inventoryStock.aggregate).toHaveBeenCalledTimes(4);
        expect(prisma.inventoryStock.findMany).toHaveBeenCalledTimes(2);
        expect(events.push).toHaveBeenCalledWith('order_fulfilled', { orderId: 1 });
      });
    });
  });

  describe('getById', () => {
    const orderId = 1;

    it('should return order by id', async () => {
      const mockOrder = createMockOrder();
      prisma.order.findUnique.mockResolvedValue(mockOrder);

      const result = await service.getById(orderId);

      expect(prisma.order.findUnique).toHaveBeenCalledWith({ where: { id: orderId }, include: { items: true } });
      expect(result).toEqual(mockOrder);
    });

    it('should return null if order not found', async () => {
      prisma.order.findUnique.mockResolvedValue(null);

      const result = await service.getById(orderId);

      expect(result).toBeNull();
    });
  });
});
