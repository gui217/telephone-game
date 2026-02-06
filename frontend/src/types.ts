export type GameStepEvent =
  | { type: 'tts'; child_index: number; text: string; audio_base64: string }
  | { type: 'stt'; child_index: number; text: string }
  | { type: 'done'; final_text: string }
  | { type: 'error'; step: string; child_index: number; message: string }

export interface GameParams {
  num_children: number
  asr_model: string
  tts_model: string
  text: string
  resemble_voice_uuid?: string
}

export interface ModelsResponse {
  asr: string[]
  tts: string[]
}
