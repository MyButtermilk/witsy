import { beforeEach, expect, test, vi } from 'vitest'
import { useBrowserMock } from '../mocks/window'

vi.mock('fix-webm-duration', () => ({
  default: vi.fn(async (blob: Blob) => blob)
}))

import fixWebmDuration from 'fix-webm-duration'
import useAudioRecorder from '../../src/composables/audio_recorder'

beforeEach(() => {
  useBrowserMock()
  vi.clearAllMocks()
})

test('fixes webm duration when recording stops', async () => {
  const listener = {
    onNoiseDetected: vi.fn(),
    onSilenceDetected: vi.fn(),
    onRecordingComplete: vi.fn(),
    onAudioChunk: vi.fn()
  }

  const recorder = useAudioRecorder({ stt: {} } as any)
  await recorder.initialize({ listener, pcm16bitStreaming: false })

  recorder.start()
  const chunk = new Blob(['test'], { type: 'audio/webm' })
  recorder.mediaRecorder.mimeType = 'audio/webm'
  recorder.mediaRecorder.ondataavailable({ data: chunk } as any)

  recorder.stop()
  await recorder.mediaRecorder.onstop()

  expect(fixWebmDuration).toHaveBeenCalled()
  expect(listener.onRecordingComplete).toHaveBeenCalledWith([chunk], false)
})
