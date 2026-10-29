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

const AmbulanceTripSchema = new mongoose.Schema(
  {
    driverId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Authorized driver ID is required'],
      index: true,
    },
    status: {
      type: String,
      enum: {
        values: ['ACTIVE', 'COMPLETED', 'CANCELLED'],
        message: 'Status must be ACTIVE, COMPLETED, or CANCELLED',
      },
      default: 'ACTIVE',
      uppercase: true,
      index: true,
    },
    assignedUnit: {
      callSign: { type: String, trim: true, default: null },
      vehicleNumber: { type: String, trim: true, default: null },
      hospitalBase: { type: String, trim: true, default: null },
      unitId: { type: String, trim: true, default: null },
    },
    origin: {
      type: PointSchema,
      required: [true, 'Trip origin coordinates are required'],
    },
    destination: {
      label: {
        type: String,
        required: [true, 'Destination label is required'],
        trim: true,
        maxlength: [150, 'Destination label cannot exceed 150 characters'],
      },
      location: {
        type: PointSchema,
        required: [true, 'Destination location is required'],
      },
    },
    currentLocation: {
      type: PointSchema,
      required: [true, 'Current ambulance location is required'],
    },
    locationAccuracyMeters: {
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
    lastLocationCapturedAt: {
      type: Date,
      default: null,
    },
    lastLocationReceivedAt: {
      type: Date,
      default: Date.now,
    },
    startedAt: {
      type: Date,
      default: Date.now,
    },
    endedAt: {
      type: Date,
      default: null,
    },
    endReason: {
      type: String,
      enum: ['ARRIVED', 'CANCELLED', 'OTHER', null],
      default: null,
      uppercase: true,
    },
    currentRoute: {
      status: {
        type: String,
        enum: ['AVAILABLE', 'UNAVAILABLE', 'STALE'],
        default: 'UNAVAILABLE',
        uppercase: true,
      },
      reason: { type: String, default: 'ROUTING_PROVIDER_PENDING' },
      provider: { type: String, default: null },
      etaSeconds: { type: Number, default: null },
      distanceMeters: { type: Number, default: null },
      retrievedAt: { type: Date, default: null },
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
    toObject: {
      transform: function (doc, ret) {
        ret.id = ret._id.toString();
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
  }
);

// Geospatial indexes
AmbulanceTripSchema.index({ currentLocation: '2dsphere' });
AmbulanceTripSchema.index({ 'destination.location': '2dsphere' });

// Compound query index
AmbulanceTripSchema.index({ driverId: 1, status: 1 });
AmbulanceTripSchema.index({ status: 1, updatedAt: -1 });

// Database-enforced partial unique constraint: A driver can have at most ONE ACTIVE trip
AmbulanceTripSchema.index(
  { driverId: 1, status: 1 },
  {
    unique: true,
    partialFilterExpression: { status: 'ACTIVE' },
    name: 'unique_active_trip_per_driver',
  }
);

export const AmbulanceTrip = mongoose.model('AmbulanceTrip', AmbulanceTripSchema);
