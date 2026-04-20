import { pipeline, env } from '@huggingface/transformers'

// ── Environment config ────────────────────────────────────────────────────────
// Use local model files bundled under public/models/
// v4 hub.js: localPath = pathJoin(env.localModelPath, model_id/filename)
// We use a relative path so the browser resolves it against the page origin.
env.allowLocalModels = true
env.allowRemoteModels = false
env.localModelPath = '/models/'
env.useWasmCache = true

if (env.backends.onnx.wasm) {
  env.backends.onnx.wasm.wasmPaths = `${self.location.origin}/`
}

const MODEL_NAME = 'SmartComponents/bge-micro-v2'
const TASK = 'feature-extraction'
const MAX_TOKENS = 512

// ── Message types ─────────────────────────────────────────────────────────────

type WorkerMessage =
  | { type: 'LOAD_MODEL' }
  | { type: 'EMBED'; id: string; text: string }
  | { type: 'EMBED_WITH_HEADING'; id: string; text: string; headingPath: string }
  | { type: 'EMBED_BATCH'; id: string; texts: string[] }

type WorkerResponse =
  | { type: 'MODEL_LOADING' }
  | { type: 'MODEL_READY' }
  | { type: 'MODEL_ERROR'; error: string }
  | { type: 'EMBED_RESULT'; id: string; vector: number[] }
  | { type: 'EMBED_BATCH_RESULT'; id: string; vectors: number[][] }
  | { type: 'EMBED_ERROR'; id: string; error: string }
  | { type: 'PROGRESS'; status: string; progress: number }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let extractor: any = null

// ── Model loading ─────────────────────────────────────────────────────────────

async function loadModel() {
  self.postMessage({ type: 'MODEL_LOADING' } satisfies WorkerResponse)

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    extractor = await (pipeline as any)(TASK, MODEL_NAME, {
      quantized: true,
      progress_callback: (progress: {
        status: string
        progress?: number
        name?: string
      }) => {
        if (progress.status === 'downloading') {
          self.postMessage({
            type: 'PROGRESS',
            status: `Downloading model: ${progress.name ?? ''}`,
            progress: progress.progress ?? 0,
          } satisfies WorkerResponse)
        }
        if (progress.status === 'loading') {
          self.postMessage({
            type: 'PROGRESS',
            status: 'Loading model into memory...',
            progress: 100,
          } satisfies WorkerResponse)
        }
      },
    })

    self.postMessage({ type: 'MODEL_READY' } satisfies WorkerResponse)
  } catch (err) {
    console.error('[EmbeddingWorker] Model load failed:', err)
    self.postMessage({
      type: 'MODEL_ERROR',
      error: String(err),
    } satisfies WorkerResponse)
  }
}

// ── Embedding ─────────────────────────────────────────────────────────────────

function normalizeVector(vector: number[]): number[] {
  const magnitude = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0))
  if (magnitude === 0) return vector
  return vector.map((v) => v / magnitude)
}

/**
 * Embed text using the tokenizer directly for guaranteed truncation.
 *
 * CRITICAL: bge-micro-v2 has a hard 512 token limit. Without explicit
 * truncation at the tokenizer level, OrtRun crashes with:
 * "axis == 1 || axis == largest was false. 512 by N"
 *
 * We use extractor.tokenizer directly (not the pipeline shorthand) to
 * guarantee max_length=512 is respected before the model sees the input.
 *
 * headingPath is prepended as context prefix (improves retrieval quality
 * by preserving document structure in the embedding space).
 */
async function embedText(text: string, headingPath = ''): Promise<number[]> {
  if (!extractor) throw new Error('Model not loaded')

  // Build context-aware prefix
  // "Represent this sentence: [Heading > SubHeading: ] actual text"
  const contextPrefix = headingPath ? `${headingPath}: ` : ''
  const prefixedText = `Represent this sentence: ${contextPrefix}${text}`

  // Use tokenizer directly for guaranteed truncation
  // This is the ONLY reliable way to enforce max_length in @huggingface/transformers v4
  const tokenizer = extractor.tokenizer
  const encoded = tokenizer(prefixedText, {
    padding: true,
    truncation: true,
    max_length: MAX_TOKENS,
    return_tensors: 'ort',
  })

  // Run model inference
  const output = await extractor.model(encoded)

  // Mean pooling with attention mask
  const hiddenState = output.last_hidden_state
  const attentionMask = encoded.attention_mask

  const vector = meanPoolAndNormalize(
    hiddenState.data as Float32Array,
    attentionMask.data as BigInt64Array,
    hiddenState.dims as number[]
  )

  return vector
}

/**
 * Mean pooling: average token embeddings weighted by attention mask,
 * then L2-normalize.
 *
 * dims: [batch_size, seq_len, hidden_size]
 */
function meanPoolAndNormalize(
  hiddenState: Float32Array,
  attentionMask: BigInt64Array,
  dims: number[]
): number[] {
  const [, seqLen, hiddenSize] = dims
  const pooled = new Float32Array(hiddenSize)
  let tokenCount = 0

  for (let t = 0; t < seqLen; t++) {
    if (attentionMask[t] === 0n) continue
    tokenCount++
    for (let h = 0; h < hiddenSize; h++) {
      pooled[h] += hiddenState[t * hiddenSize + h]
    }
  }

  if (tokenCount > 0) {
    for (let h = 0; h < hiddenSize; h++) {
      pooled[h] /= tokenCount
    }
  }

  return normalizeVector(Array.from(pooled))
}

// ── Message handler ───────────────────────────────────────────────────────────

self.addEventListener('message', async (event: MessageEvent<WorkerMessage>) => {
  const msg = event.data

  switch (msg.type) {
    case 'LOAD_MODEL':
      await loadModel()
      break

    case 'EMBED':
      try {
        const vector = await embedText(msg.text)
        self.postMessage({
          type: 'EMBED_RESULT',
          id: msg.id,
          vector,
        } satisfies WorkerResponse)
      } catch (err) {
        self.postMessage({
          type: 'EMBED_ERROR',
          id: msg.id,
          error: String(err),
        } satisfies WorkerResponse)
      }
      break

    case 'EMBED_WITH_HEADING':
      try {
        const vector = await embedText(msg.text, msg.headingPath)
        self.postMessage({
          type: 'EMBED_RESULT',
          id: msg.id,
          vector,
        } satisfies WorkerResponse)
      } catch (err) {
        self.postMessage({
          type: 'EMBED_ERROR',
          id: msg.id,
          error: String(err),
        } satisfies WorkerResponse)
      }
      break

    case 'EMBED_BATCH':
      try {
        const vectors: number[][] = []
        for (const text of msg.texts) {
          const vector = await embedText(text)
          vectors.push(vector)
        }
        self.postMessage({
          type: 'EMBED_BATCH_RESULT',
          id: msg.id,
          vectors,
        } satisfies WorkerResponse)
      } catch (err) {
        self.postMessage({
          type: 'EMBED_ERROR',
          id: msg.id,
          error: String(err),
        } satisfies WorkerResponse)
      }
      break
  }
})
