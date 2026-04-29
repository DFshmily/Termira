export {};

declare global {
  interface Window {
    termira: {
      invoke<TResult = unknown>(method: string, params?: unknown): Promise<TResult>;
      getPathForFile(file: File): string;
      on(event: string, handler: (payload: unknown, event: string) => void): void;
      off(event: string, handler: (payload: unknown, event: string) => void): void;
      removeAllListeners?(event: string): void;
    };
  }
}
