import { BadRequestException, ValidationPipe, type ArgumentMetadata, type Type } from '@nestjs/common';

/** AI DTO 专用管道：在现有校验策略外拒绝数组、null 和标量。 */
class AiDtoValidationPipe extends ValidationPipe {
  override async transform(value: unknown, metadata: ArgumentMetadata): Promise<unknown> {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      throw new BadRequestException('请求参数必须是对象');
    }
    return super.transform(value, metadata);
  }
}

/** 后续 Controller 显式使用，以兼容生产和测试环境的类型元数据差异。 */
export function aiDtoPipe(type: Type<object>): ValidationPipe {
  return new AiDtoValidationPipe({
    expectedType: type,
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
    validationError: { target: false, value: false },
  });
}
