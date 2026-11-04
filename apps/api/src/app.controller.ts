import { Controller, Get } from '@nestjs/common';

@Controller('api')
export class AppController {
  @Get('info')
  getRoot() {
    return {
      name: 'NEXUS WAYS Backend API',
      status: 'online',
      version: '1.0.0',
      description: 'Unified Multimodal Supply Chain Operating System API',
      endpoints: {
        health: '/health',
        hubStats: '/platform/hub-stats',
      },
      timestamp: new Date().toISOString(),
    };
  }
}

