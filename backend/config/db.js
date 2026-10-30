import './env.js';
import mongoose from 'mongoose';

// Direct replica set fallback for environments where Node c-ares SRV DNS query is refused
const DIRECT_FALLBACK_URI =
  'mongodb://sanesh847_db_user:z5GYnVhl7hh9MA9e@ac-nr7zhwh-shard-00-00.gqtcnmj.mongodb.net:27017,ac-nr7zhwh-shard-00-01.gqtcnmj.mongodb.net:27017,ac-nr7zhwh-shard-00-02.gqtcnmj.mongodb.net:27017/test?ssl=true&authSource=admin&retryWrites=true&w=majority';

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
    console.log(`[MongoDB] Connected to database: ${conn.connection.host}/${conn.connection.name}`);
    return conn;
  } catch (primaryError) {
    console.warn(`[MongoDB Warning] Primary SRV connection failed (${primaryError.message}). Attempting direct replica set fallback...`);
    try {
      const fallbackConn = await mongoose.connect(DIRECT_FALLBACK_URI, connectionOptions);
      console.log(`[MongoDB] Connected via direct replica set: ${fallbackConn.connection.host}/${fallbackConn.connection.name}`);
      return fallbackConn;
    } catch (fallbackError) {
      console.error(`[MongoDB Error] Fallback connection also failed: ${fallbackError.message}`);
      return null;
    }
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
