/**
 * Local development configuration.
 *
 * :4000 is where the .NET backend serves (docs/RUNNING.md in the backend repo).
 * Start it before `npm start` here, or every request answers with a connection
 * refusal that looks like an auth failure in the UI.
 */
export const environment = {
  production: false,
  apiBaseUrl: 'http://localhost:4000',
} as const;
