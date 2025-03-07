
import { vi, beforeAll, beforeEach, expect, test, afterEach } from 'vitest'
import { enableAutoUnmount, mount, VueWrapper } from '@vue/test-utils'
import { useWindowMock, useBrowserMock } from '../mocks/window'
import LlmMock, { setLlmDefaults } from '../mocks/llm'
import { store } from '../../src/services/store'
import { Expert } from '../../src/types'
import Attachment from '../../src/models/attachment'
import Prompt, { SendPromptParams } from '../../src/components/Prompt.vue'
import PromptAnywhere from '../../src/screens/PromptAnywhere.vue'
import MessageItem from '../../src/components/MessageItem.vue'
import Generator from '../../src/services/generator'
import Message from '../../src/models/message'
import LlmFactory from '../../src/llms/llm'

import useEventBus  from '../../src/composables/event_bus'
import EngineModelPicker from '../../src/screens/EngineModelPicker.vue'
const { emitEvent } = useEventBus()

// mock llm
vi.mock('../../src/llms/llm.ts', async () => {
  const LlmFactory = vi.fn()
  LlmFactory.prototype.initModels = vi.fn()
  LlmFactory.prototype.isEngineReady = vi.fn(() => true)
  LlmFactory.prototype.getEngineName = () => 'mock'
  LlmFactory.prototype.getCustomEngines = () => []
  LlmFactory.prototype.getFavoriteId = () => 'favid'
  LlmFactory.prototype.getChatModels = vi.fn(() => [{ id: 'chat', name: 'chat' }])
  LlmFactory.prototype.getChatEngineModel = () => ({ engine: 'mock', model: 'chat' })
  LlmFactory.prototype.igniteEngine = vi.fn(() => new LlmMock(store.config.engines.mock))
	return { default: LlmFactory, favoriteMockEngine: '__favorites__' }
})

enableAutoUnmount(afterEach)

beforeAll(() => {
  Generator.addDateAndTimeToSystemInstr = false
  useWindowMock({ modelDefaults: true })
  useBrowserMock()
  store.loadSettings()
  store.loadExperts()
})

beforeEach(() => {
  vi.clearAllMocks()
})

const prompt = async (attachment: Attachment|null = null, docrepo: string|null = null, expert: Expert|null = null) => {
  const wrapper: VueWrapper<any> = mount(PromptAnywhere)
  wrapper.vm.onShow()
  await wrapper.vm.$nextTick()
  emitEvent('send-prompt', { prompt: 'Hello LLM', attachment, docrepo, expert } as SendPromptParams)
  await vi.waitUntil(async () => !wrapper.vm.chat.lastMessage().transient)
  return wrapper
}

test('Renders correctly', () => {
  const wrapper: VueWrapper<any> = mount(PromptAnywhere)
  expect(wrapper.exists()).toBe(true)
  expect(wrapper.find('.anywhere').exists()).toBe(true)
  expect(wrapper.findComponent(Prompt).exists()).toBe(true)
  expect(wrapper.find('.response').exists()).toBe(false)
  expect(wrapper.findComponent(MessageItem).exists()).toBe(false)
})

test('Initalizes LLM and chat without defaults', async () => {
  const wrapper: VueWrapper<any> = mount(PromptAnywhere)
  store.config.llm.defaults = []
  wrapper.vm.onShow()
  await wrapper.vm.$nextTick()
  expect(wrapper.vm.llm).toBeDefined()
  expect(wrapper.vm.llm.getName()).toBe('mock')
  expect(wrapper.vm.chat.engine).toBe('mock')
  expect(wrapper.vm.chat.model).toBe('chat')
  expect(wrapper.vm.chat.disableTools).toBe(false)
  expect(wrapper.vm.chat.modelOpts).not.toBeDefined()
  expect(wrapper.vm.chat.messages).toHaveLength(0)
})

test('Initalizes LLM and chat with defaults', async () => {
  const wrapper: VueWrapper<any> = mount(PromptAnywhere)
  setLlmDefaults('mock', 'chat')
  wrapper.vm.onShow()
  await wrapper.vm.$nextTick()
  expect(wrapper.vm.llm).toBeDefined()
  expect(wrapper.vm.llm.getName()).toBe('mock')
  expect(wrapper.vm.chat.engine).toBe('mock')
  expect(wrapper.vm.chat.model).toBe('chat')
  expect(wrapper.vm.chat.disableTools).toBe(true)
  expect(wrapper.vm.chat.modelOpts).toBeDefined()
  expect(wrapper.vm.chat.messages).toHaveLength(0)
})

