import mongoose from 'mongoose';
import crypto from 'crypto';

export const hashEndpoint = (endpoint) => {
  if (!endpoint || typeof endpoint !== 'string') {
    throw new Error('Valid endpoint string is required for hashing.');
  }
  return crypto.createHash('sha256').update(endpoint.trim()).digest('hex');
};

const pointSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point',
      required: true,
    },
    coordinates: {
      type: [Number], // [longitude, latitude]
      required: true,
      validate: {
        validator: function (coords) {
          if (!Array.isArray(coords) || coords.length !== 2) return false;
          const [lng, lat] = coords;
          return (
            Number.isFinite(lng) &&
            Number.isFinite(lat) &&
            lng >= -180 &&
            lng <= 180 &&
            lat >= -90 &&
            lat <= 90
          );
        },
        message: 'Invalid GeoJSON Point coordinates: [longitude (-180..180), latitude (-90..90)] required.',
      },
    },
  },
  { _id: false }
);

const pushSubscriptionSchema = new mongoose.Schema(
  {
    endpoint: {
      type: String,
      required: [true, 'Push subscription endpoint is required.'],
      trim: true,
    },
    endpointHash: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },
    keys: {
      p256dh: {
        type: String,
        required: [true, 'p256dh encryption key is required.'],
        trim: true,
      },
      auth: {
        type: String,
        required: [true, 'auth authentication secret is required.'],
        trim: true,
      },
    },
    notificationConsent: {
      type: Boolean,
      required: [true, 'Notification consent status is required.'],
      default: false,
      index: true,
    },
    locationConsent: {
      type: Boolean,
      required: [true, 'Location consent status is required.'],
      default: false,
      index: true,
    },
    location: {
      type: pointSchema,
      required: false,
    },
    locationAccuracyMeters: {
      type: Number,
      min: [0, 'Accuracy cannot be negative.'],
      default: null,
    },
    lastLocationCapturedAt: {
      type: Date,
      default: null,
      index: true,
    },
    lastLocationReceivedAt: {
      type: Date,
      default: null,
    },
    status: {
      type: String,
      enum: ['ACTIVE', 'DISABLED', 'EXPIRED'],
      default: 'ACTIVE',
      index: true,
    },
    lastNotifiedAt: {
      type: Date,
      default: null,
    },
    lastNotifiedTripId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AmbulanceTrip',
      default: null,
    },
    lastAlertTier: {
      type: String,
      enum: ['OUTER', 'NEAR', null],
      default: null,
    },
    deviceType: {
      type: String,
      enum: ['mobile', 'desktop', 'tablet', 'unknown'],
      default: 'unknown',
    },
    userAgent: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Geospatial 2dsphere index for proximity queries
pushSubscriptionSchema.index({ location: '2dsphere' });
// Compound index for active eligible targeting queries
pushSubscriptionSchema.index({
  status: 1,
  notificationConsent: 1,
  locationConsent: 1,
  lastLocationCapturedAt: -1,
});

// Pre-save hook: compute endpointHash if not present or endpoint modified
pushSubscriptionSchema.pre('save', function () {
  if (this.isModified('endpoint') || !this.endpointHash) {
    this.endpointHash = hashEndpoint(this.endpoint);
  }
});

// Safe toJSON transform (never leak keys or full endpoint)
pushSubscriptionSchema.set('toJSON', {
  transform: (doc, ret) => {
    delete ret.__v;
    delete ret.endpoint;
    delete ret.keys;
    ret.id = ret._id.toString();
    return ret;
  },
});

export const PushSubscription = mongoose.model('PushSubscription', pushSubscriptionSchema);
