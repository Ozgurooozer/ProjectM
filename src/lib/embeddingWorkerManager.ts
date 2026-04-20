type ModelStatus = 'idle' | 'loading' | 'ready' | 'error'

type ProgressCallback = (status: string, progress: number) => void
type StatusCallback = (status: ModelStatus) => void

class EmbeddingWorkerManager {
  private worker: Worker | null = null
  private pendingRequests = new Map<
    string,
    { resolve: (v: number[]) => void; reject: (e: Error) => void }
  >()
  private pendingBatchRequests = new Map<
    string,
    { resolve: (v: number[][]) => void; reject: (e: Error) => void }
  >()
  private requestCounter = 0
  private modelStatus: ModelStatus = 'idle'
  private progressListeners: ProgressCallback[] = []
  private statusListeners: StatusCallback[] = []

  private generateId(): string {
    return `req_${++this.requestCounter}_${Date.now()}`
  }

  onProgress(cb: ProgressCallback) {
    this.progressListeners.push(cb)
    return () => {
      this.progressListeners = this.progressListeners.filter((l) => l !== cb)
    }
  }

  onStatusChange(cb: StatusCallback) {
    this.statusListeners.push(cb)
    return () => {
      this.statusListeners = this.statusListeners.filter((l) => l !== cb)
    }
  }

  getStatus(): ModelStatus {
    return this.modelStatus
  }

  private setStatus(status: ModelStatus) {
    this.modelStatus = status
    this.statusListeners.forEach((cb) => cb(status))
  }

  private initWorker() {
    if (this.worker) return

    this.worker = new Worker(
      new URL('../workers/embeddingWorker.ts', import.meta.url),
      { type: 'module' }
    )

    this.worker.addEventListener('message', (event) => {
      const msg = event.data

      switch (msg.type) {
        case 'MODEL_LOADING':
          this.setStatus('loading')
          break

        case 'MODEL_READY':
          this.setStatus('ready')
          break

        case 'MODEL_ERROR':
          this.setStatus('error')
          console.error('Embedding model error:', msg.error)
          break

        case 'PROGRESS':
          this.progressListeners.forEach((cb) =>
            cb(msg.status, msg.progress)
          )
          break

        case 'EMBED_RESULT': {
          const pending = this.pendingRequests.get(msg.id)
          if (pending) {
            pending.resolve(msg.vector)
            this.pendingRequests.delete(msg.id)
          }
          break
        }

        case 'EMBED_BATCH_RESULT': {
          const pending = this.pendingBatchRequests.get(msg.id)
          if (pending) {
            pending.resolve(msg.vectors)
            this.pendingBatchRequests.delete(msg.id)
          }
          break
        }

        case 'EMBED_ERROR': {
          const pending =
            this.pendingRequests.get(msg.id) ??
            this.pendingBatchRequests.get(msg.id)
          if (pending) {
            pending.reject(new Error(msg.error))
            this.pendingRequests.delete(msg.id)
            this.pendingBatchRequests.delete(msg.id)
          }
          break
        }
      }
    })
  }

  async loadModel(): Promise<void> {
    this.initWorker()
    if (this.modelStatus === 'ready') return
    if (this.modelStatus === 'loading') {
      return new Promise((resolve, reject) => {
        const unsub = this.onStatusChange((status) => {
          if (status === 'ready') { unsub(); resolve() }
          if (status === 'error') { unsub(); reject(new Error('Model load failed')) }
        })
      })
    }
    this.worker!.postMessage({ type: 'LOAD_MODEL' })
    return new Promise((resolve, reject) => {
      const unsub = this.onStatusChange((status) => {
        if (status === 'ready') { unsub(); resolve() }
        if (status === 'error') { unsub(); reject(new Error('Model load failed')) }
      })
    })
  }

  async embed(text: string): Promise<number[]> {
    if (this.modelStatus !== 'ready') {
      throw new Error('Model not ready. Call loadModel() first.')
    }

    const id = this.generateId()

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject })
      this.worker!.postMessage({ type: 'EMBED', id, text })
    })
  }

  async embedWithHeading(text: string, headingPath: string): Promise<number[]> {
    if (this.modelStatus !== 'ready') {
      throw new Error('Model not ready. Call loadModel() first.')
    }

    const id = this.generateId()

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject })
      this.worker!.postMessage({ type: 'EMBED_WITH_HEADING', id, text, headingPath })
    })
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    if (this.modelStatus !== 'ready') {
      throw new Error('Model not ready. Call loadModel() first.')
    }

    const id = this.generateId()

    return new Promise((resolve, reject) => {
      this.pendingBatchRequests.set(id, { resolve, reject })
      this.worker!.postMessage({ type: 'EMBED_BATCH', id, texts })
    })
  }

  terminate() {
    this.worker?.terminate()
    this.worker = null
    this.setStatus('idle')
  }
}

export const embeddingWorker = new EmbeddingWorkerManager()
