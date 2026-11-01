import './env.js';
import mongoose from 'mongoose';
import dns from "dns";
dns.setServers(['1.1.1.1','8.8.8.8']);

// Direct replica set fallback for environments where Node c-ares SRV DNS query is refused
const DIRECT_FALLBACK_URI =process.env.MONGODB_URL2;

export const connectDB = async () => {
  const primaryUri = process.env.MONGODB_URI;
  if (!primaryUri) {
    console.warn('[MongoDB Warning] MONGODB_URI is not set. Database operations will fail.');
    return null;
  }

  const connectionOptions = {
    serverSelectionTimeoutMS: 5000,
  };

  try {
    const conn = await mongoose.connect(primaryUri, connectionOptions);
    console.log(`MongoDB  database connected successfully:`);
    return conn;
  } catch (primaryError) {
    console.warn(`[MongoDB Warning] Primary connection error (${primaryError.message}).`);
    if (DIRECT_FALLBACK_URI) {
      console.log('[MongoDB Notice] Attempting secondary fallback MongoDB connection...');
      try {
        const fallbackConn = await mongoose.connect(DIRECT_FALLBACK_URI, connectionOptions);
        console.log('[MongoDB Notice] Secondary MongoDB database connected successfully.');
        return fallbackConn;
      } catch (fallbackError) {
        console.error(`[MongoDB Error] Fallback connection also failed: ${fallbackError.message}`);
        return null;
      }
    }
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
