export {};

declare global {
  interface Window {
    termira: {
      invoke<TResult = unknown>(method: string, params?: unknown): Promise<TResult>;
      on(event: string, handler: (payload: unknown, event: string) => void): void;
      off(event: string, handler: (payload: unknown, event: string) => void): void;
      removeAllListeners?(event: string): void;
    };
  }
}
