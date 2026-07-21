import { Controller, Get } from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator';

interface HealthStatus {
  status: 'ok';
  service: 'ocm-api';
  timestamp: string;
}

@Controller('health')
export class HealthController {
  @Public()
  @Get()
  check(): HealthStatus {
    return {
      status: 'ok',
      service: 'ocm-api',
      timestamp: new Date().toISOString(),
    };
  }
}
