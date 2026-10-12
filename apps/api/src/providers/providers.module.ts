import { Global, Module } from '@nestjs/common';
import { ProviderCredentials } from './provider-credentials.service.js';
import { ProviderKeyTester } from './provider-key-tester.js';
import { ProvidersController } from './providers.controller.js';

@Global()
@Module({
  controllers: [ProvidersController],
  providers: [ProviderCredentials, ProviderKeyTester],
  exports: [ProviderCredentials],
})
export class ProvidersModule {}
