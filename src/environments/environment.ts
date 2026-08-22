/**
 * Production configuration.
 *
 * `apiBaseUrl` has no default and no fallback on purpose. A build that reaches
 * production without one should fail loudly at startup rather than quietly
 * point at localhost — the mobile app shipped `.env.production` aimed at
 * `api.example.com` for months precisely because a plausible-looking default
 * was there to be ignored.
 */
export const environment = {
  production: true,
  apiBaseUrl: 'https://kitto-app.uaenorth.cloudapp.azure.com',
} as const;
