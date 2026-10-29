import mongoose from 'mongoose';

const PointSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point',
      required: true,
    },
    coordinates: {
      type: [Number],
      required: true,
      validate: {
        validator: function (coords) {
          return (
            Array.isArray(coords) &&
            coords.length === 2 &&
            Number.isFinite(coords[0]) &&
            Number.isFinite(coords[1]) &&
            coords[0] >= -180 &&
            coords[0] <= 180 &&
            coords[1] >= -90 &&
            coords[1] <= 90
          );
        },
        message: 'Coordinates must be [longitude, latitude] with valid geographic bounds.',
      },
    },
  },
  { _id: false }
);

const TripLocationHistorySchema = new mongoose.Schema(
  {
    tripId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AmbulanceTrip',
      required: [true, 'Trip ID is required'],
      index: true,
    },
    driverId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Driver ID is required'],
      index: true,
    },
    location: {
      type: PointSchema,
      required: [true, 'GPS Location coordinates are required'],
    },
    accuracyMeters: {
      type: Number,
      min: [0, 'Accuracy meters cannot be negative'],
      default: null,
    },
    headingDegrees: {
      type: Number,
      min: [0, 'Heading must be between 0 and 360 degrees'],
      max: [360, 'Heading must be between 0 and 360 degrees'],
      default: null,
    },
    speedMetersPerSecond: {
      type: Number,
      min: [0, 'Speed cannot be negative'],
      default: null,
    },
    capturedAt: {
      type: Date,
      default: null,
    },
    receivedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    timestamps: true,
    bufferCommands: false,
    toJSON: {
      transform: function (doc, ret) {
        ret.id = ret._id.toString();
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
  }
);

// Compound telemetry index for chronological replay
TripLocationHistorySchema.index({ tripId: 1, receivedAt: -1 });
TripLocationHistorySchema.index({ location: '2dsphere' });

export const TripLocationHistory = mongoose.model(
  'TripLocationHistory',
  TripLocationHistorySchema
);
