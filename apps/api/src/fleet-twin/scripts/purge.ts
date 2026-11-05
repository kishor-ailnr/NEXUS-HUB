import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../app.module';
import { FleetTwinService } from '../fleet-twin.service';

async function bootstrap() {
  console.log('\n======================================================');
  console.log('🧹 NEXUS WAYS - Fleet Digital Twin Mock Purge Utility');
  console.log('======================================================\n');

  try {
    const app = await NestFactory.createApplicationContext(AppModule, {
      logger: ['error', 'warn'],
    });

    const fleetTwinService = app.get(FleetTwinService);
    const result = await fleetTwinService.purgeData();

    console.log(`✅ ${result.message}`);
    console.log('🗑️  All mock tables and in-memory caches have been cleanly wiped.\n');

    await app.close();
    process.exit(0);
  } catch (error) {
    console.error('❌ Purge failed:', error);
    process.exit(1);
  }
}

bootstrap();

