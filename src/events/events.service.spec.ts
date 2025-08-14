import { Test, TestingModule } from '@nestjs/testing';
import { EventsService, AppEvent, AppEventType } from './events.service';

describe('EventsService', () => {
  let service: EventsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [EventsService],
    }).compile();

    service = module.get<EventsService>(EventsService);
  });

  describe('push', () => {
    it('should create and store a new event', () => {
      const eventType: AppEventType = 'item_created';
      const details = { itemId: 1, sku: 'TEST-001' };

      const result = service.push(eventType, details);

      expect(result).toMatchObject({
        id: 1,
        type: eventType,
        details,
      });
      expect(result.at).toBeDefined();
      expect(new Date(result.at).getTime()).toBeCloseTo(Date.now(), -2); // Within 100ms
    });

    it('should create event without details', () => {
      const eventType: AppEventType = 'order_fulfilled';

      const result = service.push(eventType);

      expect(result).toMatchObject({
        id: 1,
        type: eventType,
        details: undefined,
      });
    });

    it('should increment event ID for each new event', () => {
      service.push('item_created');
      service.push('stock_added');
      service.push('order_created');

      const events = service.list();
      expect(events).toHaveLength(3);
      expect(events[0].id).toBe(3);
      expect(events[1].id).toBe(2);
      expect(events[2].id).toBe(1);
    });

    it('should store events in reverse chronological order (newest first)', () => {
      service.push('item_created');
      service.push('stock_added');

      const events = service.list();
      expect(events[0].type).toBe('stock_added');
      expect(events[1].type).toBe('item_created');
    });
  });

  describe('list', () => {
    it('should return empty array initially', () => {
      const events = service.list();
      expect(events).toEqual([]);
    });

    it('should return all stored events', () => {
      service.push('item_created', { itemId: 1 });
      service.push('stock_added', { location: 'A1' });
      service.push('order_created', { orderNumber: 'SO-1001' });

      const events = service.list();
      expect(events).toHaveLength(3);
      expect(events[0].type).toBe('order_created');
      expect(events[1].type).toBe('stock_added');
      expect(events[2].type).toBe('item_created');
    });

    it('should return events with correct structure', () => {
      const details = { itemId: 1, sku: 'TEST-001' };
      service.push('item_created', details);

      const events = service.list();
      const event = events[0];

      expect(event).toHaveProperty('id');
      expect(event).toHaveProperty('type');
      expect(event).toHaveProperty('at');
      expect(event).toHaveProperty('details');
      expect(event.type).toBe('item_created');
      expect(event.details).toEqual(details);
    });
  });

  describe('event limit management', () => {
    it('should maintain maximum of 500 events', () => {
      // Add 501 events
      for (let i = 0; i < 501; i++) {
        service.push('item_created', { index: i });
      }

      const events = service.list();
      expect(events).toHaveLength(500);
      
      // Oldest events should be removed
      expect(events[events.length - 1].details).toEqual({ index: 1 });
      expect(events[0].details).toEqual({ index: 500 });
    });

    it('should remove oldest events when limit exceeded', () => {
      // Add 600 events
      for (let i = 0; i < 600; i++) {
        service.push('item_created', { index: i });
      }

      const events = service.list();
      expect(events).toHaveLength(500);
      
      // Should have kept the newest 500 events
      expect(events[0].details).toEqual({ index: 599 });
      expect(events[499].details).toEqual({ index: 100 });
    });
  });

  describe('event types', () => {
    it('should handle all defined event types', () => {
      const eventTypes: AppEventType[] = [
        'item_reserved',
        'stock_low',
        'order_fulfilled',
        'order_created',
        'stock_added',
        'item_created'
      ];

      eventTypes.forEach(type => {
        const event = service.push(type);
        expect(event.type).toBe(type);
      });

      const events = service.list();
      expect(events).toHaveLength(6);
      eventTypes.forEach((type, index) => {
        expect(events[events.length - 1 - index].type).toBe(type);
      });
    });
  });

  describe('event details', () => {
    it('should handle complex detail objects', () => {
      const complexDetails = {
        orderId: 1,
        items: [
          { itemId: 1, quantity: 10 },
          { itemId: 2, quantity: 5 }
        ],
        customer: 'John Doe',
        total: 150.00,
        metadata: {
          source: 'web',
          priority: 'high'
        }
      };

      const event = service.push('order_created', complexDetails);

      expect(event.details).toEqual(complexDetails);
    });

    it('should handle primitive detail values as object properties', () => {
      const stringDetail = { value: 'simple string' };
      const numberDetail = { value: 42 };
      const booleanDetail = { value: true };

      service.push('item_created', stringDetail);
      service.push('stock_added', numberDetail);
      service.push('order_fulfilled', booleanDetail);

      const events = service.list();
      expect(events[0].details).toBe(booleanDetail);
      expect(events[1].details).toBe(numberDetail);
      expect(events[2].details).toBe(stringDetail);
    });
  });
});
