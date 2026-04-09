/**
 * Event Stream Manager
 *
 * Manages gRPC streaming subscriptions and WebSocket fan-out.
 * Handles reconnection, offset tracking, and filter updates.
 */

import type { WebSocket } from '@fastify/websocket';
import type { CantonClient } from '../canton/client.js';
import type { LedgerUpdate, EventStreamFilter, TemplateId } from '../types.js';
import type { CacheService } from './cache.js';

interface StreamSubscription {
  id: string;
  client: CantonClient;
  filter: EventStreamFilter;
  parties: string[];
  lastOffset: string;
  websockets: Set<WebSocket>;
  cancel: (() => void) | null;
  isActive: boolean;
}

// Active stream subscriptions indexed by subscription ID
const subscriptions = new Map<string, StreamSubscription>();

/**
 * Create or join an event stream subscription.
 *
 * @param subscriptionId - Unique ID for the subscription (e.g., session ID).
 * @param client - Canton client for gRPC streaming.
 * @param ws - WebSocket connection to forward events to.
 * @param filter - Initial event stream filter.
 * @param parties - Parties to subscribe for.
 * @param startOffset - Offset to start streaming from.
 * @param cache - Cache service for offset persistence.
 */
export function subscribeToEventStream(
  subscriptionId: string,
  client: CantonClient,
  ws: WebSocket,
  filter: EventStreamFilter,
  parties: string[],
  startOffset: string,
  cache: CacheService,
): void {
  let sub = subscriptions.get(subscriptionId);

  if (sub) {
    // Join existing subscription
    sub.websockets.add(ws);
    setupWebSocketHandlers(ws, sub, cache);
    return;
  }

  // Create new subscription
  sub = {
    id: subscriptionId,
    client,
    filter,
    parties,
    lastOffset: startOffset,
    websockets: new Set([ws]),
    cancel: null,
    isActive: false,
  };

  subscriptions.set(subscriptionId, sub);
  setupWebSocketHandlers(ws, sub, cache);
  startStream(sub, cache);
}

/**
 * Update the filter for an active subscription.
 */
export function updateStreamFilter(
  subscriptionId: string,
  filter: EventStreamFilter,
  cache: CacheService,
): void {
  const sub = subscriptions.get(subscriptionId);
  if (!sub) return;

  sub.filter = filter;

  // Restart the stream with the new filter
  if (sub.cancel) {
    sub.cancel();
    sub.cancel = null;
  }

  startStream(sub, cache);
}

/**
 * Stop a subscription entirely.
 */
export function unsubscribeFromEventStream(subscriptionId: string): void {
  const sub = subscriptions.get(subscriptionId);
  if (!sub) return;

  if (sub.cancel) {
    sub.cancel();
  }

  for (const ws of sub.websockets) {
    try {
      ws.close(1000, 'Subscription ended');
    } catch {
      // WebSocket may already be closed
    }
  }

  sub.websockets.clear();
  sub.isActive = false;
  subscriptions.delete(subscriptionId);
}

/**
 * Stop ALL subscriptions belonging to a specific session.
 * Called when a session disconnects from Canton to prevent stale
 * stream reconnection attempts that would crash the process.
 *
 * Subscription IDs for a session are prefixed with `ws-{sessionId}-`.
 */
export function unsubscribeForSession(sessionId: string): void {
  const prefix = `ws-${sessionId}-`;
  for (const id of Array.from(subscriptions.keys())) {
    if (id.startsWith(prefix)) {
      unsubscribeFromEventStream(id);
    }
  }
}

/**
 * Stop ALL active subscriptions. Called on server shutdown.
 */
export function unsubscribeAll(): void {
  for (const id of Array.from(subscriptions.keys())) {
    unsubscribeFromEventStream(id);
  }
}

/**
 * Get the count of active subscriptions.
 */
export function getActiveSubscriptionCount(): number {
  return subscriptions.size;
}

// ============================================================
// Internal Stream Management
// ============================================================

