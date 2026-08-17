import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DocumentBuilder, OpenAPIObject, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { PrismaService } from './database/prisma.service';

type DocumentMedia = { schema?: unknown };
type DocumentResponse = { content?: Record<string, DocumentMedia> };
type DocumentOperation = { responses?: Record<string, DocumentResponse> };

function isDocumentOperation(value: unknown): value is DocumentOperation {
  return typeof value === 'object' && value !== null;
}

function isSchemaObject(
  value: unknown,
): value is { type?: string; properties?: Record<string, unknown> } {
  return (
    typeof value === 'object' &&
    value !== null &&
    !('$ref' in value) &&
    !('allOf' in value)
  );
}

describe('OpenAPI contract', () => {
  let app: INestApplication;
  let document: OpenAPIObject;

  beforeAll(async () => {
    process.env.JWT_SECRET ??= 'test-secret-at-least-32-characters-long';
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue({})
      .compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
    document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().setTitle('API contract').addBearerAuth().build(),
    );
  });

  afterAll(async () => app.close());

  it('has no blank object schemas', () => {
    const blankSchemas = Object.entries(document.components?.schemas ?? {})
      .filter(
        ([, schema]) =>
          isSchemaObject(schema) &&
          schema.type === 'object' &&
          (!schema.properties || !Object.keys(schema.properties).length),
      )
      .map(([name]) => name);
    expect(blankSchemas).toEqual([]);
  });

  it('declares a typed successful response for every operation', () => {
    const verbs = new Set(['get', 'post', 'patch', 'put', 'delete']);
    const paths = document.paths as Record<string, Record<string, unknown>>;
    const missing = Object.entries(paths).flatMap(([path, pathItem]) =>
      Object.entries(pathItem)
        .filter(([method]) => verbs.has(method))
        .filter(([, candidate]) => {
          if (!isDocumentOperation(candidate)) return true;
          const operation = candidate;
          const responses = operation.responses ?? {};
          return !Object.entries(responses).some(
            ([status, response]) =>
              status.startsWith('2') &&
              Object.values(response.content ?? {}).some((media) =>
                Boolean(media.schema),
              ),
          );
        })
        .map(([method]) => `${method.toUpperCase()} ${path}`),
    );
    expect(missing).toEqual([]);
  });

  it('documents the Stripe Checkout request and response bodies', () => {
    const checkout = document.paths['/api/checkout/orders']?.post;
    expect(checkout?.requestBody).toBeDefined();
    expect(checkout?.responses['201']).toMatchObject({
      content: {
        'application/json': {
          schema: { $ref: '#/components/schemas/CheckoutSessionResponseDto' },
        },
      },
    });
  });
});
