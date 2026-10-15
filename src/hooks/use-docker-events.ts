import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import type { DockerEventItem } from "../../shared/types.js";
import { useAuth } from "../lib/auth-context.js";
import { WebSocketClient, type WsStatus } from "../lib/ws.js";

const MAX_SAVED_EVENTS = 50;

export function useDockerEvents() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [events, setEvents] = useState<DockerEventItem[]>([]);
  const [status, setStatus] = useState<WsStatus>("disconnected");

  useEffect(() => {
    if (!user) return;

    let active = true;

    const client = new WebSocketClient<DockerEventItem>({
      url: "/ws/events",
      onStatusChange: (newStatus) => {
        if (active) setStatus(newStatus);
      },
      onMessage: (event) => {
        if (!active || !event?.type) return;

        setEvents((prev) => [event, ...prev.slice(0, MAX_SAVED_EVENTS - 1)]);

        // Invalidate corresponding TanStack queries automatically
        if (event.type === "container") {
          void queryClient.invalidateQueries({ queryKey: ["containers"] });
          void queryClient.invalidateQueries({ queryKey: ["system-info"] });
          void queryClient.invalidateQueries({ queryKey: ["system-df"] });
        } else if (event.type === "image") {
          void queryClient.invalidateQueries({ queryKey: ["images"] });
          void queryClient.invalidateQueries({ queryKey: ["system-info"] });
          void queryClient.invalidateQueries({ queryKey: ["system-df"] });
        } else if (event.type === "network") {
          void queryClient.invalidateQueries({ queryKey: ["networks"] });
        } else if (event.type === "volume") {
          void queryClient.invalidateQueries({ queryKey: ["volumes"] });
          void queryClient.invalidateQueries({ queryKey: ["system-df"] });
        }
      },
    });

    client.connect();

    return () => {
      active = false;
      client.disconnect();
    };
  }, [user, queryClient]);

  return {
    events,
    isConnected: status === "connected",
    status,
  };
}
