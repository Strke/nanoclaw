/**
 * Typed event bus — replaces the 8+ disparate registry patterns across
 * NanoClaw with a single, type-safe EventEmitter.
 *
 * Modules emit events and listen for lifecycle changes. The bus is injected
 * at startup (index.ts) so there's a single source of truth.
 */
import type Database from 'better-sqlite3';

import type { InboundEvent } from '../channels/adapter.js';
import type { ChannelDeliveryAdapter } from '../delivery.js';
import type { Session, AgentGroup, MessagingGroup } from '../types.js';

// ── Event type map ──
export interface AppEvents {
  // Lifecycle
  'app:starting': void;
  'app:started': void;
  'app:shutting-down': { signal: string };
  'app:shutdown': void;

  // Message flow
  'message:inbound': { event: InboundEvent };
  'message:routed': { sessionId: string; agentGroupId: string; engaged: boolean };
  'message:dropped': { reason: string; event: InboundEvent; messagingGroupId: string | null };
  'message:delivered': { messageId: string; sessionId: string; channelType: string };
  'message:failed': { messageId: string; sessionId: string; attempts: number; error: unknown };

  // Container
  'container:spawning': { sessionId: string; agentGroup: AgentGroup };
  'container:running': { sessionId: string; containerName: string };
  'container:stopped': { sessionId: string; code: number | null; containerName: string };
  'container:killed': { sessionId: string; reason: string; containerName: string };
  'container:error': { sessionId: string; error: unknown };

  // Session
  'session:created': { session: Session };
  'session:typing-start': { sessionId: string; agentGroupId: string };
  'session:typing-stop': { sessionId: string };

  // Delivery
  'delivery:adapter-ready': { adapter: ChannelDeliveryAdapter };
  'delivery:system-action': { action: string; sessionId: string; content: Record<string, unknown> };
  'delivery:poll-error': { poll: 'active' | 'sweep'; error: unknown };

  // Container config
  'delivery-action:register': { action: string };

  // Approvals
  'approval:request': { approvalId: string; action: string; agentGroupId: string | null };
  'approval:resolved': { approvalId: string; action: string; decision: string };

  // Channels
  'channel:registered': { channelType: string };

  // Response
  'response:unclaimed': { questionId: string; value: string };

  // DB
  'db:migration-applied': { name: string };
  'db:session-db-opened': { agentGroupId: string; sessionId: string; db: Database.Database };
}

/**
 * EventEmitter facade with typed events.
 */
export class EventBus {
  private listeners = new Map<string, Set<(...args: unknown[]) => void>>();

  /** Emit an event. Payload is void for events without data. */
  emit<K extends keyof AppEvents>(_event: K, payload?: AppEvents[K]): void {
    const handlers = this.listeners.get(_event);
    if (!handlers) return;
    for (const fn of handlers) {
      try {
        fn(payload);
      } catch (err) {
        // Never let a listener crash the entire bus
        console.error(`[bus] listener threw for event "${_event}"`, err);
      }
    }
  }

  /** Register a persistent listener. */
  on<K extends keyof AppEvents>(event: K, handler: (payload: AppEvents[K]) => void): void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(handler as (...args: unknown[]) => void);
  }

  /** Register a one-time listener. */
  once<K extends keyof AppEvents>(event: K, handler: (payload: AppEvents[K]) => void): void {
    const wrapped = (payload: AppEvents[K]) => {
      this.off(event, wrapped);
      handler(payload);
    };
    this.on(event, wrapped);
  }

  /** Remove a specific listener. */
  off<K extends keyof AppEvents>(event: K, handler: (payload: AppEvents[K]) => void): void {
    const set = this.listeners.get(event);
    if (set) set.delete(handler as (...args: unknown[]) => void);
  }

  /** Remove all listeners for an event (or all events if no key given). */
  removeAllListeners(event?: keyof AppEvents): void {
    if (event) {
      this.listeners.delete(event);
    } else {
      this.listeners.clear();
    }
  }

  /** Number of listeners for an event. */
  listenerCount(event: keyof AppEvents): number {
    return this.listeners.get(event)?.size ?? 0;
  }
}

/**
 * Global singleton — modules that import directly get the same instance.
 * For testability, create fresh instances and inject them.
 */
let globalBus: EventBus | null = null;

export function getBus(): EventBus {
  if (!globalBus) globalBus = new EventBus();
  return globalBus;
}

export function setBus(bus: EventBus): void {
  globalBus = bus;
}
