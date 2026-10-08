type BatchTask = { id: string; batchId?: string; createdAt: string };

export function selectGenerationBatch<T extends BatchTask>(tasks: T[], activeBatchId?: string): T[] {
  const latest = tasks.reduce<T | undefined>((current, task) => !current || task.createdAt > current.createdAt ? task : current, undefined);
  const batchId = activeBatchId || latest?.batchId || latest?.id;
  return batchId ? tasks.filter((task) => (task.batchId || task.id) === batchId) : [];
}
