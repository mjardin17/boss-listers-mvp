export type OptimisticResult<T> = {
  optimistic: T;
  rollback: T;
  committed: boolean;
};

export function applyOptimisticUpdate<T>(current: T, next: T): OptimisticResult<T> {
  return {
    optimistic: next,
    rollback: current,
    committed: false
  };
}

export function commitOptimisticUpdate<T>(state: OptimisticResult<T>): OptimisticResult<T> {
  return { ...state, committed: true };
}

export function rollbackOptimisticUpdate<T>(state: OptimisticResult<T>): T {
  return state.rollback;
}