function startStream(sub: StreamSubscription, cache: CacheService): void {
  if (sub.isActive) return;

  // Safety check: don't start if the client is disconnected
  if (!sub.client.isConnected()) {
    unsubscribeFromEventStream(sub.id);
    return;
  }

  sub.isActive = true;

  const shape = sub.filter.transactionShape ?? 'LEDGER_EFFECTS';

  const { cancel } = sub.client.updateService.getUpdates(
    sub.lastOffset,
    sub.parties,
    shape,
    undefined, // No end offset — continuous stream
    sub.filter.templates,
    // onUpdate
    (update: LedgerUpdate) => {
      // Apply client-side filters
      if (!passesFilter(update, sub.filter)) return;

      // Track offset
      sub.lastOffset = update.offset;
      void cache.setLastOffset(sub.id, update.offset);

      // Fan out to all connected WebSockets
      const message = JSON.stringify({
        type: 'update',
        data: update,
      });

      for (const ws of sub.websockets) {
        try {
          if (ws.readyState === 1) { // OPEN
            ws.send(message);
          }
        } catch {
          // Remove broken WebSocket
          sub.websockets.delete(ws);
        }
      }

      // Clean up if no WebSockets remain
      if (sub.websockets.size === 0) {
        unsubscribeFromEventStream(sub.id);
      }
    },
    // onError
    (error: Error) => {
      const errorMessage = JSON.stringify({
        type: 'error',
        data: { message: error.message },
      });

      for (const ws of sub.websockets) {
        try {
          if (ws.readyState === 1) {
            ws.send(errorMessage);
          }
        } catch {
          sub.websockets.delete(ws);
        }
      }

      sub.isActive = false;

      // Attempt reconnection after a delay
      setTimeout(() => {
        if (subscriptions.has(sub.id) && sub.websockets.size > 0) {
          startStream(sub, cache);
        }
      }, 3000);
    },
    // onEnd
    () => {
      sub.isActive = false;

      // Notify clients that stream ended
      const endMessage = JSON.stringify({
        type: 'stream_end',
        data: { lastOffset: sub.lastOffset },
      });

      for (const ws of sub.websockets) {
        try {
          if (ws.readyState === 1) {
            ws.send(endMessage);
          }
        } catch {
          sub.websockets.delete(ws);
        }
      }
    },
  );

  sub.cancel = cancel;
}

function setupWebSocketHandlers(
  ws: WebSocket,
  sub: StreamSubscription,
  cache: CacheService,
): void {
  ws.on('message', (data: Buffer | string) => {
    try {
      const message = JSON.parse(typeof data === 'string' ? data : data.toString());

      if (message.type === 'filter_update' && message.filter) {
        // Client is updating the filter
        updateStreamFilter(sub.id, message.filter as EventStreamFilter, cache);
      }

      if (message.type === 'ping') {
        ws.send(JSON.stringify({ type: 'pong' }));
      }
    } catch {
      // Ignore malformed messages
    }
  });

  ws.on('close', () => {
    sub.websockets.delete(ws);

    if (sub.websockets.size === 0) {
      // No more clients — keep stream alive for a grace period
      setTimeout(() => {
        if (sub.websockets.size === 0) {
          unsubscribeFromEventStream(sub.id);
        }
      }, 10000);
    }
  });

  ws.on('error', () => {
    sub.websockets.delete(ws);
  });

  // Send current state to the new WebSocket
  ws.send(JSON.stringify({
    type: 'subscribed',
    data: {
      subscriptionId: sub.id,
      lastOffset: sub.lastOffset,
      filter: sub.filter,
      parties: sub.parties,
    },
  }));
}

/**
 * Apply client-side filtering to an update.
 * Server-side filtering is done via TransactionFilter in gRPC.
 * This provides additional granularity (e.g., event type filtering).
 */
function passesFilter(update: LedgerUpdate, filter: EventStreamFilter): boolean {
  // Event type filter
  if (filter.eventTypes && filter.eventTypes.length > 0) {
    if (update.events.length > 0) {
      const hasMatchingEvent = update.events.some((event) =>
        filter.eventTypes!.includes(event.eventType),
      );
      if (!hasMatchingEvent) return false;
    }
  }

  return true;
}
