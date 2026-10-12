import { Global, Module } from '@nestjs/common';
import { ProviderCredentials } from './provider-credentials.service.js';

@Global()
@Module({
  providers: [ProviderCredentials],
  exports: [ProviderCredentials],
})
export class ProvidersModule {}
