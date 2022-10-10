import type { Result } from './result.ts';
import type { Computation, Continuation } from './deps.ts';
import { reset, shift } from './deps.ts';

interface WorkQueue {
  push<T>(job: () => Computation<T>): Computation<Result<T>>;
}

interface WorkItem<T = unknown> {
  job: () => Computation<T>;
  resume: (result: Result<T>) => void;
}

export function* createWorkQueue(): Computation<WorkQueue> {
  let queue: WorkItem<unknown>[] = [];

  let notify = yield* reset<Continuation<void,void>>(function*() {
    while (true) {
      if (queue.length === 0) {
        yield* shift(function*(k) {
          notify = k;
        });
      }

      let item = queue.pop() as WorkItem;

      try {
        item.resume({ type: 'resolved', value: yield* item.job() });
      } catch (error) {
        item.resume({ type: 'rejected', error });
      }

    }
  });

  return {
    *push(job) {
      return yield* shift(function*(resume) {
        queue.unshift({ job, resume });
        notify();
      });
    }
  }
}
