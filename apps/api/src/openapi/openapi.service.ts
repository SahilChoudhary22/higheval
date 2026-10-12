import { Injectable, RequestMethod, type OnApplicationBootstrap } from '@nestjs/common';
import { HTTP_CODE_METADATA, METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants.js';
import { DiscoveryService, MetadataScanner, Reflector } from '@nestjs/core';
import { APP_VERSION } from '../config/version.js';
import { API_DOC, type ApiDocOptions } from './api-doc.decorator.js';
import { buildOpenApiDocument, type DocumentedRoute, type HttpMethod } from './openapi.builder.js';

const METHODS: Partial<Record<RequestMethod, HttpMethod>> = {
  [RequestMethod.GET]: 'get',
  [RequestMethod.POST]: 'post',
  [RequestMethod.PUT]: 'put',
  [RequestMethod.DELETE]: 'delete',
  [RequestMethod.PATCH]: 'patch',
};

/** A controller route found at startup; `doc` is undefined when it lacks `@ApiDoc`. */
export interface DiscoveredRoute extends Omit<DocumentedRoute, 'doc'> {
  doc: ApiDocOptions | undefined;
}

const joinPath = (...parts: string[]): string =>
  `/${parts
    .flatMap((part) => part.split('/'))
    .filter(Boolean)
    .join('/')}`;

/**
 * Generates the OpenAPI document from the running application's controllers,
 * so every route that exists is described with the schemas that validate it.
 */
@Injectable()
export class OpenApiService implements OnApplicationBootstrap {
  private document: Record<string, unknown> | undefined;
  private discovered: DiscoveredRoute[] = [];

  constructor(
    private readonly discovery: DiscoveryService,
    private readonly scanner: MetadataScanner,
    private readonly reflector: Reflector,
  ) {}

  onApplicationBootstrap(): void {
    this.discovered = this.discover();
  }

  /** Every route, documented or not; used to enforce that all are documented. */
  routes(): DiscoveredRoute[] {
    return this.discovered;
  }

  getDocument(): Record<string, unknown> {
    this.document ??= buildOpenApiDocument(
      this.discovered.flatMap((route) => (route.doc ? [{ ...route, doc: route.doc }] : [])),
      {
        title: 'HighEval API',
        version: APP_VERSION,
        description:
          'Define task suites and agent configurations, run A/B experiments on Hermes Agent, and inspect the evidence. Request and response bodies are validated against these schemas.',
      },
    );
    return this.document;
  }

  private discover(): DiscoveredRoute[] {
    return this.discovery.getControllers().flatMap(({ instance, metatype }) => {
      if (!instance || !metatype) return [];
      const prototype: unknown = Object.getPrototypeOf(instance);
      if (typeof prototype !== 'object' || prototype === null) return [];
      const base = this.reflector.get<string | undefined>(PATH_METADATA, metatype) ?? '';
      const resource = metatype.name.replace(/Controller$/, '').toLowerCase();
      return this.scanner.getAllMethodNames(prototype).flatMap((name) => {
        const handler: unknown = Reflect.get(prototype, name);
        if (typeof handler !== 'function') return [];
        const method = METHODS[this.reflector.get<RequestMethod>(METHOD_METADATA, handler)];
        const path = this.reflector.get<string | undefined>(PATH_METADATA, handler);
        if (!method || path === undefined) return [];
        const status =
          this.reflector.get<number | undefined>(HTTP_CODE_METADATA, handler) ??
          (method === 'post' ? 201 : 200);
        return [
          {
            method,
            path: joinPath('api', base, path),
            status,
            operationId: `${resource}.${name}`,
            doc: this.reflector.get<ApiDocOptions | undefined>(API_DOC, handler),
          },
        ];
      });
    });
  }
}
