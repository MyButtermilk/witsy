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

  requiresPcm16bits(model: string): boolean {
    return model === 'realtime';
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
    return this.transcribeFile(audioBlob)
  }

  async transcribeFile(audioBlob: Blob): Promise<STTFileTranscription> {
    const apiKey = this.getApiKey()
    if (!apiKey) {
      throw new Error('Missing Soniox API key in settings')
    }

    const lang = this.config.stt.locale?.substring(0, 2) || 'en'
    const phrases = this.config.stt.vocabulary?.map((v: Vocabulary) => v.text).filter(v => v.trim()) || []

    // 1. Create transcription metadata
    const createBody: any = {
      model: 'stt-async-preview',
      language: lang,
    }
    if (phrases.length > 0) {
      const contextObject = {
        custom_vocabulary: phrases.map(phrase => ({ phrase })),
      }
      createBody.context = JSON.stringify(contextObject)
    }

    const createResponse = await fetch(`${BASE_URL}/transcriptions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(createBody),
    })

    if (!createResponse.ok) {
      const errorBody = await createResponse.text()
      console.error('Soniox transcription creation failed. Status:', createResponse.status, 'Body:', errorBody)
      throw new Error(`Soniox transcription creation failed: ${createResponse.statusText}. ${errorBody}`)
    }
    const { id: transcription_id } = await createResponse.json()

    // 2. Upload audio file
    const uploadResponse = await fetch(`${BASE_URL}/transcriptions/${transcription_id}/audio`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'audio/webm',
        'Content-Length': audioBlob.size.toString(),
      },
      body: audioBlob,
    })

    if (!uploadResponse.ok) {
      const errorBody = await uploadResponse.text()
      console.error('Soniox audio upload failed. Status:', uploadResponse.status, 'Body:', errorBody)
      throw new Error(`Soniox audio upload failed: ${uploadResponse.statusText}. ${errorBody}`)
    }

    // 3. Poll for result
    for (let retries = 0; retries < 60; retries++) {
      await new Promise(resolve => setTimeout(resolve, 2000)) // Wait 2 seconds

      const statusResponse = await fetch(`${BASE_URL}/transcriptions/${transcription_id}`, {
        headers: { 'Authorization': `Bearer ${apiKey}` },
      })

      if (!statusResponse.ok) {
        throw new Error(`Soniox status check failed: ${statusResponse.statusText}`)
      }
      const statusJson = await statusResponse.json()

      if (statusJson.status === 'completed') {
        const words = statusJson.words || []
        const text = words.map((word: any) => word.text).join('')
        return { text }
      }
      if (statusJson.status === 'error') {
        throw new Error(`Soniox transcription failed: ${statusJson.error_type} - ${statusJson.error_message}`)
      }
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
        const lang = this.config.stt.locale?.substring(0, 2) || 'en'
        const modelName = `${lang}_v2`
        const phrases = this.config.stt.vocabulary?.map((v: Vocabulary) => v.text).filter(v => v.trim()) || []

        const configMsg: any = {
          api_key: apiKey,
          model: modelName,
          include_nonfinal: true,
          audio_format: 's16le',
          resample_rate: 16000,
          enable_endpoint_detection: true,
        }

        if (phrases.length > 0) {
          configMsg.context = {
            custom_vocabulary: phrases.map(phrase => ({ phrase })),
          }
        }

        this.ws?.send(JSON.stringify(configMsg))
        callback({ type: 'status', status: 'connected' })
        resolve()
      }

      this.ws.onmessage = (event) => {
        const data = JSON.parse(event.data)

        if (data.error_message) {
          callback({ type: 'error', message: `Soniox: ${data.error_message}` })
          this.cleanupConnection()
          return
        }

        if (data.tokens) {
          const transcript = data.tokens.map((token: any) => token.text).join('')
          const isFinal = data.final_audio_proc_ms > 0
          callback({ type: 'text', content: transcript, isFinal })
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

  async sendAudioChunk(chunk: Blob | ArrayBuffer): Promise<void> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return
    }
    try {
      let audioData: ArrayBuffer;
      if (chunk instanceof Blob) {
        audioData = await chunk.arrayBuffer()
      } else {
        audioData = chunk
      }

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
