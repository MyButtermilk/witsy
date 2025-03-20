
import { beforeAll, expect, test } from 'vitest'
import { useWindowMock } from '../mocks/window'
import { Anthropic, Ollama, Google, Groq, XAI, Cerebras, MistralAI, DeepSeek, OpenRouter } from 'multi-llm-ts'
import OpenAI from '../../src/llms/openai'
import LlmFactory, { standardEngines, nonChatEngines, favoriteMockEngine } from '../../src/llms/llm'
import { store } from '../../src/services/store'
import defaults from '../../defaults/settings.json'

beforeAll(() => {
  useWindowMock({ customEngine: true, favoriteModels: true })
  store.loadSettings()
  store.config.engines.openai.apiKey = '123'
})

const llmFactory = new LlmFactory(store.config)

const model = { id: 'model-id', name: 'model-name', meta: {} }

test('Custom Engine', () => {
  for (const engine of standardEngines) {
    expect(llmFactory.isCustomEngine(engine)).toBe(false)
  }
  for (const engine of nonChatEngines) {
    expect(llmFactory.isCustomEngine(engine)).toBe(false)
  }
  expect(llmFactory.isCustomEngine('__favorites__')).toBe(false)
  expect(llmFactory.isCustomEngine('aws')).toBe(false)
  expect(llmFactory.isCustomEngine('custom')).toBe(true)
})

test('Get Engines', () => {
  expect(llmFactory.getChatEngines()).toStrictEqual([favoriteMockEngine, ...standardEngines, 'custom'])
  expect(llmFactory.getCustomEngines()).toStrictEqual(['custom'])
})

test('Get Engine name', () => {
  expect(llmFactory.getEngineName('openai')).toBe('openai')
  expect(llmFactory.getEngineName('custom')).toBe('custom_engine')
  expect(llmFactory.getEngineName('unknown')).toBe('custom')
})

test('Default Configuration', () => {
  expect(llmFactory.isEngineReady('openai')).toBe(true)
  expect(llmFactory.isEngineReady('ollama')).toBe(false)
  expect(llmFactory.isEngineReady('mistralai')).toBe(false)
  expect(llmFactory.isEngineReady('anthropic')).toBe(false)
  expect(llmFactory.isEngineReady('google')).toBe(false)
  expect(llmFactory.isEngineReady('xai')).toBe(false)
  expect(llmFactory.isEngineReady('deepseek')).toBe(false)
  expect(llmFactory.isEngineReady('openrouter')).toBe(false)
  expect(llmFactory.isEngineReady('groq')).toBe(false)
  expect(llmFactory.isEngineReady('cerebras')).toBe(false)
  expect(llmFactory.isEngineReady('aws')).toBe(false)
  expect(llmFactory.isEngineReady('custom')).toBe(true)
})

test('OpenAI Configuration', () => {
  expect(llmFactory.isEngineConfigured('openai')).toBe(true)
  expect(llmFactory.isEngineReady('openai')).toBe(true)
  store.config.engines.openai.apiKey = '123'
  expect(llmFactory.isEngineReady('openai')).toBe(true)
  store.config.engines.openai.models.chat = [model]
  expect(llmFactory.isEngineReady('openai')).toBe(true)
})

test('Ollama Configuration', () => {
  expect(llmFactory.isEngineConfigured('ollama')).toBe(true)
  store.config.engines.ollama.models.image = [model]
  expect(llmFactory.isEngineReady('ollama')).toBe(false)
  store.config.engines.ollama.models.chat = [model]
  expect(llmFactory.isEngineReady('ollama')).toBe(true)
})

test('MistralAI Configuration', () => {
  expect(llmFactory.isEngineConfigured('mistralai')).toBe(false)
  store.config.engines.mistralai.apiKey = '123'
  expect(llmFactory.isEngineConfigured('mistralai')).toBe(true)
  expect(llmFactory.isEngineReady('mistralai')).toBe(false)
  store.config.engines.mistralai.models.image = [model]
  expect(llmFactory.isEngineReady('mistralai')).toBe(false)
  store.config.engines.mistralai.models.chat = [model]
  expect(llmFactory.isEngineReady('mistralai')).toBe(true)
})

test('Anthropic Configuration', () => {
  expect(llmFactory.isEngineConfigured('anthropic')).toBe(false)
  store.config.engines.anthropic.models.image = [model]
  expect(llmFactory.isEngineReady('anthropic')).toBe(false)
  store.config.engines.anthropic.models.chat = [model]
  expect(llmFactory.isEngineReady('anthropic')).toBe(false)
  expect(llmFactory.isEngineConfigured('anthropic')).toBe(false)
  store.config.engines.anthropic.apiKey = '123'
  expect(llmFactory.isEngineConfigured('anthropic')).toBe(true)
  expect(llmFactory.isEngineReady('anthropic')).toBe(true)
})

test('Google Configuration', () => {
  expect(llmFactory.isEngineConfigured('google')).toBe(false)
  store.config.engines.google.models.image = [model]
  expect(llmFactory.isEngineReady('google')).toBe(false)
  store.config.engines.google.models.chat = [model]
  expect(llmFactory.isEngineReady('google')).toBe(false)
  store.config.engines.google.apiKey = '123'
  expect(llmFactory.isEngineConfigured('google')).toBe(true)
  expect(llmFactory.isEngineReady('google')).toBe(true)
})