test('Initalizes Expert', async () => {
  const wrapper: VueWrapper<any> = mount(PromptAnywhere)
  wrapper.vm.onShow({ sourceApp: { id: 'app' } })
  await wrapper.vm.$nextTick()
  expect((wrapper.findComponent(Prompt).vm as unknown as typeof Prompt).expert).toStrictEqual(store.experts[2])
})

test('Closes when click on container', async () => {
  const wrapper: VueWrapper<any> = mount(PromptAnywhere)
  await wrapper.find('.prompt').trigger('mousedown')
  await wrapper.find('.container').trigger('mouseup')
  expect(window.api.anywhere.close).not.toHaveBeenCalled()
  await wrapper.find('.container').trigger('mousedown')
  await wrapper.find('.container').trigger('mouseup')
  expect(window.api.anywhere.close).toHaveBeenCalled()
})

test('Changes engine model', async () => {
  const wrapper: VueWrapper<any> = mount(PromptAnywhere)
  wrapper.vm.onShow()
  await wrapper.vm.$nextTick()
  wrapper.findComponent(EngineModelPicker).vm.$emit('save', { engine: 'openai', model: 'chat2' })
  await wrapper.vm.$nextTick()
  expect(LlmFactory.prototype.igniteEngine).toHaveBeenLastCalledWith('openai')
  expect(wrapper.vm.chat.engine).toBe('openai')
  expect(wrapper.vm.chat.model).toBe('chat2')
})

test('Renders prompt response', async () => {
  const wrapper: VueWrapper<any> = mount(PromptAnywhere)
  wrapper.vm.response = new Message('assistant', 'This is a response')
  await wrapper.vm.$nextTick()
  expect(wrapper.find('.response').exists()).toBe(true)
  expect(wrapper.findComponent(MessageItem).exists()).toBe(true)
  expect(wrapper.find('.response .copy').exists()).toBe(true)
  expect(wrapper.find('.response .insert').exists()).toBe(true)
  expect(wrapper.find('.response .replace').exists()).toBe(false)
  expect(wrapper.find('.response .read').exists()).toBe(true)
  expect(wrapper.find('.response .continue').exists()).toBe(true)
  expect(wrapper.find('.response .scratchpad').exists()).toBe(true)
})

test('Submits prompt', async () => {
  const wrapper = await prompt()
  expect(wrapper.findComponent(Prompt).vm.getPrompt()).toBe('')
  expect(wrapper.findComponent(MessageItem).text()).toBe('[{"role":"system","content":"instructions.default"},{"role":"user","content":"Hello LLM"},{"role":"assistant","content":"Be kind. Don\'t mock me"}]')
})

test('Submits system prompt with params', async () => {
  const wrapper = await prompt(new Attachment('file', 'text/plain'), null, store.experts[0])
  expect(wrapper.findComponent(Prompt).vm.getPrompt()).toBe('')
  expect(wrapper.findComponent(MessageItem).text()).toBe('[{"role":"system","content":"instructions.default"},{"role":"user","content":"experts.experts.uuid1.prompt\\nHello LLM (file_decoded)"},{"role":"assistant","content":"Be kind. Don\'t mock me"}]')
})

test('Submits system user with params', async () => {
  const wrapper = await prompt(new Attachment('file', 'text/plain'), null, store.experts[2])
  expect(wrapper.findComponent(Prompt).vm.getPrompt()).toBe('')
  expect(wrapper.findComponent(MessageItem).text()).toBe('[{"role":"system","content":"instructions.default"},{"role":"user","content":"prompt3\\nHello LLM (file_decoded)"},{"role":"assistant","content":"Be kind. Don\'t mock me"}]')
})

test('Does not execute command response', async () => {
  // will execute the prompt returned by window mock ("text")
  const wrapper: VueWrapper<any> = mount(PromptAnywhere)
  wrapper.vm.onShow({ promptId: 'whatever', engine: 'mock', model: 'chat', execute: false, replace: true })
  await wrapper.vm.$nextTick()
  expect(wrapper.findComponent(Prompt).vm.getPrompt()).toBe('text')
  expect(wrapper.find('.response').exists()).toBe(false)
})

