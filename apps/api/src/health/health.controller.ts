import { Controller, Get } from '@nestjs/common';
import { healthResponseSchema, type HealthResponse } from '@higheval/shared';
import { ApiDoc } from '../openapi/api-doc.decorator.js';
import { HealthService } from './health.service.js';

@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  @ApiDoc({
    summary: 'Readiness of the API, Hermes and provider keys',
    response: healthResponseSchema,
  })
  getHealth(): HealthResponse {
    return this.healthService.check();
  }
}
