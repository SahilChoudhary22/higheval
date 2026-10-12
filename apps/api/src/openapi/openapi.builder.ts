import * as shared from '@higheval/shared';
import { apiErrorSchema } from '@higheval/shared';
import { z } from 'zod';
import type { ApiDocOptions } from './api-doc.decorator.js';

export type HttpMethod = 'get' | 'post' | 'put' | 'delete' | 'patch';

/** A route discovered on a controller, with its documentation. */
export interface DocumentedRoute {
  method: HttpMethod;
  /** Express-style path, e.g. `/api/experiments/:id`. */
  path: string;
  /** Success status code. */
  status: number;
  /** Stable identifier, e.g. `experiments.create`. */
  operationId: string;
  doc: ApiDocOptions;
}

export interface OpenApiInfo {
  title: string;
  version: string;
  description: string;
}

type JsonSchema = Record<string, unknown>;
type Operation = Record<string, unknown>;

const TAG_DESCRIPTIONS: Record<string, string> = {
  Configs: 'Agent configurations: model, skills, memory, toolsets and limits.',
  Docs: 'This API description.',
  Experiments: 'Launch, follow, compare and export A/B experiments.',
  Health: 'Readiness of the API, Hermes and provider keys.',
  Hermes: "The pinned Hermes runtime's built-in skills.",
  Providers: 'Model provider API keys. Keys are write-only; only a hint is returned.',
  Runs: 'Individual agent runs, for inspection.',
  Skills: 'Instruction skills a configuration can preload.',
  'Suite drafts': 'Hermes drafts or revises a suite from a plain-language description.',
  Suites: 'Task suites and their scorers.',
};

/** Express `:id` → OpenAPI `{id}`. */
const toOpenApiPath = (path: string): string => path.replaceAll(/:(\w+)/g, '{$1}');
const pathParams = (path: string): string[] =>
  Array.from(path.matchAll(/:(\w+)/g), (match) => match[1] ?? '');
/** `/api/experiments/:id/runs` → `Experiments`; `/api/suite-drafts` → `Suite drafts`. */
const tagOf = (path: string): string => {
  const segment = path.split('/').find((part) => part && part !== 'api' && !part.startsWith(':'));
  const name = segment === 'openapi.json' ? 'docs' : (segment ?? 'api');
  const words = name.replaceAll('-', ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
};

type Io = 'input' | 'output';

const REF_PREFIX = '#/components/schemas/';
const TARGET = 'draft-2020-12'; // The JSON Schema dialect OpenAPI 3.1 uses.

/**
 * Names of a contract's two forms. Request bodies use the input form (fields
 * with defaults are optional); responses use the output form. Contracts named
 * `…Input` are request bodies, so their input form keeps the plain name; for
 * others the input form is `…Input`, or `…Write` when a contract already has
 * that name (`Experiment` beside `ExperimentInput`).
 */
function formNames(name: string, taken: ReadonlySet<string>): Record<Io, string> {
  if (name.endsWith('Input')) return { input: name, output: `${name}Output` };
  return { input: taken.has(`${name}Input`) ? `${name}Write` : `${name}Input`, output: name };
}

/** Rewrites every `$ref` in a JSON value, at any depth. */
function relinkRefs(value: unknown, target: (ref: string) => string): unknown {
  if (Array.isArray(value)) return value.map((item) => relinkRefs(item, target));
  if (typeof value !== 'object' || value === null) return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, child]) => [
      key,
      key === '$ref' && typeof child === 'string' ? target(child) : relinkRefs(child, target),
    ]),
  );
}

/** Every `$ref` target name in a JSON value. */
function referencedNames(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(referencedNames);
  if (typeof value !== 'object' || value === null) return [];
  return Object.entries(value).flatMap(([key, child]) =>
    key === '$ref' && typeof child === 'string' && child.startsWith(REF_PREFIX)
      ? [child.slice(REF_PREFIX.length)]
      : referencedNames(child),
  );
}

/**
 * Zod marks output objects closed (`additionalProperties: false`) because it
 * strips unknown keys on input. That alone is not worth a second component, so
 * form comparison ignores it.
 */
