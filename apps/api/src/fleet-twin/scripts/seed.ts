import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../app.module';
import { FleetTwinService } from '../fleet-twin.service';

async function bootstrap() {
  console.log('\n======================================================');
  console.log('🚀 NEXUS WAYS - Fleet Digital Twin Idempotent Seeder');
  console.log('======================================================\n');

  try {
    const app = await NestFactory.createApplicationContext(AppModule, {
      logger: ['error', 'warn', 'log'],
    });

    const fleetTwinService = app.get(FleetTwinService);
    const result = await fleetTwinService.seedData();

    console.log('✅ Seed Completed Successfully:');
    console.log(`   Batch ID:    ${result.seeded_batch_id}`);
    console.log(`   Fleets:      ${result.counts.fleets}`);
    console.log(`   Drivers:     ${result.counts.drivers}`);
    console.log(`   Routes:      ${result.counts.routes}`);
    console.log(`   Checkpoints: ${result.counts.checkpoints}`);
    console.log(`   Vehicles:    ${result.counts.vehicles}`);
    console.log('\n🌟 Simulated Fleet Twin environment is live!\n');

    await app.close();
    process.exit(0);
  } catch (error) {
    console.error('❌ Seeding failed:', error);
    process.exit(1);
  }
}

bootstrap();

