import mongoose from 'mongoose';
import dns from 'dns';

// Configure DNS servers for MongoDB Atlas SRV resolution
try {
  dns.setServers(['1.1.1.1', '8.8.8.8']);
} catch {
  // Ignore DNS config errors if running in restricted environments
}

export const connectDB = async () => {
  const primaryUri = process.env.MONGODB_URI;
  if (!primaryUri) {
    console.warn('[MongoDB Warning] MONGODB_URI is not set. Database operations will fail.');
    return null;
  }

  const connectionOptions = {
    serverSelectionTimeoutMS: 8000,
  };

  try {
    const conn = await mongoose.connect(primaryUri, connectionOptions);
    console.log(`[MongoDB] Connected to database: ${conn.connection.host}/${conn.connection.name}`);
    return conn;
  } catch (primaryError) {
    console.error(`[MongoDB Error] Primary connection failed: ${primaryError.message}`);
    return null;
  }
};

export const isDbConnected = () => {
  return mongoose.connection.readyState === 1;
};

export const disconnectDB = async () => {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
};
