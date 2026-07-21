import { Global, Module } from '@nestjs/common';
import { AppConfig, loadConfig } from './configuration';

/** Loads + validates configuration once and exposes {@link AppConfig}. */
@Global()
@Module({
  providers: [
    {
      provide: AppConfig,
      useFactory: (): AppConfig => loadConfig(process.env),
    },
  ],
  exports: [AppConfig],
})
export class ConfigModule {}
