import { IsInt, IsNotEmpty, IsPositive, IsString } from 'class-validator';

export class AddStockDto {
  @IsInt()
  itemId!: number;

  @IsString()
  @IsNotEmpty()
  location!: string;

  @IsInt()
  @IsPositive()
  quantity!: number;
}
