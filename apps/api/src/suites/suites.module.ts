import { Module } from '@nestjs/common';
import { SuitesController } from './suites.controller.js';
import { SuitesService } from './suites.service.js';

@Module({
  controllers: [SuitesController],
  providers: [SuitesService],
  exports: [SuitesService],
})
export class SuitesModule {}
