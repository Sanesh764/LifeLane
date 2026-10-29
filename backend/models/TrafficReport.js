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

const TrafficReportSchema = new mongoose.Schema(
  {
    reportType: {
      type: String,
      enum: {
        values: ['CLEAR', 'TRAFFIC_HIGH', 'ROAD_BLOCKED', 'CANNOT_ASSESS'],
        message: 'reportType must be CLEAR, TRAFFIC_HIGH, ROAD_BLOCKED, or CANNOT_ASSESS',
      },
      required: [true, 'reportType is required'],
      uppercase: true,
      index: true,
    },
    roadSegment: {
      type: String,
      required: [true, 'roadSegment name is required'],
      trim: true,
      maxlength: [200, 'roadSegment name cannot exceed 200 characters'],
      index: true,
    },
    locationDescription: {
      type: String,
      trim: true,
      maxlength: [500, 'Description cannot exceed 500 characters'],
      default: '',
    },
    location: {
      type: PointSchema,
      default: null,
    },
    locationAccuracyMeters: {
      type: Number,
      min: [0, 'Accuracy cannot be negative'],
      default: null,
    },
    locationStatus: {
      type: String,
      enum: ['LOCATION_MATCHED', 'LOCATION_UNVERIFIED'],
      default: 'LOCATION_MATCHED',
    },
    source: {
      type: String,
      trim: true,
      default: 'Participating Road User',
    },
    reporterId: {
      type: String,
      trim: true,
      default: null,
      index: true,
    },
    status: {
      type: String,
      enum: ['ACTIVE', 'RESOLVED', 'EXPIRED'],
      default: 'ACTIVE',
      index: true,
    },
    verifiedCount: {
      type: Number,
      default: 1,
      min: 1,
    },
    capturedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: (doc, ret) => {
        ret.id = ret._id ? ret._id.toString() : ret.id;
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
  }
);

// 2dsphere index for geospatial proximity search
TrafficReportSchema.index({ location: '2dsphere' });

// Compound index for active reports ordered by newest
TrafficReportSchema.index({ status: 1, capturedAt: -1 });

export const TrafficReport = mongoose.model('TrafficReport', TrafficReportSchema);