test('xAI Configuration', () => {
  expect(llmFactory.isEngineConfigured('xai')).toBe(false)
  store.config.engines.xai.models.image = [model]
  expect(llmFactory.isEngineReady('xai')).toBe(false)
  store.config.engines.xai.models.chat = [model]
  expect(llmFactory.isEngineReady('xai')).toBe(false)
  expect(llmFactory.isEngineConfigured('xai')).toBe(false)
  store.config.engines.xai.apiKey = '123'
  expect(llmFactory.isEngineConfigured('xai')).toBe(true)
  expect(llmFactory.isEngineReady('xai')).toBe(true)
})

test('DeepSeek Configuration', () => {
  expect(llmFactory.isEngineConfigured('deepseek')).toBe(false)
  store.config.engines.deepseek.models.image = [model]
  expect(llmFactory.isEngineReady('deepseek')).toBe(false)
  store.config.engines.deepseek.models.chat = [model]
  expect(llmFactory.isEngineReady('deepseek')).toBe(false)
  expect(llmFactory.isEngineConfigured('deepseek')).toBe(false)
  store.config.engines.deepseek.apiKey = '123'
  expect(llmFactory.isEngineConfigured('deepseek')).toBe(true)
  expect(llmFactory.isEngineReady('deepseek')).toBe(true)
})

test('OpenRouter Configuration', () => {
  expect(llmFactory.isEngineConfigured('openrouter')).toBe(false)
  store.config.engines.openrouter.models.image = [model]
  expect(llmFactory.isEngineReady('openrouter')).toBe(false)
  store.config.engines.openrouter.models.chat = [model]
  expect(llmFactory.isEngineReady('openrouter')).toBe(false)
  expect(llmFactory.isEngineConfigured('openrouter')).toBe(false)
  store.config.engines.openrouter.apiKey = '123'
  expect(llmFactory.isEngineConfigured('openrouter')).toBe(true)
  expect(llmFactory.isEngineReady('openrouter')).toBe(true)
})

test('Groq Configuration', () => {
  expect(llmFactory.isEngineConfigured('groq')).toBe(false)
  store.config.engines.groq.models.image = [model]
  expect(llmFactory.isEngineReady('groq')).toBe(false)
  store.config.engines.groq.models.chat = [model]
  expect(llmFactory.isEngineReady('groq')).toBe(false)
  expect(llmFactory.isEngineConfigured('groq')).toBe(false)
  store.config.engines.groq.apiKey = '123'
  expect(llmFactory.isEngineConfigured('groq')).toBe(true)
  expect(llmFactory.isEngineReady('groq')).toBe(true)
})

test('Cerebras Configuration', () => {
  expect(llmFactory.isEngineConfigured('cerebras')).toBe(false)
  store.config.engines.cerebras.models.image = [model]
  expect(llmFactory.isEngineReady('cerebras')).toBe(false)
  store.config.engines.cerebras.models.chat = [model]
  expect(llmFactory.isEngineReady('cerebras')).toBe(false)
  expect(llmFactory.isEngineConfigured('cerebras')).toBe(false)
  store.config.engines.cerebras.apiKey = '123'
  expect(llmFactory.isEngineConfigured('cerebras')).toBe(true)
  expect(llmFactory.isEngineReady('cerebras')).toBe(true)
})

test('Custom Configuration', () => {
  expect(llmFactory.isEngineConfigured('custom')).toBe(true)
  expect(llmFactory.isEngineReady('custom')).toBe(true)
  store.config.engines.custom.models.image = [model]
  expect(llmFactory.isEngineReady('custom')).toBe(true)
})

test('Ignite Engine', async () => {
  expect(await llmFactory.igniteEngine('openai')).toBeInstanceOf(OpenAI)
  expect(await llmFactory.igniteEngine('ollama')).toBeInstanceOf(Ollama)
  expect(await llmFactory.igniteEngine('mistralai')).toBeInstanceOf(MistralAI)
  expect(await llmFactory.igniteEngine('anthropic')).toBeInstanceOf(Anthropic)
  expect(await llmFactory.igniteEngine('google')).toBeInstanceOf(Google)
  expect(await llmFactory.igniteEngine('xai')).toBeInstanceOf(XAI)
  expect(await llmFactory.igniteEngine('groq')).toBeInstanceOf(Groq)
  expect(await llmFactory.igniteEngine('cerebras')).toBeInstanceOf(Cerebras)
  expect(await llmFactory.igniteEngine('deepseek')).toBeInstanceOf(DeepSeek)
  expect(await llmFactory.igniteEngine('openrouter')).toBeInstanceOf(OpenRouter)
  expect(await llmFactory.igniteEngine('aws')).toBeInstanceOf(OpenAI)
})