test('Executes command response', async () => {
  // will execute the prompt returned by window mock ("text")
  const wrapper: VueWrapper<any> = mount(PromptAnywhere)
  wrapper.vm.onShow({ promptId: 'whatever', engine: 'mock', model: 'chat', execute: true, replace: true })
  await wrapper.vm.$nextTick()
  await vi.waitUntil(async () => !wrapper.vm.chat.lastMessage().transient)
  await wrapper.vm.$nextTick()
  expect(wrapper.findComponent(Prompt).vm.getPrompt()).toBe('')
  expect(wrapper.find('.response').exists()).toBe(true)
  expect(wrapper.findComponent(MessageItem).exists()).toBe(true)
  expect(wrapper.findComponent(MessageItem).text()).toBe('[{"role":"system","content":"instructions.default"},{"role":"user","content":"text"},{"role":"assistant","content":"Be kind. Don\'t mock me"}]')
  expect(wrapper.find('.response .copy').exists()).toBe(true)
  expect(wrapper.find('.response .insert').exists()).toBe(true)
  expect(wrapper.find('.response .replace').exists()).toBe(true)
  expect(wrapper.find('.response .read').exists()).toBe(true)
  expect(wrapper.find('.response .continue').exists()).toBe(true)
  expect(wrapper.find('.response .scratchpad').exists()).toBe(true)
  expect(wrapper.find('.response .retry').exists()).toBe(true)
})

test('Copies response', async () => {
  const wrapper: VueWrapper<any> = mount(PromptAnywhere)
  wrapper.vm.response = new Message('assistant', 'This is a response')
  await wrapper.vm.$nextTick()
  wrapper.find('.copy').trigger('click')
  expect(window.api.clipboard.writeText).toHaveBeenLastCalledWith('This is a response')
})

test('Replaces always when only insert available', async () => {
  const wrapper: VueWrapper<any> = mount(PromptAnywhere, { props: { extra: { sourceApp: { id: 'appId', name: 'appName', path: 'appPath' } } } })
  wrapper.vm.response = new Message('assistant', 'This is a response')
  await wrapper.vm.$nextTick()
  await wrapper.find('.insert').trigger('click')
  expect(window.api.automation.replace).toHaveBeenLastCalledWith('This is a response', { id: 'appId', name: 'appName', path: 'appPath' })
})

test('Replaces always when only insert available', async () => {
  const wrapper: VueWrapper<any> = mount(PromptAnywhere, { props: { extra: { replace: true, sourceApp: { id: 'appId', name: 'appName', path: 'appPath' } } } })
  wrapper.vm.response = new Message('assistant', 'This is a response')
  await wrapper.vm.$nextTick()
  await wrapper.find('.insert').trigger('click')
  expect(window.api.automation.insert).toHaveBeenLastCalledWith('This is a response', { id: 'appId', name: 'appName', path: 'appPath' })
  await wrapper.find('.replace').trigger('click')
  expect(window.api.automation.replace).toHaveBeenLastCalledWith('This is a response', { id: 'appId', name: 'appName', path: 'appPath' })
})

test('Closes when click on icon', async () => {
  const wrapper: VueWrapper<any> = mount(PromptAnywhere, { props: { extra: { replace: true, sourceApp: { id: 'appId', name: 'appName', path: 'appPath' } } } })
  wrapper.vm.response = new Message('assistant', 'This is a response')
  await wrapper.vm.$nextTick()
  wrapper.find('.close').trigger('click')
  expect(window.api.anywhere.close).toHaveBeenLastCalledWith({ id: 'appId', name: 'appName', path: 'appPath' })
})

test('Manages conversation', async () => {
  const wrapper = await prompt()
  expect(wrapper.findComponent(MessageItem).text()).toBe('[{"role":"system","content":"instructions.default"},{"role":"user","content":"Hello LLM"},{"role":"assistant","content":"Be kind. Don\'t mock me"}]')
  emitEvent('send-prompt', { prompt: 'Bye LLM' })
  await vi.waitUntil(async () => !wrapper.vm.chat.lastMessage().transient)
  expect(wrapper.findComponent(MessageItem).text()).toBe('[{"role":"system","content":"instructions.default"},{"role":"user","content":"Hello LLM"},{"role":"assistant","content":"[{"role":"system","content":"instructions.default"},{"role":"user","content":"Hello LLM"},{"role":"assistant","content":"Be kind. Don\'t mock me"}]"},{"role":"user","content":"Bye LLM"},{"role":"assistant","content":"Be kind. Don\'t mock me"}]')
})