function withoutClosedObjects(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutClosedObjects);
  if (typeof value !== 'object' || value === null) return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key, child]) => !(key === 'additionalProperties' && child === false))
      .map(([key, child]) => [key, withoutClosedObjects(child)]),
  );
}

const withoutDialect = (schema: object): JsonSchema =>
  Object.fromEntries(Object.entries(schema).filter(([key]) => key !== '$schema' && key !== '$id'));

/**
 * Component schemas for the shared contracts. Each contract is converted once
 * per direction, so a component has one definition however many routes use
 * it. Input and output forms that are identical share one component, and only
 * components reachable from a route are emitted.
 */
class Components {
  private readonly forms = new Map<z.ZodType, Record<Io, string>>();
  private readonly registries: Record<Io, z.core.$ZodRegistry<{ id: string }>> = {
    input: z.registry<{ id: string }>(),
    output: z.registry<{ id: string }>(),
  };
  private readonly definitions: Record<string, JsonSchema> = {};
  /** Component name → the name it is published under (identical forms are merged). */
  private readonly canonical = new Map<string, string>();
  /** Published name → the definition it is published with, where they differ. */
  private readonly sources = new Map<string, string>();

  constructor(named: Readonly<Record<string, z.ZodType>>) {
    const taken = new Set(Object.keys(named));
    for (const [name, schema] of Object.entries(named)) {
      const forms = formNames(name, taken);
      this.forms.set(schema, forms);
      this.registries.input.add(schema, { id: forms.input });
      this.registries.output.add(schema, { id: forms.output });
    }
    for (const io of ['input', 'output'] as const) {
      const { schemas } = z.toJSONSchema(this.registries[io], {
        target: TARGET,
        io,
        unrepresentable: 'any',
        uri: (id) => `${REF_PREFIX}${id}`,
      });
      for (const [name, schema] of Object.entries(schemas)) {
        this.definitions[name] = withoutDialect(schema);
      }
    }
    this.mergeIdenticalForms();
  }

