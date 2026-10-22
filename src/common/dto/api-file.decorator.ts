import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Documents a single binary upload field so Swagger UI renders a file picker.
 * The field itself is consumed by the upload interceptor, never by the
 * validation pipe, so it carries no validator decorators.
 */
export function ApiBinaryFile(description: string): PropertyDecorator {
  return ApiPropertyOptional({ type: 'string', format: 'binary', description });
}

/** Documents a binary upload field the endpoint cannot run without. */
export function ApiRequiredBinaryFile(description: string): PropertyDecorator {
  return ApiProperty({ type: 'string', format: 'binary', description });
}

/** Documents a repeatable binary upload field for multipart requests. */
export function ApiBinaryFiles(description: string): PropertyDecorator {
  return ApiPropertyOptional({
    type: 'array',
    items: { type: 'string', format: 'binary' },
    description,
  });
}
