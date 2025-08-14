import { Body, Controller, Get, Param, ParseIntPipe, Post } from '@nestjs/common';
import { InventoryService } from './inventory.service';
import { CreateInventoryItemDto } from './dto/create-inventory-item.dto';
import { AddStockDto } from './dto/add-stock.dto';

@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventory: InventoryService) {}

  @Post('items')
  createItem(@Body() dto: CreateInventoryItemDto) {
    return this.inventory.createItem(dto);
  }

  @Post('stock')
  addStock(@Body() dto: AddStockDto) {
    return this.inventory.addStock(dto);
  }

  @Get('items/:id/available')
  getAvailable(@Param('id', ParseIntPipe) id: number) {
    return this.inventory.getAvailableQuantity(id);
  }
}