  /** A `$ref` (or an inline schema) for `schema` in the given direction. */
  schema(schema: z.ZodType, io: Io): JsonSchema {
    const forms = this.forms.get(schema);
    if (forms) return { $ref: `${REF_PREFIX}${this.publish(forms[io])}` };
    const { $defs: _defs, ...root } = withoutDialect(
      z.toJSONSchema(schema, {
        target: TARGET,
        io,
        metadata: this.registries[io],
        unrepresentable: 'any',
      }),
    );
    return this.relink(root, (name) => name.replace(/^#\/\$defs\//, ''));
  }

  /** The definitions reachable from `roots`, under their published names. */
  reachableFrom(roots: unknown): Record<string, JsonSchema> {
    const result: Record<string, JsonSchema> = {};
    const pending = referencedNames(roots);
    for (let name = pending.pop(); name !== undefined; name = pending.pop()) {
      if (name in result) continue;
      const source = this.sources.get(name) ?? name;
      const definition = this.relink(this.definitions[source] ?? {}, (ref) =>
        ref.slice(REF_PREFIX.length),
      );
      result[name] = definition;
      pending.push(...referencedNames(definition));
    }
    return Object.fromEntries(Object.entries(result).toSorted(([a], [b]) => a.localeCompare(b)));
  }

  private publish(name: string): string {
    return this.canonical.get(name) ?? name;
  }

  private relink(schema: JsonSchema, nameOf: (ref: string) => string): JsonSchema {
    return Object.fromEntries(
      Object.entries(schema).map(([key, value]) => [
        key,
        relinkRefs(value, (ref) => `${REF_PREFIX}${this.publish(nameOf(ref))}`),
      ]),
    );
  }

  /**
   * Publishes a contract's two forms as one component when they are
   * identical. Schemas can be recursive (`JsonValue`), so this starts by
   * assuming every pair is identical and drops pairs that differ under that
   * assumption until nothing changes; what remains is provably identical.
   */
  private mergeIdenticalForms(): void {
    const pairs = [...this.forms.values()];
    const pairOf = new Map(
      pairs.flatMap((pair) => [
        [pair.input, pair],
        [pair.output, pair],
      ]),
    );
    const same = new Set(pairs);
    const normalised = (name: string): string =>
      JSON.stringify(
        relinkRefs(withoutClosedObjects(this.definitions[name] ?? {}), (ref) => {
          const target = ref.slice(REF_PREFIX.length);
          const pair = pairOf.get(target);
          return pair && same.has(pair) ? `=${pair.output}` : target;
        }),
      );
    for (let changed = true; changed;) {
      changed = false;
      for (const pair of same) {
        if (normalised(pair.input) !== normalised(pair.output)) {
          same.delete(pair);
          changed = true;
        }
      }
    }
    for (const { input, output } of same) {
      const keep = output.endsWith('Output') ? input : output;
      this.canonical.set(input, keep).set(output, keep);
      // The input form is the more permissive one, so it describes both directions.
      this.sources.set(keep, input);
    }
  }
}

const pascal = (text: string): string =>
  text.replaceAll(/(^|[^a-zA-Z0-9]+)([a-zA-Z0-9])/g, (_match, _sep, char: string) =>
    char.toUpperCase(),
  );

function operation(route: DocumentedRoute, components: Components): Operation {
  const { doc } = route;
  const params = pathParams(route.path);
  const errorRef = components.schema(apiErrorSchema, 'output');
  const error = (description: string) => ({
    description,
    content: { 'application/json': { schema: errorRef } },
  });

  const success: Record<string, unknown> = {
    description: route.status === 204 ? 'No content' : 'Success',
  };
  if (doc.response) {
    success.content = {
      'application/json': { schema: components.schema(doc.response, 'output') },
    };
  } else if (doc.produces) {
    success.content = { [doc.produces]: { schema: { type: 'string' } } };
  }

  const responses: Record<string, unknown> = { [String(route.status)]: success };
  if (doc.body || params.length > 0) responses['400'] = error('Invalid input; see `issues`');
  if (params.length > 0) responses['404'] = error('Not found');

  return {
    operationId: route.operationId,
    summary: doc.summary,
    ...(doc.description ? { description: doc.description } : {}),
    tags: [tagOf(route.path)],
    ...(params.length > 0
      ? {
          parameters: params.map((param) => ({
            name: param,
            in: 'path',
            required: true,
            schema: { type: 'string' },
            ...(doc.params?.[param] ? { description: doc.params[param] } : {}),
          })),
        }
      : {}),
    ...(doc.body
      ? {
          requestBody: {
            required: true,
            content: {
              'application/json': { schema: components.schema(doc.body, 'input') },
            },
          },
        }
      : {}),
    responses,
  };
}

/**
 * Every object or union contract exported by `@higheval/shared`, named after
 * its export (`experimentSchema` → `Experiment`).
 */
export function sharedContracts(): Record<string, z.ZodType> {
  return Object.fromEntries(
    Object.entries(shared).flatMap(([name, value]) =>
      name.endsWith('Schema') &&
      (value instanceof z.ZodObject ||
        value instanceof z.ZodDiscriminatedUnion ||
        value instanceof z.ZodUnion ||
        value instanceof z.ZodLazy)
        ? [[pascal(name.slice(0, -'Schema'.length)), value]]
        : [],
    ),
  );
}

/** Builds an OpenAPI 3.1 document from documented routes. Pure, so it is unit-testable. */
export function buildOpenApiDocument(
  routes: readonly DocumentedRoute[],
  info: OpenApiInfo,
  named: Readonly<Record<string, z.ZodType>> = sharedContracts(),
): Record<string, unknown> {
  // Every route can fail with the shared error body, so it is always a named component.
  const components = new Components({ ApiError: apiErrorSchema, ...named });
  const paths: Record<string, Record<string, Operation>> = {};
  const visible = routes
    .filter((route) => !route.doc.hidden)
    .toSorted((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method));
  for (const route of visible) {
    const path = toOpenApiPath(route.path);
    paths[path] = { ...paths[path], [route.method]: operation(route, components) };
  }
  const tags = [...new Set(visible.map((route) => tagOf(route.path)))].toSorted().map((name) => ({
    name,
    ...(TAG_DESCRIPTIONS[name] ? { description: TAG_DESCRIPTIONS[name] } : {}),
  }));
  return {
    openapi: '3.1.0',
    info,
    servers: [{ url: '/' }],
    tags,
    paths,
    components: { schemas: components.reachableFrom(paths) },
  };
}
