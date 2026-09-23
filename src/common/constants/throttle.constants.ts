export const BROWSE_THROTTLE = {
  default: {
    limit: Number(process.env.THROTTLE_PUBLIC_LIMIT ?? 120),
    ttl: Number(process.env.THROTTLE_PUBLIC_TTL ?? 60) * 1000,
  },
};
