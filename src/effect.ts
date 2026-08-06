import { remember } from "./remember";

export type EffectCleanup = () => void;
export type EffectCallback = (signal: AbortSignal) => (EffectCleanup | void | Promise<EffectCleanup | void>);

interface EffectStateContainer {
  abortController: AbortController;
  cleanupPromise: Promise<EffectCleanup | void> | EffectCleanup | void;
}

export function launchedEffect(effect: EffectCallback, keys: any[] = []): void {
  remember(
    () => {
      const container: EffectStateContainer = {
        abortController: new AbortController(),
        cleanupPromise: undefined
      };

      // Defer side effect execution until after the template paints to the DOM
      queueMicrotask(() => {
        if (container.abortController.signal.aborted) return;
        container.cleanupPromise = effect(container.abortController.signal);
      });

      return container;
    }, 
    keys, 
    {
      onDispose: async (container: EffectStateContainer) => {
        container.abortController.abort(); // Cancel any active async loops or fetch calls immediately
        
        const resolvedCleanup = await container.cleanupPromise;
        if (typeof resolvedCleanup === 'function') {
          resolvedCleanup(); // Run cleanup block
        }
      }
    }
  );
}
