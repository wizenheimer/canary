import {
  createPlaywright,
  DispatcherConnection,
  type DispatcherConnectionLike,
  PlaywrightDispatcher,
  type PlaywrightDispatcherLike,
  RootDispatcher,
  type RootDispatcherLike,
} from "./playwright-internals.js";

// A capture-enabled session context emits a `video` event (on BrowserContext /
// Page) that the vendored sandbox client has no event validator for. We withhold
// just that event. Everything else — including Artifact/Stream __create__ and the
// `download` event — is forwarded verbatim so downloads keep working; the daemon
// records video on its own real context regardless of what the sandbox sees.
const WITHHELD_EVENTS = new Set(["video"]);

interface BridgeMessage {
  method?: string;
}

export interface HostBridgeOptions {
  denyLaunch?: boolean;
  preLaunchedBrowser?: unknown;
  sdkLanguage?: string;
  sendToSandbox: (json: string) => void;
  sharedBrowser?: boolean;
}

export class HostBridge {
  private readonly dispatcherConnection: DispatcherConnectionLike;
  private readonly rootDispatcher: RootDispatcherLike;
  private readonly playwright: unknown;
  private readonly sendToSandbox: (json: string) => void;
  private readonly options: Omit<HostBridgeOptions, "sendToSandbox">;

  private playwrightDispatcher?: PlaywrightDispatcherLike;
  private disposed = false;

  constructor(options: HostBridgeOptions) {
    this.sendToSandbox = options.sendToSandbox;
    this.options = {
      preLaunchedBrowser: options.preLaunchedBrowser,
      sharedBrowser: options.sharedBrowser,
      denyLaunch: options.denyLaunch,
      sdkLanguage: options.sdkLanguage ?? "javascript",
    };
    this.playwright = createPlaywright({
      sdkLanguage: this.options.sdkLanguage ?? "javascript",
    });
    this.dispatcherConnection = new DispatcherConnection(false);
    this.dispatcherConnection.onmessage = (message) => {
      if (this.shouldWithhold(message as BridgeMessage)) {
        return;
      }
      this.sendToSandbox(JSON.stringify(message));
    };
    this.rootDispatcher = new RootDispatcher(
      this.dispatcherConnection,
      async (rootScope) => {
        this.playwrightDispatcher = new PlaywrightDispatcher(
          rootScope,
          this.playwright,
          {
            preLaunchedBrowser: this.options.preLaunchedBrowser,
            sharedBrowser: this.options.sharedBrowser,
            denyLaunch: this.options.denyLaunch,
          }
        );
        return this.playwrightDispatcher;
      }
    );
  }

  // True when a host→sandbox protocol message must be withheld because the
  // vendored sandbox client has no validator for it. Only the `video` event
  // qualifies; the daemon still records video on its own real context.
  private shouldWithhold(message: BridgeMessage): boolean {
    return message.method ? WITHHELD_EVENTS.has(message.method) : false;
  }

  async receiveFromSandbox(json: string): Promise<void> {
    await this.dispatcherConnection.dispatch(
      JSON.parse(json) as Record<string, unknown>
    );
  }

  async dispose(): Promise<void> {
    if (this.disposed) {
      return;
    }

    this.disposed = true;
    this.dispatcherConnection.onmessage = () => {};

    try {
      await this.playwrightDispatcher?.cleanup();
    } finally {
      this.rootDispatcher._dispose();
    }
  }
}
