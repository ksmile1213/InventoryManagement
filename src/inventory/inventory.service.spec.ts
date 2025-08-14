import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { InventoryService } from './inventory.service';
import { PrismaService } from '../prisma/prisma.service';
import { EventsService } from '../events/events.service';
import { CreateInventoryItemDto } from './dto/create-inventory-item.dto';
import { AddStockDto } from './dto/add-stock.dto';
import { mockPrismaService, mockEventsService, createMockInventoryItem, createMockInventoryStock } from '../test/mocks';

describe('InventoryService', () => {
  let service: InventoryService;
  let prisma: any; // Use any to bypass Prisma type conflicts
  let events: any; // Use any to bypass type conflicts

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InventoryService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: EventsService, useValue: mockEventsService },
      ],
    }).compile();

    service = module.get<InventoryService>(InventoryService);
    prisma = module.get(PrismaService);
    events = module.get(EventsService);

    // Reset all mocks before each test
    jest.clearAllMocks();
  });

  describe('createItem', () => {
    const createItemDto: CreateInventoryItemDto = {
      name: 'Test Item',
      sku: 'TEST-001',
      type: 'test',
      unit: 'piece',
    };

    it('should create a new inventory item successfully', async () => {
      const mockItem = createMockInventoryItem();
      prisma.inventoryItem.findUnique.mockResolvedValue(null);
      prisma.inventoryItem.create.mockResolvedValue(mockItem);

      const result = await service.createItem(createItemDto);

      expect(prisma.inventoryItem.findUnique).toHaveBeenCalledWith({ where: { sku: 'TEST-001' } });
      expect(prisma.inventoryItem.create).toHaveBeenCalledWith({ data: createItemDto });
      expect(events.push).toHaveBeenCalledWith('item_created', { itemId: 1, sku: 'TEST-001' });
      expect(result).toEqual(mockItem);
    });

    it('should throw BadRequestException if SKU already exists', async () => {
      const existingItem = createMockInventoryItem();
      prisma.inventoryItem.findUnique.mockResolvedValue(existingItem);

      await expect(service.createItem(createItemDto)).rejects.toThrow(
        new BadRequestException('SKU already exists')
      );

      expect(prisma.inventoryItem.create).not.toHaveBeenCalled();
      expect(events.push).not.toHaveBeenCalled();
    });
  });

  describe('addStock', () => {
    const addStockDto: AddStockDto = {
      itemId: 1,
      location: 'A1',
      quantity: 100,
    };

    it('should add stock to existing location successfully', async () => {
      const mockItem = createMockInventoryItem();
      const mockStock = createMockInventoryStock();
      
      prisma.inventoryItem.findUnique.mockResolvedValue(mockItem);
      prisma.inventoryStock.upsert.mockResolvedValue(mockStock);

      const result = await service.addStock(addStockDto);

      expect(prisma.inventoryItem.findUnique).toHaveBeenCalledWith({ where: { id: 1 } });
      expect(prisma.inventoryStock.upsert).toHaveBeenCalledWith({
        where: { itemId_location: { itemId: 1, location: 'A1' } },
        update: { quantity: { increment: 100 } },
        create: { itemId: 1, location: 'A1', quantity: 100 },
      });
      expect(events.push).toHaveBeenCalledWith('stock_added', { itemId: 1, location: 'A1', quantity: 100 });
      expect(result).toEqual(mockStock);
    });

    it('should create new stock location if it does not exist', async () => {
      const mockItem = createMockInventoryItem();
      const mockStock = createMockInventoryStock({ location: 'B2' });
      const newStockDto = { ...addStockDto, location: 'B2' };
      
      prisma.inventoryItem.findUnique.mockResolvedValue(mockItem);
      prisma.inventoryStock.upsert.mockResolvedValue(mockStock);

      const result = await service.addStock(newStockDto);

      expect(prisma.inventoryStock.upsert).toHaveBeenCalledWith({
        where: { itemId_location: { itemId: 1, location: 'B2' } },
        update: { quantity: { increment: 100 } },
        create: { itemId: 1, location: 'B2', quantity: 100 },
      });
      expect(result).toEqual(mockStock);
    });

    it('should throw NotFoundException if inventory item not found', async () => {
      prisma.inventoryItem.findUnique.mockResolvedValue(null);

      await expect(service.addStock(addStockDto)).rejects.toThrow(
        new NotFoundException('Inventory item not found')
      );

      expect(prisma.inventoryStock.upsert).not.toHaveBeenCalled();
      expect(events.push).not.toHaveBeenCalled();
    });

    it('should increment existing stock quantity', async () => {
      const mockItem = createMockInventoryItem();
      const mockStock = createMockInventoryStock({ quantity: 150 });
      
      prisma.inventoryItem.findUnique.mockResolvedValue(mockItem);
      prisma.inventoryStock.upsert.mockResolvedValue(mockStock);

      await service.addStock(addStockDto);

      expect(prisma.inventoryStock.upsert).toHaveBeenCalledWith({
        where: { itemId_location: { itemId: 1, location: 'A1' } },
        update: { quantity: { increment: 100 } },
        create: { itemId: 1, location: 'A1', quantity: 100 },
      });
    });
  });

  describe('getAvailableQuantity', () => {
    const itemId = 1;

    it('should return total available quantity across all locations', async () => {
      prisma.inventoryStock.aggregate.mockResolvedValue({ _sum: { quantity: 250 } });

      const result = await service.getAvailableQuantity(itemId);

      expect(prisma.inventoryStock.aggregate).toHaveBeenCalledWith({
        where: { itemId },
        _sum: { quantity: true },
      });
      expect(result).toBe(250);
    });

    it('should return 0 if no stock exists', async () => {
      prisma.inventoryStock.aggregate.mockResolvedValue({ _sum: { quantity: null } });

      const result = await service.getAvailableQuantity(itemId);

      expect(result).toBe(0);
    });

    it('should return 0 if aggregate returns undefined', async () => {
      prisma.inventoryStock.aggregate.mockResolvedValue({ _sum: { quantity: undefined } });

      const result = await service.getAvailableQuantity(itemId);

      expect(result).toBe(0);
    });

    it('should handle multiple stock entries correctly', async () => {
      prisma.inventoryStock.aggregate.mockResolvedValue({ _sum: { quantity: 500 } });

      const result = await service.getAvailableQuantity(itemId);

      expect(result).toBe(500);
    });
  });
});
