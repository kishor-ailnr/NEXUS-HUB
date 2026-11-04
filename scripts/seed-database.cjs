/**
 * NEXUS WAYS - Safe Database Seeder
 * Populates standard demo organizations and operational transit entities.
 * Usage: node scripts/seed-database.cjs
 * Requires: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY set in process.env or apps/api/.env
 */

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

// Load environment variables from apps/api/.env if available
function loadEnv() {
  const envPath = path.resolve(__dirname, '..', 'apps', 'api', '.env');
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf('=');
      if (idx !== -1) {
        const key = trimmed.slice(0, idx).trim();
        const val = trimmed.slice(idx + 1).trim();
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  }
}

loadEnv();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Error: Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment or apps/api/.env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const DEMO_MODES = [
  {
    mode: 'roadways',
    orgName: 'Nexus Roadways Express Corp',
    state: 'Maharashtra',
    district: 'Mumbai City',
    address: 'Bandra-Kurla Complex, Bandra East, Mumbai, Maharashtra 400051',
    latitude: 19.0657,
    longitude: 72.8687,
    manager: { email: 'demo.roadways@nexusways.com', fullName: 'Vikram Malhotra (Roadways Director)' },
    operator: { email: 'driver.roadways@nexusways.com', fullName: 'Ramesh Singh (Lead Driver)' }
  },
  {
    mode: 'railways',
    orgName: 'Nexus Railway Logistics Corp',
    state: 'Delhi',
    district: 'New Delhi',
    address: 'Rail Bhavan, Raisina Road, New Delhi, Delhi 110001',
    latitude: 28.6186,
    longitude: 77.2131,
    manager: { email: 'demo.railways@nexusways.com', fullName: 'Priya Sharma (Railways Division Chief)' },
    operator: { email: 'pilot.railways@nexusways.com', fullName: 'Arjun Verma (Chief Loco Pilot)' }
  },
  {
    mode: 'airways',
    orgName: 'Nexus Airways SkyCargo Ltd',
    state: 'Karnataka',
    district: 'Bengaluru Urban',
    address: 'Kempegowda Int. Airport Cargo Terminal, Devanahalli, Bengaluru 560300',
    latitude: 13.1986,
    longitude: 77.7066,
    manager: { email: 'demo.airways@nexusways.com', fullName: 'Captain Rajeshwar Rao (Airways Fleet Commander)' },
    operator: { email: 'crew.airways@nexusways.com', fullName: 'Ananya Deshmukh (First Officer)' }
  },
  {
    mode: 'seaways',
    orgName: 'Nexus Maritime Oceanic Freight',
    state: 'Maharashtra',
    district: 'Mumbai City',
    address: 'Jawaharlal Nehru Port Trust Admin Building, Navi Mumbai, Maharashtra 400707',
    latitude: 18.9496,
    longitude: 72.9525,
    manager: { email: 'demo.seaways@nexusways.com', fullName: 'Commodore Sunil Merchant (Director of Maritime Operations)' },
    operator: { email: 'captain.seaways@nexusways.com', fullName: 'Captain Devendra Joshi (Master Mariner)' }
  }
];

const DEFAULT_PASSWORD = 'NexusPassword123!';

async function seed() {
  console.log('--- Initializing NEXUS WAYS Database Seeder ---');

  for (const item of DEMO_MODES) {
    console.log(`Processing mode: ${item.mode.toUpperCase()}`);

    // 1. Ensure Organization exists
    let { data: org } = await supabase
      .from('organizations')
      .select('*')
      .eq('name', item.orgName)
      .maybeSingle();

    if (!org) {
      const { data: newOrg, error: orgErr } = await supabase
        .from('organizations')
        .insert({
          name: item.orgName,
          mode: item.mode,
          state: item.state,
          district: item.district,
          address: item.address,
          latitude: item.latitude,
          longitude: item.longitude,
        })
        .select()
        .single();

      if (orgErr) {
        console.error(`  Error creating organization ${item.orgName}:`, orgErr.message);
        continue;
      }
      org = newOrg;
      console.log(`  Created Organization: ${org.name} (${org.id})`);
    } else {
      console.log(`  Found Existing Organization: ${org.name} (${org.id})`);
    }

    // 2. Ensure Users exist (Manager & Operator)
    for (const [roleKey, roleVal] of [['manager', item.manager], ['operator', item.operator]]) {
      const { data: userList } = await supabase.auth.admin.listUsers();
      let authUser = userList?.users?.find(u => u.email === roleVal.email);

      if (!authUser) {
        const { data: created, error: createErr } = await supabase.auth.admin.createUser({
          email: roleVal.email,
          password: DEFAULT_PASSWORD,
          email_confirm: true,
          user_metadata: {
            full_name: roleVal.fullName,
            role: roleKey,
            org_id: org.id,
            mode: item.mode,
          },
        });
        if (createErr) {
          console.error(`    Error creating auth user ${roleVal.email}:`, createErr.message);
          continue;
        }
        authUser = created.user;
        console.log(`    Created Auth User: ${roleVal.email} (Password: ${DEFAULT_PASSWORD})`);
      } else {
        console.log(`    Auth User exists: ${roleVal.email}`);
      }

      // Upsert into public.users
      if (authUser) {
        await supabase.from('users').upsert({
          id: authUser.id,
          org_id: org.id,
          email: roleVal.email,
          full_name: roleVal.fullName,
          role: roleKey,
        });
      }
    }
  }

  console.log('\n--- Seeding Complete! ---');
  console.log('Demo Credentials for all 4 modes:');
  console.log('Password: ' + DEFAULT_PASSWORD);
  console.log('Roadways: demo.roadways@nexusways.com');
  console.log('Railways: demo.railways@nexusways.com');
  console.log('Airways:  demo.airways@nexusways.com');
  console.log('Seaways:  demo.seaways@nexusways.com');
}

seed().catch(err => {
  console.error('Seed execution failed:', err);
  process.exit(1);
});

