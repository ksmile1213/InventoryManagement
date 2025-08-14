import { PrismaService } from '../prisma/prisma.service';
import { EventsService } from '../events/events.service';

// Simplified mock types to avoid Prisma type conflicts
export const mockPrismaService = {
  order: {
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  inventoryStock: {
    aggregate: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    upsert: jest.fn(),
  },
  inventoryItem: {
    findUnique: jest.fn(),
    create: jest.fn(),
  },
  $transaction: jest.fn(),
} as any; // Use any to bypass strict Prisma typing

export const mockEventsService = {
  push: jest.fn(),
  list: jest.fn(),
} as any; // Use any to bypass strict typing

export const createMockInventoryItem = (overrides = {}) => ({
  id: 1,
  name: 'Test Item',
  sku: 'TEST-001',
  type: 'test',
  unit: 'piece',
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

export const createMockInventoryStock = (overrides = {}) => ({
  id: 1,
  itemId: 1,
  location: 'A1',
  quantity: 100,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

export const createMockOrder = (overrides = {}) => ({
  id: 1,
  orderNumber: 'SO-1001',
  status: 'PENDING',
  createdAt: new Date(),
  updatedAt: new Date(),
  items: [
    { id: 1, orderId: 1, itemId: 1, quantity: 10 }
  ],
  ...overrides,
});

export const createMockOrderItem = (overrides = {}) => ({
  id: 1,
  orderId: 1,
  itemId: 1,
  quantity: 10,
  ...overrides,
});
