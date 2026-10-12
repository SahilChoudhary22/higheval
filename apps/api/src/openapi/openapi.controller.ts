import { Controller, Get, Header } from '@nestjs/common';
import { ApiDoc } from './api-doc.decorator.js';
import { OpenApiService } from './openapi.service.js';

/** Where `swagger-ui-dist` is served from; see `configureApp`. */
export const DOCS_ASSETS_PATH = '/api/docs/assets';

const DOCS_PAGE = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>HighEval API</title>
    <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
    <meta name="color-scheme" content="light dark" />
    <link rel="stylesheet" href="${DOCS_ASSETS_PATH}/swagger-ui.css" />
    <style>
      body { margin: 0; background: #fff; }
      html.dark-mode body { background: #1b1b1b; }
    </style>
  </head>
  <body>
    <div id="swagger-ui"></div>
    <script src="${DOCS_ASSETS_PATH}/swagger-ui-bundle.js"></script>
    <script>
      // Swagger UI ships dark styles under .dark-mode; follow the OS setting.
      const dark = matchMedia('(prefers-color-scheme: dark)');
      const applyScheme = () => document.documentElement.classList.toggle('dark-mode', dark.matches);
      applyScheme();
      dark.addEventListener('change', applyScheme);
      SwaggerUIBundle({ url: '/api/openapi.json', dom_id: '#swagger-ui', deepLinking: true });
    </script>
  </body>
</html>
`;

@Controller()
export class OpenApiController {
  constructor(private readonly openApi: OpenApiService) {}

  @Get('openapi.json')
  @ApiDoc({ summary: 'OpenAPI 3.1 description of this API' })
  document(): Record<string, unknown> {
    return this.openApi.getDocument();
  }

  /** Interactive reference, rendered by a self-hosted Swagger UI (no CDN). */
  @Get('docs')
  @Header('Content-Type', 'text/html; charset=utf-8')
  @ApiDoc({ summary: 'Interactive API reference', hidden: true })
  page(): string {
    return DOCS_PAGE;
  }
}
