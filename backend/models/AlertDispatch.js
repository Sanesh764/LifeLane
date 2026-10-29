import mongoose from 'mongoose';

const alertDispatchSchema = new mongoose.Schema(
  {
    tripId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AmbulanceTrip',
      required: true,
      index: true,
    },
    subscriptionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PushSubscription',
      required: true,
      index: true,
    },
    endpointHash: {
      type: String,
      required: true,
      index: true,
    },
    alertTier: {
      type: String,
      enum: ['OUTER', 'NEAR', 'ENDED'],
      required: true,
    },
    distanceMeters: {
      type: Number,
      default: null,
    },
    status: {
      type: String,
      enum: ['ACCEPTED', 'FAILED', 'EXPIRED', 'SUPPRESSED'],
      required: true,
    },
    attemptCount: {
      type: Number,
      default: 1,
    },
    errorDetails: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    ambulanceLocation: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point',
      },
      coordinates: {
        type: [Number],
      },
    },
    sentAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for audit and rate-limiting lookups
alertDispatchSchema.index({ tripId: 1, subscriptionId: 1, sentAt: -1 });
alertDispatchSchema.index({ endpointHash: 1, sentAt: -1 });

export const AlertDispatch = mongoose.model('AlertDispatch', alertDispatchSchema);
