export {}

declare global {
  interface Window {
    nodalcore: {
      postMessage(data: unknown): Promise<unknown>
      onMessage(handler: (data: unknown) => void): () => void
    }
  }
}
