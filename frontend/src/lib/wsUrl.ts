/**
 * Utility to construct WebSocket URLs that work both locally (through Vite proxy)
 * and remotely (direct to backend).
 *
 * When VITE_WS_BACKEND_PORT is set, WebSocket connections go directly to the backend.
 * This is needed for remote access because Vite's WebSocket proxy doesn't work well
 * with remote clients.
 *
 * Usage:
 *   const wsUrl = getWsUrl('/api/tasks/stream/ws?project_id=123');
 */

const WS_BACKEND_PORT = import.meta.env.VITE_WS_BACKEND_PORT;

/**
 * Check if we're accessing from a non-localhost origin
 */
function isRemoteAccess(): boolean {
  const hostname = window.location.hostname;
  return !['localhost', '127.0.0.1', '0.0.0.0'].includes(hostname) &&
         !hostname.endsWith('.local');
}

/**
 * Get WebSocket URL for an API endpoint.
 *
 * @param path - API path starting with /api/... (e.g., '/api/tasks/stream/ws')
 * @returns Full WebSocket URL
 */
export function getWsUrl(path: string): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const hostname = window.location.hostname;

  // If backend port is configured and we're on remote access, use direct backend URL
  if (WS_BACKEND_PORT && isRemoteAccess()) {
    return `${protocol}//${hostname}:${WS_BACKEND_PORT}${path}`;
  }

  // Otherwise use relative URL (works through Vite proxy on localhost)
  return `${protocol}//${window.location.host}${path}`;
}

/**
 * Get WebSocket base URL (without path) for cases where you need to construct
 * the URL differently.
 */
export function getWsBaseUrl(): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const hostname = window.location.hostname;

  if (WS_BACKEND_PORT && isRemoteAccess()) {
    return `${protocol}//${hostname}:${WS_BACKEND_PORT}`;
  }

  return `${protocol}//${window.location.host}`;
}
