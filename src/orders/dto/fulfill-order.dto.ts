import { IsInt, IsOptional, IsString } from 'class-validator';

export class FulfillOrderDto {
  @IsOptional()
  @IsString()
  location?: string;
}
