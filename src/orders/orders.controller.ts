import { Body, Controller, Get, Param, ParseIntPipe, Post } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { FulfillOrderDto } from './dto/fulfill-order.dto';

@Controller('orders')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Post()
  create(@Body() dto: CreateOrderDto) {
    return this.orders.createOrder(dto);
  }

  @Post(':id/fulfill')
  fulfill(@Param('id', ParseIntPipe) id: number, @Body() dto: FulfillOrderDto) {
    return this.orders.fulfillOrder(id, dto);
  }

  @Get(':id')
  get(@Param('id', ParseIntPipe) id: number) {
    return this.orders.getById(id);
  }
}
