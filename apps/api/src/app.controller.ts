import { Controller, Get, Res, Logger } from '@nestjs/common';
import { Response } from 'express';
import * as path from 'path';
import * as fs from 'fs';

@Controller()
export class AppController {
  private readonly logger = new Logger(AppController.name);
  private readonly webDistPath: string | null = null;

  constructor() {
    const candidates = [
      path.resolve(__dirname, 'public'),
      path.resolve(__dirname, '../public'),
      path.resolve(process.cwd(), 'public'),
      path.resolve(process.cwd(), 'apps/web/dist'),
      path.resolve(process.cwd(), '../web/dist'),
      path.resolve(__dirname, '../../apps/web/dist'),
      path.resolve(__dirname, '../../../apps/web/dist'),
      path.resolve(__dirname, '../web/dist'),
      path.resolve(__dirname, '../../web/dist'),
    ];
    this.webDistPath = candidates.find((p) => fs.existsSync(path.join(p, 'index.html'))) || null;
    if (this.webDistPath) {
      this.logger.log(`Frontend SPA successfully detected at: ${this.webDistPath}`);
    } else {
      this.logger.warn('Frontend SPA bundle not found. Serving API JSON metadata fallback.');
    }
  }

  @Get()
  serveRoot(@Res() res: Response) {
    if (this.webDistPath && fs.existsSync(path.join(this.webDistPath, 'index.html'))) {
      return res.sendFile(path.join(this.webDistPath, 'index.html'));
    }
    return res.json({
      name: 'NEXUS WAYS Backend API',
      status: 'online',
      version: '1.0.0',
      description: 'Unified Multimodal Supply Chain Operating System API',
      endpoints: {
        health: '/health',
        hubStats: '/platform/hub-stats',
        apiInfo: '/api/info',
      },
      timestamp: new Date().toISOString(),
    });
  }

  @Get('api/info')
  getApiInfo() {
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

  @Get(['roadways', 'railways', 'airways', 'seaways', 'admin'])
  serveModeRoot(@Res() res: Response) {
    if (this.webDistPath && fs.existsSync(path.join(this.webDistPath, 'index.html'))) {
      return res.sendFile(path.join(this.webDistPath, 'index.html'));
    }
    return res.redirect('/');
  }

  @Get([':mode/login', ':mode/dashboard', ':mode/register'])
  serveModeRoute(@Res() res: Response) {
    if (this.webDistPath && fs.existsSync(path.join(this.webDistPath, 'index.html'))) {
      return res.sendFile(path.join(this.webDistPath, 'index.html'));
    }
    return res.redirect('/');
  }
}