test('Ignite Favorite Engine', async () => {
  store.config.llm.favorites = [ { id: '1', engine: 'anthropic', model: 'chat1' } ]
  store.config.engines[favoriteMockEngine].model.chat = '1'
  expect(await llmFactory.igniteEngine(favoriteMockEngine)).toBeInstanceOf(Anthropic)
  // fallback
  store.config.engines[favoriteMockEngine].model.chat = '2'
  expect(await llmFactory.igniteEngine(favoriteMockEngine)).toBeInstanceOf(OpenAI)
})

test('Ignite Custom Engine', async () => {
  const engine = await llmFactory.igniteEngine('custom')
  expect(engine).toBeInstanceOf(OpenAI)
  expect(engine.config.apiKey).toBe('456')
  expect(engine.config.baseURL).toBe('http://localhost/api/v1')
})

test('No vision models for custom engine', () => {
  expect(llmFactory.hasVisionModels('custom')).toBe(false)
  expect(llmFactory.isVisionModel('custom', 'vision')).toBe(false)  
})

test('Anthropic Computer Use', async () => {
  const anthropic = await llmFactory.igniteEngine('anthropic')
  expect(anthropic['computerInfo']).not.toBeNull()
})

test('Reflects configuration changes', () => {
  defaults.engines.openai.apiKey = '345'
  store.loadSettings()
  expect(llmFactory.config.engines.openai.apiKey).toBe('345')
})

test('getChatEngineModel', () => {
  store.config.llm.engine = 'mock'
  store.config.engines.mock = { model: { chat: 'chat1' } }
  expect(llmFactory.getChatEngineModel(true)).toStrictEqual({ engine: 'mock', model: 'chat1' })
  store.config.llm.engine = favoriteMockEngine
  store.config.engines[favoriteMockEngine] = { model: { chat: 'mock-chat2' } }
  expect(llmFactory.getChatEngineModel(true)).toStrictEqual({ engine: 'mock', model: 'chat2' })
})

test('Favorite engine', () => {
  expect(llmFactory.isFavoriteEngine(favoriteMockEngine)).toBe(true)
  expect(llmFactory.isFavoriteEngine('openai')).toBe(false)
  expect(llmFactory.isFavoriteEngine('mock')).toBe(false)
})

test('Favorite Ids', () => {
  expect(llmFactory.getFavoriteId('mock', 'chat')).toBe('mock-chat')
  expect(llmFactory.isFavoriteId('mock-chat1')).toBe(true)
  expect(llmFactory.isFavoriteId('mocq-chat1')).toBe(false)
  expect(llmFactory.isFavoriteId('mock-chat3')).toBe(false)
})

test('Favorite models', () => {
  
  store.config.engines['mock'] = {
    label: 'mock_label',
    model: { chat: '' }
  }

  expect(llmFactory.getChatModels(favoriteMockEngine)).toStrictEqual([
    { id: 'mock-chat1', name: 'mock_label/chat1', meta: {} },
    { id: 'mock-chat2', name: 'mock_label/chat2', meta: {} }
  ])

  expect(llmFactory.isFavoriteModel('mock', 'chat1')).toBe(true)
  expect(llmFactory.isFavoriteModel('mocq', 'chat1')).toBe(false)
  expect(llmFactory.isFavoriteModel('mock', 'chat3')).toBe(false)

  expect(llmFactory.getFavoriteModel('mock-chat1')).toStrictEqual({ engine: 'mock', model: 'chat1' })
  expect(llmFactory.getFavoriteModel('mock-chat2')).toStrictEqual({ engine: 'mock', model: 'chat2' })
  expect(llmFactory.getFavoriteModel('mocq-chat1')).toBeNull()
  expect(llmFactory.getFavoriteModel('mock-chat3')).toBeNull()

})

test('Favorites update', () => {

  store.config.engines['mock'] = {
    label: 'mock_label',
    model: { chat: '' }
  }

  llmFactory.addFavoriteModel('mock', 'chat3')
  expect(llmFactory.getChatModels(favoriteMockEngine)).toStrictEqual([
    { id: 'mock-chat1', name: 'mock_label/chat1', meta: {} },
    { id: 'mock-chat2', name: 'mock_label/chat2', meta: {} },
    { id: 'mock-chat3', name: 'mock_label/chat3', meta: {} }
  ])

  llmFactory.removeFavoriteModel(favoriteMockEngine, 'mock-chat2')
  expect(llmFactory.getChatModels(favoriteMockEngine)).toStrictEqual([
    { id: 'mock-chat1', name: 'mock_label/chat1', meta: {} },
    { id: 'mock-chat3', name: 'mock_label/chat3', meta: {} }
  ])

  llmFactory.removeFavoriteModel('mock', 'chat3')
  expect(llmFactory.getChatModels(favoriteMockEngine)).toStrictEqual([
    { id: 'mock-chat1', name: 'mock_label/chat1', meta: {} }
  ])

  store.config.llm.engine = favoriteMockEngine
  llmFactory.removeFavoriteModel('mock', 'chat1')
  expect(llmFactory.getChatModels(favoriteMockEngine)).toStrictEqual([])
  expect(store.config.llm.engine).toBe('mock')
  expect(store.config.engines['mock'].model.chat).toBe('chat1')
  
})
