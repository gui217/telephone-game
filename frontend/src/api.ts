import type { GameStepEvent, ModelsResponse } from './types'

const API_BASE = '/api'

export async function fetchModels(): Promise<ModelsResponse> {
  const res = await fetch(`${API_BASE}/models`)
  if (!res.ok) throw new Error('Failed to fetch models')
  return res.json()
}

export async function startGameStream(
  params: {
    num_children: number
    asr_model: string
    tts_model: string
    text?: string
  },
  audioFile: File | null,
  onEvent: (event: GameStepEvent) => void,
  onError?: (err: Error) => void
): Promise<void> {
  const form = new FormData()
  form.append('num_children', String(params.num_children))
  form.append('asr_model', params.asr_model)
  form.append('tts_model', params.tts_model)
  if (params.text) form.append('text', params.text)
  if (audioFile) form.append('audio', audioFile)

  const res = await fetch(`${API_BASE}/game/start`, {
    method: 'POST',
    body: form,
  })
  if (!res.ok) {
    const errBody = await res.text()
    onError?.(new Error(errBody || `HTTP ${res.status}`))
    return
  }
  const reader = res.body?.getReader()
  if (!reader) {
    onError?.(new Error('No response body'))
    return
  }
  const decoder = new TextDecoder()
  let buffer = ''
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6)) as GameStepEvent
            onEvent(data)
          } catch {
            // skip malformed
          }
        }
      }
    }
    if (buffer.startsWith('data: ')) {
      try {
        const data = JSON.parse(buffer.slice(6)) as GameStepEvent
        onEvent(data)
      } catch {
        // skip
      }
    }
  } catch (err) {
    onError?.(err instanceof Error ? err : new Error(String(err)))
  }
}
