export type WsStatus = "connecting" | "connected" | "disconnected" | "reconnecting";

export interface WsClientOptions<T = unknown> {
  url: string;
  onOpen?: () => void;
  onClose?: (event: CloseEvent) => void;
  onError?: (event: Event) => void;
  onMessage?: (data: T) => void;
  onStatusChange?: (status: WsStatus) => void;
  maxReconnectDelay?: number;
  autoReconnect?: boolean;
}

export class WebSocketClient<T = unknown> {
  private ws: WebSocket | null = null;
  private status: WsStatus = "disconnected";
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private intentionalClose = false;
  private options: WsClientOptions<T>;

  constructor(options: WsClientOptions<T>) {
    this.options = {
      maxReconnectDelay: 15000,
      autoReconnect: true,
      ...options,
    };
  }

  public connect(): void {
    if (
      this.ws &&
      (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }

    this.intentionalClose = false;
    this.setStatus(this.reconnectAttempts === 0 ? "connecting" : "reconnecting");

    const fullUrl = this.resolveFullUrl(this.options.url);

    try {
      this.ws = new WebSocket(fullUrl);
    } catch (err) {
      this.handleCloseOrError();
      return;
    }

    this.ws.onopen = () => {
      this.reconnectAttempts = 0;
      this.setStatus("connected");
      this.options.onOpen?.();
    };

    this.ws.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data as string) as T;
        this.options.onMessage?.(parsed);
      } catch {
        this.options.onMessage?.(event.data as unknown as T);
      }
    };

    this.ws.onclose = (event) => {
      this.options.onClose?.(event);
      if (!this.intentionalClose && this.options.autoReconnect) {
        this.scheduleReconnect();
      } else {
        this.setStatus("disconnected");
      }
    };

    this.ws.onerror = (event) => {
      this.options.onError?.(event);
    };
  }

  public send(data: string | object | ArrayBufferView | ArrayBuffer): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    if (typeof data === "object" && !(data instanceof ArrayBuffer) && !ArrayBuffer.isView(data)) {
      this.ws.send(JSON.stringify(data));
    } else {
      this.ws.send(data);
    }
  }

  public updateUrl(newUrl: string): void {
    this.options.url = newUrl;
  }

  public disconnect(): void {
    this.intentionalClose = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.setStatus("disconnected");
  }

  public getStatus(): WsStatus {
    return this.status;
  }

  private setStatus(status: WsStatus): void {
    if (this.status !== status) {
      this.status = status;
      this.options.onStatusChange?.(status);
    }
  }

  private scheduleReconnect(): void {
    this.setStatus("reconnecting");
    const delay = Math.min(
      1000 * Math.pow(1.5, this.reconnectAttempts),
      this.options.maxReconnectDelay || 15000,
    );
    this.reconnectAttempts++;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }

    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, delay);
  }

  private handleCloseOrError(): void {
    if (!this.intentionalClose && this.options.autoReconnect) {
      this.scheduleReconnect();
    } else {
      this.setStatus("disconnected");
    }
  }

  private resolveFullUrl(pathOrUrl: string): string {
    if (pathOrUrl.startsWith("ws://") || pathOrUrl.startsWith("wss://")) {
      return pathOrUrl;
    }

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const host = window.location.host;
    const cleanPath = pathOrUrl.startsWith("/") ? pathOrUrl : `/${pathOrUrl}`;
    return `${protocol}//${host}${cleanPath}`;
  }
}
