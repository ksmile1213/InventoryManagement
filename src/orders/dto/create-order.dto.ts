import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsInt, IsNotEmpty, IsPositive, IsString, ValidateNested } from 'class-validator';

class CreateOrderItemDto {
  @IsInt()
  itemId!: number;

  @IsInt()
  @IsPositive()
  quantity!: number;
}

export class CreateOrderDto {
  @IsString()
  @IsNotEmpty()
  orderNumber!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemDto)
  items!: CreateOrderItemDto[];
}

export { CreateOrderItemDto };
