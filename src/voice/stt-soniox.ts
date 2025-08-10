import {
  STTEngine,
  STTFileTranscription,
  ProgressCallback,
  TranscribeResponse,
  Vocabulary,
  StreamingCallback
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

    // 1. Upload audio file
    const formData = new FormData()
    formData.append('file', audioBlob, 'audio.webm')

    const fileResponse = await fetch(`${BASE_URL}/files`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
      body: formData,
    })

    if (!fileResponse.ok) {
      const errorBody = await fileResponse.text()
      console.error('Soniox file upload failed. Status:', fileResponse.status, 'Body:', errorBody)
      throw new Error(`Soniox file upload failed: ${fileResponse.statusText}. ${errorBody}`)
    }
    const { id: file_id } = await fileResponse.json()

    // 2. Create transcription
    const createBody: any = {
      file_id,
      model: 'stt-async-preview',
      language_hints: [lang],
    }
    if (phrases.length > 0) {
      createBody.context = {
        custom_vocabulary: phrases.map(phrase => ({ phrase })),
      }
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

    // 3. Poll for result
    for (let retries = 0; retries < 60; retries++) {
      await new Promise(resolve => setTimeout(resolve, 2000))

      const statusResponse = await fetch(`${BASE_URL}/transcriptions/${transcription_id}`, {
        headers: { 'Authorization': `Bearer ${apiKey}` },
      })

      if (!statusResponse.ok) {
        throw new Error(`Soniox status check failed: ${statusResponse.statusText}`)
      }
      const statusJson = await statusResponse.json()

      if (statusJson.status === 'completed') {
        break
      }
      if (statusJson.status === 'error') {
        throw new Error(`Soniox transcription failed: ${statusJson.error_type || ''} - ${statusJson.error_message || ''}`)
      }
    }

    // 4. Retrieve transcript text
    const transcriptResponse = await fetch(`${BASE_URL}/transcriptions/${transcription_id}/transcript`, {
      headers: { 'Authorization': `Bearer ${apiKey}` },
    })

    if (!transcriptResponse.ok) {
      throw new Error(`Soniox transcript retrieval failed: ${transcriptResponse.statusText}`)
    }
    const transcriptJson = await transcriptResponse.json()
    return { text: transcriptJson.text || '' }
  }

  startStreaming(model: string, callback: StreamingCallback): Promise<void> {
    this.cleanupConnection()

    const apiKey = this.getApiKey()
    if (!apiKey) {
      const errorMsg = 'Missing Soniox API key in settings'
      callback({ type: 'error', status: 'not_authorized', error: errorMsg })
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
        const phrases = this.config.stt.vocabulary?.map((v: Vocabulary) => v.text).filter(v => v.trim()) || []

        const configMsg: any = {
          api_key: apiKey,
          model: 'stt-rt-preview',
          audio_format: 'pcm_s16le',
          sample_rate: 16000,
          num_channels: 1,
          language_hints: [lang],
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

        if (data.error_code) {
          callback({ type: 'error', status: 'error', error: `Soniox: ${data.error_message || 'Unknown error'}` })
          this.cleanupConnection()
          return
        }

        if (data.tokens) {
          this.nonFinalPart = ''
          for (const token of data.tokens) {
            if (token.is_final) {
              this.fullTranscript += token.text || ''
            } else {
              this.nonFinalPart += token.text || ''
            }
          }
          callback({ type: 'text', content: this.fullTranscript + this.nonFinalPart })
        }

        if (data.finished) {
          callback({ type: 'status', status: 'done' })
        }
      }

      this.ws.onerror = () => {
        callback({ type: 'error', status: 'error', error: 'Soniox connection error' })
        this.cleanupConnection()
        reject(new Error('WebSocket error'))
      }

      this.ws.onclose = () => {
        this.cleanupConnection()
      }
    })
  }

  async sendAudioChunk(chunk: Blob | ArrayBuffer): Promise<void> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return
    }
    try {
      let audioData: ArrayBuffer
      if (chunk instanceof Blob) {
        audioData = await chunk.arrayBuffer()
      } else {
        audioData = chunk
      }

      this.ws.send(audioData)
    } catch (error) {
      console.error('Soniox: Failed to send audio chunk', error)
    }
  }

  async endStreaming(): Promise<void> {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      // Signal end of audio stream with empty message
      this.ws.send('')
      this.ws.close()
    }
    this.cleanupConnection()
  }
}
