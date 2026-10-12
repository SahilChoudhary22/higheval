import { z } from 'zod';
import { buildOpenApiDocument, type DocumentedRoute } from './openapi.builder.js';

const INFO = { title: 'Test', version: '1.0.0', description: 'Test API' };

type Json = Record<string, unknown>;
const schemas = (document: Json): Record<string, Json> =>
  z
    .object({
      components: z.object({ schemas: z.record(z.string(), z.record(z.string(), z.unknown())) }),
    })
    .parse(document).components.schemas;
const operation = (document: Json, path: string, method: string): Json =>
  z
    .object({
      paths: z.record(z.string(), z.record(z.string(), z.record(z.string(), z.unknown()))),
    })
    .parse(document).paths[path]?.[method] ?? {};

const node = z.object({ label: z.string() });
type Tree = { label: string; children: Tree[] };
const tree: z.ZodType<Tree> = z.lazy(() =>
  z.object({ label: z.string(), children: z.array(tree) }),
);
const itemSchema = z.object({ id: z.string(), node, tree });
const itemInputSchema = z.object({ name: z.string(), weight: z.number().default(1), node });
const unusedSchema = z.object({ never: z.boolean() });
const NAMED = {
  Node: node,
  Tree: tree,
  Item: itemSchema,
  ItemInput: itemInputSchema,
  Unused: unusedSchema,
};

const route = (
  overrides: Partial<DocumentedRoute> & Pick<DocumentedRoute, 'doc'>,
): DocumentedRoute => ({
  method: 'get',
  path: '/api/items',
  status: 200,
  operationId: 'items.list',
  ...overrides,
});

describe('buildOpenApiDocument', () => {
  const document = buildOpenApiDocument(
    [
      route({ doc: { summary: 'List items', response: z.array(itemSchema) } }),
      route({
        method: 'post',
        status: 201,
        operationId: 'items.create',
        doc: { summary: 'Create', body: itemInputSchema, response: itemSchema },
      }),
      route({
        path: '/api/items/:id',
        operationId: 'items.get',
        doc: { summary: 'Get', response: itemSchema, params: { id: 'Item ID' } },
      }),
      route({
        path: '/api/items/:id/report',
        operationId: 'items.report',
        doc: { summary: 'Report', produces: 'text/markdown' },
      }),
      route({
        path: '/api/hidden',
        operationId: 'hidden.page',
        doc: { summary: 'Page', hidden: true },
      }),
    ],
    INFO,
    NAMED,
  );

  it('converts paths, parameters, statuses and tags', () => {
    expect(
      Object.keys(z.object({ paths: z.record(z.string(), z.unknown()) }).parse(document).paths),
    ).toEqual(['/api/items', '/api/items/{id}', '/api/items/{id}/report']);
    const get = operation(document, '/api/items/{id}', 'get');
    expect(get).toMatchObject({
      operationId: 'items.get',
      tags: ['Items'],
      parameters: [{ name: 'id', in: 'path', required: true, description: 'Item ID' }],
      responses: { '200': {}, '400': {}, '404': {} },
    });
    expect(operation(document, '/api/items', 'post')).toMatchObject({
      responses: { '201': {}, '400': {} },
      requestBody: {
        content: { 'application/json': { schema: { $ref: '#/components/schemas/ItemInput' } } },
      },
    });
    expect(operation(document, '/api/items/{id}/report', 'get')).toMatchObject({
      responses: { '200': { content: { 'text/markdown': { schema: { type: 'string' } } } } },
    });
  });

  it('references named contracts and inlines wrappers around them', () => {
    expect(operation(document, '/api/items', 'get')).toMatchObject({
      responses: {
        '200': {
          content: {
            'application/json': {
              schema: { type: 'array', items: { $ref: '#/components/schemas/Item' } },
            },
          },
        },
      },
    });
  });

  it('shares one component when input and output forms match, including recursive ones', () => {
    const names = Object.keys(schemas(document));
    expect(names).toContain('Node');
    expect(names).toContain('Tree');
    expect(names).not.toContain('NodeInput');
    expect(names).not.toContain('TreeInput');
    expect(JSON.stringify(schemas(document).Tree)).toContain('#/components/schemas/Tree');
  });

  it('documents defaults as optional in request bodies', () => {
    expect(schemas(document).ItemInput).toMatchObject({ required: ['name', 'node'] });
  });

  it('emits only components reachable from a route', () => {
    expect(Object.keys(schemas(document))).not.toContain('Unused');
    expect(Object.keys(schemas(document))).toContain('ApiError');
  });
});
