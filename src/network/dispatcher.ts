import { Session, OnBeforeRequestListenerDetails, OnBeforeSendHeadersListenerDetails, OnHeadersReceivedListenerDetails } from 'electron';

export interface BeforeRequestConsumer {
  name: string;
  priority: number;
  handler: (details: OnBeforeRequestListenerDetails) => { cancel: boolean } | null;
}

export interface BeforeSendHeadersConsumer {
  name: string;
  priority: number;
  handler: (details: OnBeforeSendHeadersListenerDetails, headers: Record<string, string>) => Record<string, string>;
}

export interface HeadersReceivedConsumer {
  name: string;
  priority: number;
  handler: (
    details: OnHeadersReceivedListenerDetails,
    responseHeaders: Record<string, string[]>
  ) => { cancel?: boolean; responseHeaders: Record<string, string[]> } | Record<string, string[]>;
}

export interface BeforeRedirectConsumer {
  name: string;
  handler: (details: Electron.OnBeforeRedirectListenerDetails) => void;
}

export interface CompletedConsumer {
  name: string;
  handler: (details: Electron.OnCompletedListenerDetails) => void;
}

export interface ErrorConsumer {
  name: string;
  handler: (details: Electron.OnErrorOccurredListenerDetails) => void;
}

export class RequestDispatcher {
  private session: Session;
  private attached = false;
  private beforeRequestConsumers: BeforeRequestConsumer[] = [];
  private beforeSendHeadersConsumers: BeforeSendHeadersConsumer[] = [];
  private headersReceivedConsumers: HeadersReceivedConsumer[] = [];
  private beforeRedirectConsumers: BeforeRedirectConsumer[] = [];
  private completedConsumers: CompletedConsumer[] = [];
  private errorConsumers: ErrorConsumer[] = [];

  constructor(session: Session) {
    this.session = session;
  }

  registerBeforeRequest(consumer: BeforeRequestConsumer): void {
    this.beforeRequestConsumers.push(consumer);
    if (this.attached) this.reattach();
  }

  registerBeforeSendHeaders(consumer: BeforeSendHeadersConsumer): void {
    this.beforeSendHeadersConsumers.push(consumer);
    if (this.attached) this.reattach();
  }

  registerHeadersReceived(consumer: HeadersReceivedConsumer): void {
    this.headersReceivedConsumers.push(consumer);
    if (this.attached) this.reattach();
  }

  registerBeforeRedirect(consumer: BeforeRedirectConsumer): void {
    this.beforeRedirectConsumers.push(consumer);
    if (this.attached) this.reattach();
  }

  registerCompleted(consumer: CompletedConsumer): void {
    this.completedConsumers.push(consumer);
    if (this.attached) this.reattach();
  }

  registerError(consumer: ErrorConsumer): void {
    this.errorConsumers.push(consumer);
    if (this.attached) this.reattach();
  }

  attach(): void {
    this.attached = true;
    this.reattach();
  }

  private reattach(): void {
    this.beforeRequestConsumers.sort((a, b) => a.priority - b.priority);
    this.beforeSendHeadersConsumers.sort((a, b) => a.priority - b.priority);
    this.headersReceivedConsumers.sort((a, b) => a.priority - b.priority);

    this.session.webRequest.onBeforeRequest((details, callback) => {
      const start = performance.now();

      for (const consumer of this.beforeRequestConsumers) {
        try {
          const result = consumer.handler(details);
          if (result?.cancel) {
            callback({ cancel: true });
            const elapsed = performance.now() - start;
            if (elapsed > 5) {
              console.warn(`[Dispatcher] Slow onBeforeRequest: ${elapsed.toFixed(1)}ms (blocked by ${consumer.name})`);
            }
            return;
          }
        } catch (err) {
          console.error(`[Dispatcher] Error in ${consumer.name}.onBeforeRequest:`, err);
        }
      }

      callback({ cancel: false });
      const elapsed = performance.now() - start;
      if (elapsed > 5) {
        console.warn(`[Dispatcher] Slow onBeforeRequest: ${elapsed.toFixed(1)}ms for ${details.url.substring(0, 80)}`);
      }
    });

    this.session.webRequest.onBeforeSendHeaders((details, callback) => {
      let headers = { ...details.requestHeaders };

      for (const consumer of this.beforeSendHeadersConsumers) {
        try {
          headers = consumer.handler(details, headers);
        } catch (err) {
          console.error(`[Dispatcher] Error in ${consumer.name}.onBeforeSendHeaders:`, err);
        }
      }

      callback({ requestHeaders: headers });
    });

    this.session.webRequest.onHeadersReceived((details, callback) => {
      let responseHeaders = { ...(details.responseHeaders || {}) };

      for (const consumer of this.headersReceivedConsumers) {
        try {
          const result = consumer.handler(details, responseHeaders);
          // Support cancel (for redirect blocking)
          if (result && typeof result === 'object' && 'cancel' in result && result.cancel) {
            callback({ cancel: true });
            return;
          }
          // Support both return shapes: { responseHeaders } or raw headers object
          if (result && typeof result === 'object' && 'responseHeaders' in result && !Array.isArray((result as any).responseHeaders)) {
            responseHeaders = (result as { responseHeaders: Record<string, string[]> }).responseHeaders;
          } else {
            responseHeaders = result as Record<string, string[]>;
          }
        } catch (err) {
          console.error(`[Dispatcher] Error in ${consumer.name}.onHeadersReceived:`, err);
        }
      }

      callback({ responseHeaders });
    });

    this.session.webRequest.onBeforeRedirect((details) => {
      for (const consumer of this.beforeRedirectConsumers) {
        try {
          consumer.handler(details);
        } catch (err) {
          console.error(`[Dispatcher] Error in ${consumer.name}.onBeforeRedirect:`, err);
        }
      }
    });

    this.session.webRequest.onCompleted((details) => {
      for (const consumer of this.completedConsumers) {
        try {
          consumer.handler(details);
        } catch (err) {
          console.error(`[Dispatcher] Error in ${consumer.name}.onCompleted:`, err);
        }
      }
    });

    this.session.webRequest.onErrorOccurred((details) => {
      for (const consumer of this.errorConsumers) {
        try {
          consumer.handler(details);
        } catch (err) {
          console.error(`[Dispatcher] Error in ${consumer.name}.onErrorOccurred:`, err);
        }
      }
    });

    console.log(`[Dispatcher] Attached with ${this.beforeRequestConsumers.length} onBeforeRequest, ${this.beforeSendHeadersConsumers.length} onBeforeSendHeaders, ${this.headersReceivedConsumers.length} onHeadersReceived consumers`);
  }

  getStatus(): object {
    return {
      consumers: {
        onBeforeRequest: this.beforeRequestConsumers.map(c => ({ name: c.name, priority: c.priority })),
        onBeforeSendHeaders: this.beforeSendHeadersConsumers.map(c => ({ name: c.name, priority: c.priority })),
        onHeadersReceived: this.headersReceivedConsumers.map(c => ({ name: c.name, priority: c.priority })),
        onBeforeRedirect: this.beforeRedirectConsumers.map(c => c.name),
        onCompleted: this.completedConsumers.map(c => c.name),
        onError: this.errorConsumers.map(c => c.name),
      }
    };
  }
}
