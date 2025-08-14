import { Injectable } from '@nestjs/common';

export type AppEventType = 'item_reserved' | 'stock_low' | 'order_fulfilled' | 'order_created' | 'stock_added' | 'item_created';

export interface AppEvent {
  id: number;
  type: AppEventType;
  at: string;
  details?: Record<string, unknown>;
}

@Injectable()
export class EventsService {
  private readonly events: AppEvent[] = [];
  private nextId = 1;

  push(type: AppEventType, details?: Record<string, unknown>): AppEvent {
    const event: AppEvent = {
      id: this.nextId++,
      type,
      at: new Date().toISOString(),
      details
    };
    this.events.unshift(event);
    if (this.events.length > 500) {
      this.events.pop();
    }
    return event;
  }

  list(): AppEvent[] {
    return this.events;
  }
}
