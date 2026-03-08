export interface LatestRequestHandle {
  id: number;
  controller: AbortController;
  signal: AbortSignal;
}

export function createLatestRequestGuard() {
  let currentId = 0;
  let activeController: AbortController | null = null;

  return {
    begin(): LatestRequestHandle {
      activeController?.abort();
      activeController = new AbortController();
      currentId += 1;

      return {
        id: currentId,
        controller: activeController,
        signal: activeController.signal,
      };
    },
    isCurrent(id: number): boolean {
      return id === currentId;
    },
    finish(id: number) {
      if (id === currentId) {
        activeController = null;
      }
    },
    cancel() {
      activeController?.abort();
      activeController = null;
      currentId += 1;
    },
  };
}

export function isAbortError(error: unknown): boolean {
  if (error instanceof DOMException) {
    return error.name === "AbortError";
  }

  if (error instanceof Error) {
    return error.name === "AbortError";
  }

  if (typeof error === "object" && error !== null && "name" in error) {
    return (error as { name?: unknown }).name === "AbortError";
  }

  return false;
}
