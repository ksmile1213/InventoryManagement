## Inventory Management API (NestJS + Prisma + Postgres)

Backend service that supports:

- Add inventory items
- Add stock to locations
- Create orders with items
- Fulfill orders by reserving stock
- Optional in-memory event log

### Tech

- NestJS 10, Prisma 5, PostgreSQL 16 (Docker), TypeScript

### Quick Start

1. Start Postgres via Docker:

```bash
docker-compose up -d
```

2. Configure environment:

Create `.env` in project root:

```bash
echo "DATABASE_URL=postgresql://postgres:postgrespassword@localhost:5432/inventory?schema=public" > .env
echo "PORT=3000" >> .env
# Optional simple API key guard
# echo "API_KEY=changeme" >> .env
```

3. Install dependencies and generate Prisma client:

```bash
npm install
npm run prisma:generate
npm run prisma:migrate -- --name init
```

4. Run dev server:

```bash
npm run start:dev
```

API runs at `http://localhost:3000`.

If `API_KEY` is set, include header `x-api-key: <value>` in all requests.

### Testing

The project includes comprehensive Jest tests for all service logic. Tests are organized by service and cover both happy path scenarios and edge cases.

#### Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode (re-runs on file changes)
npm run test:watch

# Run tests with coverage report
npm run test:coverage
```

#### Test Coverage

**OrdersService Tests** (`src/orders/orders.service.spec.ts`):
- Order creation with duplicate validation
- Order fulfillment with stock reservation
- FIFO (First In, First Out) stock management
- Multi-item order processing
- Location-specific stock fulfillment
- Stock low threshold monitoring
- Error handling for insufficient stock
- Transaction rollback scenarios

**InventoryService Tests** (`src/inventory/inventory.service.spec.ts`):
- Inventory item creation with SKU validation
- Stock addition and updates
- Stock quantity aggregation across locations
- Error handling for non-existent items
- Upsert operations for stock management

**EventsService Tests** (`src/events/events.service.spec.ts`):
- Event creation and storage
- Event ordering and ID management
- Memory limit management (500 event limit)
- Event detail handling
- Event type validation

#### Test Architecture

- **Mocking Strategy**: Uses Jest mocks for Prisma service and external dependencies
- **Test Isolation**: Each test resets mocks and creates fresh service instances
- **Type Safety**: TypeScript interfaces ensure test data consistency
- **Coverage**: Tests cover all public methods and error scenarios

#### Key Test Scenarios

1. **Stock Reservation Logic**: Tests the complex FIFO stock reservation algorithm
2. **Transaction Handling**: Verifies database transaction integrity
3. **Business Rule Validation**: Ensures business logic constraints are enforced
4. **Error Handling**: Validates proper error responses for edge cases
5. **Event Emission**: Confirms events are properly logged for audit trails

### Prisma Schema

See `prisma/schema.prisma`.

### Endpoints

Base path examples (JSON):

```bash
# 1) Create inventory item
curl -X POST http://localhost:3000/inventory/items \
  -H 'Content-Type: application/json' \
  -d '{
    "name": "Vitamin C 500mg",
    "sku": "VITC-500",
    "type": "capsule",
    "unit": "bottle"
  }'

# 2) Add stock
curl -X POST http://localhost:3000/inventory/stock \
  -H 'Content-Type: application/json' \
  -d '{
    "itemId": 1,
    "location": "A1",
    "quantity": 100
  }'

# 3) Create order
curl -X POST http://localhost:3000/orders \
  -H 'Content-Type: application/json' \
  -d '{
    "orderNumber": "SO-1001",
    "items": [
      { "itemId": 1, "quantity": 30 }
    ]
  }'

# 4) Fulfill order
curl -X POST http://localhost:3000/orders/1/fulfill -H 'Content-Type: application/json' -d '{}'

# Events
curl http://localhost:3000/events
```

If API key is enabled:

```bash
 -H 'x-api-key: changeme'
```

### Validation and Errors

- Basic DTO validation with class-validator
- Cannot fulfill if insufficient stock
- FIFO stock reservation by oldest stock entries

### Trade-offs / Notes

- Stock is decremented in-place; no separate reservations table
- Simple in-memory event log (resets on process restart)
- Basic API key guard optional via `API_KEY`
- Minimal business rules to keep the implementation focused

### Tests (Optional)

Service logic is structured to be testable. Add Jest and write unit tests for `OrdersService` reservation logic if desired.