test('Resets chat with defaults', async () => {
  const wrapper = await prompt()
  setLlmDefaults('mock', 'chat')
  expect(wrapper.findComponent(MessageItem).text()).toBe('[{"role":"system","content":"instructions.default"},{"role":"user","content":"Hello LLM"},{"role":"assistant","content":"Be kind. Don\'t mock me"}]')
  wrapper.find('.clear').trigger('click')
  await wrapper.vm.$nextTick()
  expect(wrapper.vm.chat.messages).toHaveLength(0)
  expect(wrapper.vm.chat.engine).toBe('mock')
  expect(wrapper.vm.chat.model).toBe('chat')
  expect(wrapper.vm.chat.disableTools).toBe(true)
  expect(wrapper.vm.chat.modelOpts).toBeDefined()
  expect(wrapper.findComponent(MessageItem).exists()).toBeFalsy()
  expect(wrapper.findComponent(Prompt).vm.getPrompt()).toBe('')
  emitEvent('send-prompt', { prompt: 'Bye LLM' })
  await vi.waitUntil(async () => !wrapper.vm.chat.lastMessage().transient)
  expect(wrapper.findComponent(MessageItem).text()).toBe('[{"role":"system","content":"instructions.default"},{"role":"user","content":"Bye LLM"},{"role":"assistant","content":"Be kind. Don\'t mock me"}]')
})

test('Brings back chat', async () => {
  const wrapper: VueWrapper<any> = mount(PromptAnywhere)
  wrapper.vm.onShow()
  await wrapper.vm.$nextTick()
  const chatId = wrapper.vm.chat.uuid
  emitEvent('send-prompt', { prompt: 'Hello LLM' })
  await vi.waitUntil(async () => !wrapper.vm.chat.lastMessage().transient)
  wrapper.find('.close').trigger('click')
  wrapper.vm.onShow()
  expect(wrapper.vm.chat.uuid).toBe(chatId)
})

test('Saves chat', async () => {
  const wrapper = await prompt()
  expect(wrapper.vm.chat.title).toBeNull()
  wrapper.find('.continue').trigger('click')
  await wrapper.vm.$nextTick()
  expect(wrapper.vm.chat.title).not.toBeNull()
  expect(store.history.chats).toHaveLength(1)
  expect(window.api.history.save).toHaveBeenCalled()
  //expect(window.api.chat.open).toHaveBeenLastCalledWith(chatId)
})

test('Auto saves chat', async () => {
  const wrapper: VueWrapper<any> = mount(PromptAnywhere)
  store.config.prompt.autosave = true
  wrapper.vm.onShow()
  await wrapper.vm.$nextTick()
  emitEvent('send-prompt', { prompt: 'Hello LLM' })
  await vi.waitUntil(async () => !wrapper.vm.chat.lastMessage().transient)
  expect(wrapper.vm.chat.title).not.toBeNull()
  expect(store.history.chats).toHaveLength(1)
  expect(window.api.history.save).toHaveBeenCalled()
})

test('Supports keyboard copy', async () => {
  await prompt()
  document.dispatchEvent(new KeyboardEvent('keydown', { metaKey: true, key: 'c' }));
  expect(window.api.clipboard?.writeText).toHaveBeenCalled()
})

test('Supports keyboard insert', async () => {
  await prompt()
  document.dispatchEvent(new KeyboardEvent('keydown', { metaKey: true, key: 'i' }));
  expect(window.api.automation.replace).toHaveBeenCalled()
})

test('Supports keyboard save', async () => {
  const wrapper = await prompt()
  document.dispatchEvent(new KeyboardEvent('keydown', { metaKey: true, key: 's' }));
  await wrapper.vm.$nextTick()
  expect(window.api.history?.save).toHaveBeenCalled()
  await wrapper.vm.$nextTick()
  expect(window.api.chat?.open).toHaveBeenCalled()
})

test('Supports keyboard clear with X', async () => {
  const wrapper = await prompt()
  expect(wrapper.vm.response).not.toBeNull()
  document.dispatchEvent(new KeyboardEvent('keydown', { metaKey: true, key: 'x' }));
  expect(wrapper.vm.response).toBeNull()
})

test('Supports keyboard clear with escape', async () => {
  const wrapper = await prompt()
  expect(wrapper.vm.response).not.toBeNull()
  document.dispatchEvent(new KeyboardEvent('keydown', { metaKey: true, key: 'Escape' }));
  expect(wrapper.vm.response).toBeNull()
})

test('Supports keyboard close', async () => {
  await prompt()
  document.dispatchEvent(new KeyboardEvent('keyup', { key: 'Escape' }));
  expect(window.api.anywhere.close).toHaveBeenCalled()
})
