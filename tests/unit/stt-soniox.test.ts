import { describe, it, expect, vi, beforeEach } from 'vitest'
import STTSoniox from '../../src/voice/stt-soniox'
import { Configuration } from '../../src/types/config'

const makeConfig = (overrides: any = {}): Configuration => ({
  stt: {
    model: 'stt-async-preview',
    vocabulary: [],
    soniox: {
      cleanup: true,
      audioFormat: 'auto',
    },
    ...overrides.stt
  },
  engines: {
    soniox: { apiKey: 'test-api-key' },
    ...overrides.engines
  },
} as any)

describe('STTSoniox', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    global.fetch = vi.fn()
  })

  describe('transcribeFile', () => {
    it('should transcribe a file successfully', async () => {
      const config = makeConfig()
      const engine = new STTSoniox(config)
      const audioFile = new File(['mock audio data'], 'coffee_shop.mp3', { type: 'audio/mpeg' })

      vi.mocked(global.fetch)
        .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'file-123' }) } as Response) // File upload
        .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'trans-456' }) } as Response) // Create transcription
        .mockResolvedValueOnce({ ok: true, json: async () => ({ status: 'completed' }) } as Response) // Poll status
        .mockResolvedValueOnce({ ok: true, json: async () => ({ text: 'Hello world' }) } as Response) // Get transcript
        .mockResolvedValue({ ok: true } as Response) // Cleanup calls

      const result = await engine.transcribeFile(audioFile)

      expect(global.fetch).toHaveBeenCalledWith('https://api.soniox.com/v1/files', expect.any(Object))
      expect(global.fetch).toHaveBeenCalledWith('https://api.soniox.com/v1/transcriptions', expect.any(Object))
      expect(global.fetch).toHaveBeenCalledWith('https://api.soniox.com/v1/transcriptions/trans-456', expect.any(Object))
      expect(global.fetch).toHaveBeenCalledWith('https://api.soniox.com/v1/transcriptions/trans-456/transcript', expect.any(Object))
      expect(result.text).toBe('Hello world')
    })

    it('should include custom vocabulary if provided', async () => {
      const config = makeConfig({
        stt: {
          vocabulary: [{ text: 'Witsy' }, { text: 'Soniox' }]
        }
      })
      const engine = new STTSoniox(config)
      const audioFile = new File(['mock audio data'], 'audio.mp3', { type: 'audio/mpeg' })

      vi.mocked(global.fetch)
        .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'file-123' }) } as Response)
        .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'trans-456' }) } as Response)
        .mockResolvedValueOnce({ ok: true, json: async () => ({ status: 'completed' }) } as Response)
        .mockResolvedValueOnce({ ok: true, json: async () => ({ text: 'Hello Witsy and Soniox' }) } as Response)
        .mockResolvedValue({ ok: true } as Response)

      await engine.transcribeFile(audioFile)

      const fetchOptions = vi.mocked(global.fetch).mock.calls[1][1]
      const body = JSON.parse(fetchOptions.body as string)
      expect(body.custom_vocabulary_phrases).toEqual(['Witsy', 'Soniox'])
    })

    it('should throw an error if API key is missing', async () => {
      const config = makeConfig({ engines: { soniox: { apiKey: '' } } })
      const engine = new STTSoniox(config)
      const audioFile = new File(['mock audio data'], 'audio.mp3', { type: 'audio/mpeg' })

      await expect(engine.transcribeFile(audioFile)).rejects.toThrow('Missing Soniox API key in settings')
    })
  })

  describe('streaming', () => {
    class MockWebSocket {
      static instances: MockWebSocket[] = []
      readyState = 0
      onopen: any = () => {}
      onmessage: any = () => {}
      onerror: any = () => {}
      onclose: any = () => {}
      sentMessages: any[] = []

      constructor(public url: string) {
        MockWebSocket.instances.push(this)
        setTimeout(() => {
          this.readyState = 1 // OPEN
          this.onopen()
        }, 10)
      }

      send(data: any) {
        this.sentMessages.push(data)
      }

      close() {
        this.readyState = 3 // CLOSED
        this.onclose()
      }

      receiveMessage(data: any) {
        this.onmessage({ data: JSON.stringify(data) })
      }
    }

    beforeEach(() => {
      MockWebSocket.instances = []
      global.WebSocket = MockWebSocket as any
    })

    it('should connect and send configuration on startStreaming', async () => {
      const config = makeConfig()
      const engine = new STTSoniox(config)
      const callback = vi.fn()

      await engine.startStreaming('stt-rt-preview', callback)

      expect(MockWebSocket.instances.length).toBe(1)
      const ws = MockWebSocket.instances[0]
      expect(ws.url).toBe('wss://stt-rt.soniox.com/transcribe-websocket')

      await vi.waitFor(() => {
        expect(ws.sentMessages.length).toBe(1)
      })

      const configMsg = JSON.parse(ws.sentMessages[0])
      expect(configMsg.api_key).toBe('test-api-key')
      expect(configMsg.model).toBe('stt-rt-preview')
      expect(callback).toHaveBeenCalledWith({ type: 'status', status: 'connected' })
    })

    it('should handle final and non-final tokens correctly', async () => {
      const config = makeConfig()
      const engine = new STTSoniox(config)
      const callback = vi.fn()

      await engine.startStreaming('stt-rt-preview', callback)
      const ws = MockWebSocket.instances[0]

      ws.receiveMessage({ tokens: [{ text: 'Hello ', is_final: false }] })
      expect(callback).toHaveBeenCalledWith({ type: 'text', content: 'Hello' })

      ws.receiveMessage({ tokens: [{ text: 'world', is_final: true }] })
      expect(callback).toHaveBeenCalledWith({ type: 'text', content: 'world Hello' })

      ws.receiveMessage({ tokens: [{ text: '.', is_final: true }] })
      expect(callback).toHaveBeenCalledWith({ type: 'text', content: 'world. Hello' })
    })

    it('should send audio chunks', async () => {
      const config = makeConfig()
      const engine = new STTSoniox(config)
      await engine.startStreaming('stt-rt-preview', vi.fn())
      const ws = MockWebSocket.instances[0]

      const chunk = new Blob(['audio data'])
      await engine.sendAudioChunk(chunk)

      await vi.waitFor(() => {
        expect(ws.sentMessages.length).toBe(2) // 1 for config, 1 for audio
      })
      const audioData = await chunk.arrayBuffer()
      expect(ws.sentMessages[1]).toEqual(audioData)
    })

    it('should send empty binary frame on endStreaming', async () => {
      const config = makeConfig()
      const engine = new STTSoniox(config)
      await engine.startStreaming('stt-rt-preview', vi.fn())
      const ws = MockWebSocket.instances[0]

      await engine.endStreaming()

      await vi.waitFor(() => {
        expect(ws.sentMessages.length).toBe(2)
      })
      expect(ws.sentMessages[1]).toEqual(new Uint8Array())
    })
  })
})
