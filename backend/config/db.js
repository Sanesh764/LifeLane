import mongoose from 'mongoose';
import dns from 'dns';
dns.setServers(['1.1.1.1', '8.8.8.8']);
export const connectDB = async () => {
  const primaryUri = process.env.MONGODB_URI;
  const connectionOptions = {
    serverSelectionTimeoutMS: 8000,
  };
  try{
    const conn=await mongoose.connect(primaryUri, connectionOptions);
    console.log(`[MongoDB] Connected to database: ${conn.connection.host}/${conn.connection.name}`);
  }catch(primaryError){
    console.error(`[MongoDB Error] Primary connection failed: ${primaryError.message}`);
}
};

