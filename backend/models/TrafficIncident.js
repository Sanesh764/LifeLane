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

const AdvisorySchema = new mongoose.Schema(
  {
    summary: { type: String, required: true },
    incidentType: { type: String, default: null },
    locationLabel: { type: String, default: null },
    reportCount: { type: Number, default: 1 },
    confidenceStatus: {
      type: String,
      enum: ['UNVERIFIED', 'DEVELOPING', 'CORROBORATED'],
      default: 'UNVERIFIED',
    },
    recommendedAction: { type: String, default: null },
    verificationNote: {
      type: String,
      default: 'Community-reported; not independently verified.',
    },
    summarySource: {
      type: String,
      enum: ['META_AI', 'GROQ_AI', 'SYSTEM_FALLBACK'],
      required: true,
      default: 'SYSTEM_FALLBACK',
    },
    metaAiStatus: { type: String, default: null },
    metaModelUsed: { type: String, default: null },
    generatedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const TrafficIncidentSchema = new mongoose.Schema(
  {
    incidentType: {
      type: String,
      enum: ['ROAD_BLOCKED', 'TRAFFIC_HIGH', 'CLEAR', 'CANNOT_ASSESS'],
      required: true,
      index: true,
    },
    roadSegment: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    location: {
      type: PointSchema,
      required: true,
    },
    locationDescription: {
      type: String,
      trim: true,
      default: '',
    },
    reportIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'TrafficReport',
      },
    ],
    reporterIds: [
      {
        type: String,
        trim: true,
      },
    ],
    distinctReporterCount: {
      type: Number,
      required: true,
      default: 1,
      min: 1,
    },
    reportCount: {
      type: Number,
      required: true,
      default: 1,
      min: 1,
    },
    corroborationStatus: {
      type: String,
      enum: ['UNVERIFIED', 'DEVELOPING', 'CORROBORATED'],
      required: true,
      default: 'UNVERIFIED',
      index: true,
    },
    firstReportedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    latestReportedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    advisory: {
      type: AdvisorySchema,
      required: true,
    },
    status: {
      type: String,
      enum: ['ACTIVE', 'RESOLVED', 'EXPIRED'],
      default: 'ACTIVE',
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

// 2dsphere index for spatial proximity queries by emergency vehicles
TrafficIncidentSchema.index({ location: '2dsphere' });
TrafficIncidentSchema.index({ status: 1, latestReportedAt: -1 });

export const TrafficIncident = mongoose.model('TrafficIncident', TrafficIncidentSchema);
