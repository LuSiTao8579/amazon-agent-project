import { ApiProperty } from '@nestjs/swagger';
import { AI_AUDIT_RESULTS, AI_SESSION_STATUSES, AI_TASK_STATUSES } from '../ai.constants.js';

export class AiSessionResponseDto {
  @ApiProperty({ type: String, format: 'uuid' }) id!: string;
  @ApiProperty({ type: String, format: 'uuid' }) userId!: string;
  @ApiProperty({ type: String }) title!: string;
  @ApiProperty({ enum: AI_SESSION_STATUSES }) status!: string;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: string;
  @ApiProperty({ type: String, format: 'date-time' }) updatedAt!: string;
}

export class AiMemoryResponseDto {
  @ApiProperty({ type: String, format: 'uuid' }) id!: string;
  @ApiProperty({ type: String, format: 'uuid' }) userId!: string;
  @ApiProperty({ type: String }) content!: string;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: string;
  @ApiProperty({ type: String, format: 'date-time' }) updatedAt!: string;
}

export class AiTaskResponseDto {
  @ApiProperty({ type: String, format: 'uuid' }) id!: string;
  @ApiProperty({ type: String, format: 'uuid' }) userId!: string;
  @ApiProperty({ type: String }) name!: string;
  @ApiProperty({ enum: AI_TASK_STATUSES }) status!: string;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: string;
  @ApiProperty({ type: String, format: 'date-time' }) updatedAt!: string;
}

export class AiAuditResponseDto {
  @ApiProperty({ type: String, format: 'uuid' }) id!: string;
  @ApiProperty({ type: String, format: 'uuid' }) userId!: string;
  @ApiProperty({ type: String }) action!: string;
  @ApiProperty({ type: String }) resourceType!: string;
  @ApiProperty({ type: String, format: 'uuid', nullable: true }) resourceId!: string | null;
  @ApiProperty({ enum: AI_AUDIT_RESULTS }) result!: string;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: string;
}

class AiPageResponseDto {
  @ApiProperty({ type: Number, example: 1 }) page!: number;
  @ApiProperty({ type: Number, example: 10 }) pageSize!: number;
  @ApiProperty({ type: Boolean }) hasMore!: boolean;
}

export class AiSessionPageResponseDto extends AiPageResponseDto {
  @ApiProperty({ type: [AiSessionResponseDto] }) items!: AiSessionResponseDto[];
}
export class AiMemoryPageResponseDto extends AiPageResponseDto {
  @ApiProperty({ type: [AiMemoryResponseDto] }) items!: AiMemoryResponseDto[];
}
export class AiTaskPageResponseDto extends AiPageResponseDto {
  @ApiProperty({ type: [AiTaskResponseDto] }) items!: AiTaskResponseDto[];
}
export class AiAuditPageResponseDto extends AiPageResponseDto {
  @ApiProperty({ type: [AiAuditResponseDto] }) items!: AiAuditResponseDto[];
}
export class AiDeletedResponseDto {
  @ApiProperty({ type: Boolean, example: true }) deleted!: boolean;
}
