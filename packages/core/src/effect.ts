import { Disposable, remember } from "./remember";

export type EffectCleanup = () => void;
export type EffectCallback = (signal: AbortSignal) => (EffectCleanup | void | Promise<EffectCleanup | void>);

export function rememberLaunchedEffect(effect: EffectCallback, keys: any[] = []): void {
  remember(() => {
    const abortController = new AbortController();
    let cleanupPromise: Promise<EffectCleanup | void> | EffectCleanup | void;

    // Defer side effect execution until after the template paints
    queueMicrotask(() => {
      if (abortController.signal.aborted) return;
      cleanupPromise = effect(abortController.signal);
    });

    return {
      [Disposable]: async () => {
        abortController.abort(); // Automatically cancels fetch requests
        const resolvedCleanup = await cleanupPromise;
        if (typeof resolvedCleanup === 'function') resolvedCleanup();
      }
    };
  }, keys);
}
