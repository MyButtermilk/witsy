import {
  STTEngine,
  STTEvent,
  STTFileTranscription,
  ProgressCallback,
  TranscribeResponse,
  Vocabulary
} from './stt'
import { Configuration } from '../types/config'

const BASE_URL = 'https://api.soniox.com/v1'
const WEBSOCKET_URL = 'wss://stt-rt.soniox.com/transcribe-websocket'

export default class SonioxSTT implements STTEngine {
  config: Configuration
  name: string
  label: string
  logo: string
  description: string
  modes: ('realtime' | 'file')[]

  private ws: WebSocket | null = null
  private fullTranscript: string = ''
  private nonFinalPart: string = ''

  static models = [
    { id: 'realtime', label: 'Realtime Transcription' },
    { id: 'async', label: 'Asynchronous Transcription' },
  ]

  constructor(config: Configuration) {
    this.config = config
    this.name = 'soniox'
    this.label = 'Soniox'
    this.logo = 'soniox.png'
    this.description = 'Soniox offers both real-time and file-based transcription with high accuracy.'
    this.modes = ['realtime', 'file']
  }

  isReady(): boolean {
    return true
  }

  async initialize(callback?: ProgressCallback): Promise<void> {
    callback?.({ status: 'ready', task: 'soniox' })
    return Promise.resolve()
  }

  static requiresDownload(): boolean {
    return false
  }
  
  requiresDownload(): boolean {
    return SonioxSTT.requiresDownload()
  }

  async isModelDownloaded(): Promise<boolean> {
    return true
  }

  async deleteModel(): Promise<void> {
    return Promise.resolve()
  }

  async deleteAllModels(): Promise<void> {
    return Promise.resolve()
  }

  isStreamingModel(model: string): boolean {
    return model === 'realtime'
  }

  private getApiKey(): string {
    return this.config.engines.soniox?.apiKey || ''
  }

  private cleanupConnection() {
    if (this.ws) {
      this.ws.onopen = null
      this.ws.onmessage = null
      this.ws.onerror = null
      this.ws.onclose = null
      if (this.ws.readyState === WebSocket.OPEN) {
        this.ws.close()
      }
      this.ws = null
    }
    this.fullTranscript = ''
    this.nonFinalPart = ''
  }

  async transcribe(audioBlob: Blob): Promise<TranscribeResponse> {
    const file = new File([audioBlob], 'audio.wav', { type: audioBlob.type })
    return this.transcribeFile(file)
  }

  async transcribeFile(file: File): Promise<STTFileTranscription> {
    const apiKey = this.getApiKey()
    if (!apiKey) {
      throw new Error('Missing Soniox API key in settings')
    }

    const formData = new FormData()
    formData.append('file', file)
    const uploadResponse = await fetch(`${BASE_URL}/files`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}` },
      body: formData,
    })
    if (!uploadResponse.ok) {
      throw new Error(`Soniox file upload failed: ${uploadResponse.statusText}`)
    }
    const { id: file_id } = await uploadResponse.json()

    const phrases = this.config.stt.vocabulary?.map((v: Vocabulary) => v.text).filter(v => v.trim()) || []
    const createResponse = await fetch(`${BASE_URL}/transcriptions`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        file_id: file_id,
        language: this.config.stt.language || 'en',
        ...(phrases.length > 0 && { custom_vocabulary_phrases: phrases }),
      }),
    })
    if (!createResponse.ok) {
      throw new Error(`Soniox transcription creation failed: ${createResponse.statusText}`)
    }
    const { id: transcription_id } = await createResponse.json()

    for (let retries = 0; retries < 60; retries++) {
      const statusResponse = await fetch(`${BASE_URL}/transcriptions/${transcription_id}`, {
        headers: { 'Authorization': `Bearer ${apiKey}` },
      })
      if (!statusResponse.ok) throw new Error(`Soniox status check failed: ${statusResponse.statusText}`)
      const { status } = await statusResponse.json()

      if (status === 'completed') {
        const transcriptResponse = await fetch(`${BASE_URL}/transcriptions/${transcription_id}/transcript`, {
          headers: { 'Authorization': `Bearer ${apiKey}` },
        })
        if (!transcriptResponse.ok) throw new Error(`Soniox transcript fetch failed: ${transcriptResponse.statusText}`)
        const { text } = await transcriptResponse.json()

        if (this.config.stt.soniox?.cleanup) {
          await fetch(`${BASE_URL}/files/${file_id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${apiKey}` },
          })
        }
        return { text }
      }
      if (status === 'failed') {
        throw new Error('Soniox transcription failed.')
      }
      await new Promise(resolve => setTimeout(resolve, 1000))
    }

    throw new Error('Soniox transcription timed out.')
  }

  startStreaming(model: string, callback: (event: STTEvent) => void): Promise<void> {
    this.cleanupConnection()

    const apiKey = this.getApiKey()
    if (!apiKey) {
      const errorMsg = 'Missing Soniox API key in settings'
      callback({ type: 'error', message: errorMsg })
      return Promise.reject(new Error(errorMsg))
    }

    try {
      this.ws = new WebSocket(WEBSOCKET_URL)
    } catch (error) {
      return Promise.reject(error)
    }

    return new Promise<void>((resolve, reject) => {
      if (!this.ws) return reject('WebSocket not initialized')

      this.ws.onopen = () => {
        const phrases = this.config.stt.vocabulary?.map((v: Vocabulary) => v.text).filter(v => v.trim()) || []
        const configMsg = {
          api_key: apiKey,
          language: this.config.stt.language || 'en',
          include_nonfinal: true,
          ...(phrases.length > 0 && { custom_vocabulary_phrases: phrases }),
        }
        this.ws?.send(JSON.stringify(configMsg))
        callback({ type: 'status', status: 'connected' })
        resolve()
      }

      this.ws.onmessage = (event) => {
        const data = JSON.parse(event.data)
        if (data.tokens && data.tokens.length > 0) {
          // When new tokens arrive, any previous non-final text is now implicitly final.
          this.fullTranscript += this.nonFinalPart
          this.nonFinalPart = ''

          data.tokens.forEach((token: any) => {
            if (token.is_final) {
              this.fullTranscript += token.text
            } else {
              this.nonFinalPart += token.text
            }
          })

          callback({ type: 'text', content: this.fullTranscript + this.nonFinalPart })
        }
      }

      this.ws.onerror = (error) => {
        callback({ type: 'error', message: 'Soniox connection error' })
        this.cleanupConnection()
        reject(error)
      }

      this.ws.onclose = () => {
        callback({ type: 'status', status: 'disconnected' })
        this.cleanupConnection()
      }
    })
  }

  async sendAudioChunk(chunk: Blob): Promise<void> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return
    }
    try {
      const audioData = await chunk.arrayBuffer()
      // Check again after await, as the state could have changed.
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(audioData)
      }
    } catch (error) {
      console.error('Soniox: Failed to send audio chunk', error)
    }
  }

  async endStreaming(): Promise<void> {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(new Uint8Array())
    }
    // Close regardless of state to ensure cleanup handlers are called.
    this.ws?.close()
  }
}
