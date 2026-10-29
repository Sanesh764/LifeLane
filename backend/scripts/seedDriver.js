import 'dotenv/config';
import { connectDB, disconnectDB } from '../config/db.js';
import { env } from '../config/env.js';
import { User } from '../models/User.js';

/**
 * Controlled Initial Authorized Driver Provisioning Script
 * Reads credentials from environment variables without exposing secrets.
 */
async function seedDriver() {
  console.log('[Seed] Starting initial authorized driver provisioning...');

  const conn = await connectDB();
  if (!conn) {
    console.error('[Seed Error] Could not connect to database. Aborting.');
    process.exit(1);
  }

  const { email, password, name, callSign, vehicleNumber, hospitalBase } = env.INITIAL_DRIVER;

  if (!email || !password) {
    console.error('[Seed Error] INITIAL_DRIVER_EMAIL and INITIAL_DRIVER_PASSWORD must be configured.');
    await disconnectDB();
    process.exit(1);
  }

  const normalizedEmail = email.trim().toLowerCase();

  try {
    const existing = await User.findOne({ email: normalizedEmail });
    if (existing) {
      console.log(`[Seed Notice] Driver account already exists for ${normalizedEmail}. Existing account was NOT overwritten.`);
      await disconnectDB();
      process.exit(0);
    }

    const passwordHash = await User.hashPassword(password);

    const driver = new User({
      name: name || 'Authorized Driver',
      email: normalizedEmail,
      passwordHash,
      role: 'AMBULANCE_DRIVER',
      status: 'active',
      driverVerificationStatus: 'VERIFIED',
      assignedUnit: {
        callSign: callSign || 'Patna Unit 108 — Alpha',
        vehicleNumber: vehicleNumber || 'BR-01-EA-108',
        hospitalBase: hospitalBase || 'PMCH Emergency Trauma Center',
      },
    });

    await driver.save();
    console.log(`[Seed Success] Initial authorized driver provisioned successfully for ${normalizedEmail}.`);
    console.log(`[Seed Details] Role: ${driver.role}, Status: ${driver.status}, Verification: ${driver.driverVerificationStatus}`);
  } catch (err) {
    console.error(`[Seed Error] Failed to provision driver: ${err.message}`);
    await disconnectDB();
    process.exit(1);
  }

  await disconnectDB();
  process.exit(0);
}

seedDriver();
