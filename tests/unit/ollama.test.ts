
import { test, expect } from 'vitest'
import Ollama from '../../src/llms/ollama'

test('Ollama no keep-alive', () => {
  const ollama = new Ollama({ keepAlive: '' })
  expect(ollama.buildChatOptions({
    model: 'llama3.3:latest',
    messages: [],
    opts: null,
  })).toEqual({
    model: 'llama3.3:latest',
    messages: [],
  })
})

test('Ollama keep-alive string', () => {
  const ollama = new Ollama({ keepAlive: '10m' })
  expect(ollama.buildChatOptions({
    model: 'llama3.3:latest',
    messages: [],
    opts: null,
  })).toEqual({
    keep_alive: '10m',
    model: 'llama3.3:latest',
    messages: [],
  })
})

test('Ollama keep-alive number', () => {
  const ollama = new Ollama({ keepAlive: '3600' })
  expect(ollama.buildChatOptions({
    model: 'llama3.3:latest',
    messages: [],
    opts: null,
  })).toEqual({
    keep_alive: 3600,
    model: 'llama3.3:latest',
    messages: [],
  })
})
