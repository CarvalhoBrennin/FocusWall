let statePersistenceQueue: Promise<void> = Promise.resolve();

/**
 * Serializa todas as operações que gravam dashboard-state.json.
 * A função recebida deve reler o estado mais recente dentro da operação antes
 * de montar o payload, evitando sobrescrever mutações de outros domínios.
 */
export function enqueueStatePersistence<T>(operation: () => Promise<T>): Promise<T> {
  const run = statePersistenceQueue.then(operation, operation);
  statePersistenceQueue = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}
