/**
 * A simple queue for rendering thumbnails sequentially.  The queue
 * accepts asynchronous tasks (functions returning promises) and limits
 * the number of concurrent executions.  This helps avoid overwhelming
 * the browser with too many canvas renderings at once.  In preview
 * mode the tasks may be trivial but the queue structure remains useful
 * for future extensions.
 */
export class ThumbnailQueue {
  private readonly concurrency: number;
  private running = 0;
  private queue: Array<() => Promise<void>> = [];

  constructor(concurrency: number = 2) {
    this.concurrency = Math.max(1, concurrency);
  }

  /**
   * Enqueue a new thumbnail task.  The task should be a function that
   * returns a Promise when executed.  The queue will run tasks in the
   * order they were added, respecting the concurrency limit.
   */
  enqueue(task: () => Promise<void>): void {
    this.queue.push(task);
    this.runNext();
  }

  private runNext(): void {
    if (this.running >= this.concurrency) return;
    const task = this.queue.shift();
    if (!task) return;
    this.running++;
    task()
      .catch(() => {
        // swallow errors to avoid unhandled rejections
      })
      .finally(() => {
        this.running--;
        this.runNext();
      });
  }
}