class ConfigService {
  get(key, defaultValue) {
    return process.env[key] ?? defaultValue;
  }
  getOrThrow(key) {
    const v = process.env[key];
    if (!v) throw new Error(`Missing env ${key}`);
    return v;
  }
}

module.exports = { ConfigService };