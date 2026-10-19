import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import type { DockerEventItem } from "../../shared/types.js";
import { useAuth } from "../lib/auth-context.js";
import { WebSocketClient, type WsStatus } from "../lib/ws.js";

const MAX_SAVED_EVENTS = 50;

let sharedClient: WebSocketClient<DockerEventItem> | null = null;
let sharedStatus: WsStatus = "disconnected";
let sharedEvents: DockerEventItem[] = [];
let subscriberCount = 0;
let activeQueryClient: QueryClient | null = null;

const listeners = new Set<() => void>();
const invalidateTimers = new Map<string, ReturnType<typeof setTimeout>>();

function notifyListeners() {
  for (const listener of listeners) {
    listener();
  }
}

function scheduleInvalidate(queryKey: string[], delayMs = 600) {
  if (!activeQueryClient) return;
  const key = queryKey.join(":");
  if (invalidateTimers.has(key)) return;

  const timer = setTimeout(() => {
    invalidateTimers.delete(key);
    if (activeQueryClient) {
      void activeQueryClient.invalidateQueries({ queryKey });
    }
  }, delayMs);

  invalidateTimers.set(key, timer);
}

function isNoisyAction(action: string): boolean {
  return (
    action.startsWith("exec_") ||
    action === "top" ||
    action === "resize" ||
    action === "archive-path" ||
    action === "extract-to-dir" ||
    action === "copy" ||
    action === "health_status: healthy"
  );
}

function ensureSharedConnection() {
  if (sharedClient) return;

  sharedClient = new WebSocketClient<DockerEventItem>({
    url: "/ws/events",
    onStatusChange: (newStatus) => {
      sharedStatus = newStatus;
      notifyListeners();
    },
    onMessage: (event) => {
      if (!event?.type) return;
      const action = String(event.action || "");
      if (isNoisyAction(action)) return;

      sharedEvents = [event, ...sharedEvents.slice(0, MAX_SAVED_EVENTS - 1)];
      notifyListeners();

      // Debounce query invalidations to avoid request storms
      if (event.type === "container") {
        scheduleInvalidate(["containers"], 500);
        scheduleInvalidate(["systemInfo"], 2000);
        scheduleInvalidate(["system-info"], 2000);
        if (action === "create" || action === "destroy" || action === "prune") {
          scheduleInvalidate(["system-df"], 5000);
        }
      } else if (event.type === "image") {
        scheduleInvalidate(["images"], 500);
        scheduleInvalidate(["systemInfo"], 2000);
        scheduleInvalidate(["system-info"], 2000);
        scheduleInvalidate(["system-df"], 5000);
      } else if (event.type === "network") {
        scheduleInvalidate(["networks"], 500);
      } else if (event.type === "volume") {
        scheduleInvalidate(["volumes"], 500);
        scheduleInvalidate(["system-df"], 5000);
      }
    },
  });

  sharedClient.connect();
}

function releaseSharedConnection() {
  if (subscriberCount > 0) return;
  if (sharedClient) {
    sharedClient.disconnect();
    sharedClient = null;
  }
  sharedStatus = "disconnected";
  for (const timer of invalidateTimers.values()) {
    clearTimeout(timer);
  }
  invalidateTimers.clear();
}

export function useDockerEvents() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!user) return;

    activeQueryClient = queryClient;
    subscriberCount += 1;

    const onUpdate = () => {
      setTick((t) => t + 1);
    };
    listeners.add(onUpdate);
    ensureSharedConnection();

    return () => {
      listeners.delete(onUpdate);
      subscriberCount = Math.max(0, subscriberCount - 1);
      releaseSharedConnection();
    };
  }, [user, queryClient]);

  return {
    events: sharedEvents,
    isConnected: sharedStatus === "connected",
    status: sharedStatus,
  };
}

