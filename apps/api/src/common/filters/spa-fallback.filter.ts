import {
  ExceptionFilter,
  Catch,
  NotFoundException,
  ArgumentsHost,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import * as path from 'path';
import * as fs from 'fs';

@Catch(NotFoundException)
export class SpaFallbackFilter implements ExceptionFilter {
  private readonly logger = new Logger(SpaFallbackFilter.name);
  private readonly webDistPath: string | null = null;
  private readonly apiPrefixes = [
    '/api',
    '/auth',
    '/health',
    '/ai',
    '/trips',
    '/vehicles',
    '/drivers',
    '/geofences',
    '/convoys',
    '/dashboard',
    '/notifications',
    '/routing',
    '/geocoding',
    '/stations',
    '/trains',
    '/locomotives',
    '/rakes',
    '/loco-pilots',
    '/train-movements',
    '/airports',
    '/aircraft',
    '/flight-crew',
    '/flights',
    '/flight-movements',
    '/platform',
    '/vessels',
    '/ports',
    '/sea-crew',
    '/voyages',
    '/voyage-movements',
    '/sea-convoys',
    '/socket.io',
  ];

  constructor() {
    const candidates = [
      path.resolve(__dirname, 'public'),
      path.resolve(__dirname, '../public'),
      path.resolve(__dirname, '../../public'),
      path.resolve(process.cwd(), 'public'),
      path.resolve(process.cwd(), 'apps/web/dist'),
      path.resolve(process.cwd(), '../web/dist'),
      path.resolve(__dirname, '../../../apps/web/dist'),
      path.resolve(__dirname, '../../apps/web/dist'),
      path.resolve(__dirname, '../web/dist'),
      path.resolve(__dirname, '../../web/dist'),
    ];
    this.webDistPath = candidates.find((p) => fs.existsSync(path.join(p, 'index.html'))) || null;
  }

  catch(exception: NotFoundException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const url = request.url || '';

    // If it's a GET request and not targeting an API endpoint, serve index.html for SPA routing
    const isApi = this.apiPrefixes.some((p) => url.startsWith(p));
    if (request.method === 'GET' && !isApi && this.webDistPath) {
      const indexPath = path.join(this.webDistPath, 'index.html');
      if (fs.existsSync(indexPath)) {
        return response.sendFile(indexPath);
      }
    }

    const status = exception.getStatus ? exception.getStatus() : HttpStatus.NOT_FOUND;
    return response.status(status).json({
      statusCode: status,
      error: 'Not Found',
      message: `Cannot ${request.method} ${request.url}`,
    });
  }
}
