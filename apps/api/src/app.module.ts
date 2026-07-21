import { existsSync } from 'node:fs';
import { DynamicModule, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ServeStaticModule } from '@nestjs/serve-static';
import { ConfigModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './auth/auth.module';
import { AdminsModule } from './admins/admins.module';
import { VpnModule } from './vpn/vpn.module';
import { HealthController } from './health/health.controller';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';

/**
 * Serve the built web console from the same process when `OCM_WEB_ROOT` points
 * at a real directory (production single-service mode). Disabled in dev, where
 * Vite serves the SPA and proxies `/api`.
 */
function staticModules(): DynamicModule[] {
  const webRoot = process.env.OCM_WEB_ROOT;
  if (!webRoot || !existsSync(webRoot)) return [];
  return [
    ServeStaticModule.forRoot({
      rootPath: webRoot,
      exclude: ['/api/(.*)'],
    }),
  ];
}

@Module({
  imports: [
    ConfigModule,
    ScheduleModule.forRoot(),
    DatabaseModule,
    AuthModule,
    AdminsModule,
    VpnModule,
    ...staticModules(),
  ],
  controllers: [HealthController],
  providers: [
    // Auth is enforced globally; opt out per-route with @Public().
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    // Every authenticated route additionally requires the ADMIN role.
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
