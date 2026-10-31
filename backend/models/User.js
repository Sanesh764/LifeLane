import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const UserSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'User name is required'],
      trim: true,
      maxlength: [100, 'Name cannot exceed 100 characters'],
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email address'],
      index: true,
    },
    passwordHash: {
      type: String,
      required: [true, 'Password hash is required'],
      select: false,
    },
    role: {
      type: String,
      enum: {
        values: ['AMBULANCE_DRIVER', 'PUBLIC_USER', 'ROAD_USER', 'ADMIN'],
        message: 'Role must be AMBULANCE_DRIVER, PUBLIC_USER, ROAD_USER, or ADMIN',
      },
      default: 'PUBLIC_USER',
      uppercase: true,
      index: true,
    },
    status: {
      type: String,
      enum: {
        values: ['active', 'pending', 'disabled', 'suspended'],
        message: 'Status must be active, pending, disabled, or suspended',
      },
      default: function () {
        return this.role === 'AMBULANCE_DRIVER' ? 'pending' : 'active';
      },
      lowercase: true,
      index: true,
    },
    driverVerificationStatus: {
      type: String,
      enum: {
        values: ['VERIFIED', 'PENDING', 'REJECTED', 'NOT_REQUIRED'],
        message: 'Invalid driver verification status',
      },
      default: function () {
        return this.role === 'AMBULANCE_DRIVER' ? 'PENDING' : 'NOT_REQUIRED';
      },
      uppercase: true,
    },
    assignedUnit: {
      callSign: { type: String, trim: true, default: null },
      vehicleNumber: { type: String, trim: true, default: null },
      hospitalBase: { type: String, trim: true, default: null },
      unitId: { type: String, trim: true, default: null },
    },
  },
  {
    timestamps: true,
    bufferCommands: false,
    toJSON: {
      transform: function (doc, ret) {
        delete ret.passwordHash;
        delete ret.__v;
        ret.id = ret._id.toString();
        return ret;
      },
    },
    toObject: {
      transform: function (doc, ret) {
        delete ret.passwordHash;
        delete ret.__v;
        ret.id = ret._id.toString();
        return ret;
      },
    },
  }
);

// Method to verify password against bcrypt hash
UserSchema.methods.comparePassword = async function (plainPassword) {
  if (!plainPassword || !this.passwordHash) {
    return false;
  }
  return bcrypt.compare(plainPassword, this.passwordHash);
};

// Static helper to generate a bcrypt hash
UserSchema.statics.hashPassword = async function (plainPassword) {
  if (!plainPassword || typeof plainPassword !== 'string') {
    throw new Error('Valid password string required for hashing');
  }
  const saltRounds = 10;
  return bcrypt.hash(plainPassword, saltRounds);
};

export const User = mongoose.model('User', UserSchema);
