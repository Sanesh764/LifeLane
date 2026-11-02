import mongoose from 'mongoose';

/**
 * OAuthExchangeTicket Schema
 *
 * Provides safe, multi-instance and restart-resilient transfer of authenticated
 * sessions from the Google OAuth redirect callback to the frontend single-page application.
 *
 * Security Invariants:
 * - Single-use only: atomically deleted upon consumption via findOneAndDelete().
 * - Short TTL (60 seconds): automatically purged by MongoDB TTL index if abandoned.
 * - Restricts credentials from ever appearing in URL query parameters or browser history.
 */
const OAuthExchangeTicketSchema = new mongoose.Schema(
  {
    ticket: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    user: {
      id: { type: String, required: true },
      name: { type: String, required: true },
      email: { type: String, required: true },
      role: {
        type: String,
        enum: ['PUBLIC_USER', 'ROAD_USER'],
        required: true,
      },
      status: { type: String, required: true },
      avatar: { type: String, default: null },
    },
    accessToken: {
      type: String,
      required: true,
    },
    tokenType: {
      type: String,
      default: 'Bearer',
    },
    expiresIn: {
      type: Number,
      default: 3600,
    },
    expiresAt: {
      type: Date,
      required: true,
      default: () => new Date(Date.now() + 60 * 1000), // 60 seconds TTL
      index: { expires: 0 },
    },
  },
  {
    timestamps: true,
  }
);

/**
 * Atomically consume a ticket.
 * If valid and unexpired, deletes the ticket document immediately and returns payload.
 * If invalid, already consumed, or expired, returns null.
 */
OAuthExchangeTicketSchema.statics.consume = async function (ticketString) {
  if (!ticketString || typeof ticketString !== 'string') {
    return null;
  }

  const now = new Date();
  const ticketDoc = await this.findOneAndDelete({
    ticket: ticketString.trim(),
    expiresAt: { $gt: now },
  });

  return ticketDoc || null;
};

export const OAuthExchangeTicket = mongoose.model(
  'OAuthExchangeTicket',
  OAuthExchangeTicketSchema
);
