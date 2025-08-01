<template>
  <div class="form form-vertical form-large">
    <div class="form-field">
      <label>{{ t('settings.engines.apiKey') }}</label>
      <div class="form-subgroup">
        <InputObfuscated v-model="apiKey" @blur="onKeyChange" />
        <a href="https://llama.developer.meta.com/api-keys/" target="_blank">{{ t('settings.engines.getApiKey') }}</a>
      </div>
    </div>
    <div class="form-field">
      <label>{{ t('settings.engines.chatModel') }}</label>
      <div class="form-subgroup">
        <div class="control-group">
          <ModelSelectPlus v-model="chat_model" :models="chat_models" :height="300" :disabled="chat_models.length == 0" @change="save" />
          <RefreshButton :on-refresh="getModels" />
        </div>
        <a href="https://llama.developer.meta.com/docs/models" target="_blank">{{ t('settings.engines.meta.aboutModels') }}</a><br/>
        <a href="https://llama.developer.meta.com/rate-limit" target="_blank">{{ t('settings.engines.meta.pricing') }}</a>
      </div>
    </div>
    <div class="form-field">
      <label>{{ t('settings.engines.vision.model') }}</label>
      <ModelSelectPlus v-model="vision_model" :models="vision_models" :disabled="vision_models.length == 0" @change="save" />
    </div>
    <div class="form-field horizontal">
      <input type="checkbox" name="disableTools" v-model="disableTools" @change="save" />
      <label>{{  t('settings.engines.disableTools') }}</label>
    </div>
  </div>
</template>

<script setup lang="ts">

import { computed, ref } from 'vue'
import { store } from '../services/store'
import { t } from '../services/i18n'
import LlmFactory from '../llms/llm'
import Dialog from '../composables/dialog'
import RefreshButton from '../components/RefreshButton.vue'
import ModelSelectPlus from '../components/ModelSelectPlus.vue'
import InputObfuscated from '../components/InputObfuscated.vue'
import { ChatModel, defaultCapabilities } from 'multi-llm-ts'

const apiKey = ref(null)
const disableTools = ref(false)
const chat_model = ref<string>(null)
const vision_model = ref<string>(null)
const chat_models = ref<ChatModel[]>([])

const vision_models = computed(() => {
  return [
    { id: '', name: t('settings.engines.vision.noFallback'), ...defaultCapabilities },
    ...chat_models.value.filter(model => model.capabilities?.vision)
  ]
})

const load = () => {
  apiKey.value = store.config.engines.meta?.apiKey || ''
  chat_models.value = store.config.engines.meta?.models?.chat || []
  chat_model.value = store.config.engines.meta?.model?.chat || ''
  vision_model.value = store.config.engines.meta?.model?.vision || ''
  disableTools.value = store.config.engines.meta?.disableTools || false
}

const getModels = async (): Promise<boolean> => {

  // load
  const llmManager = LlmFactory.manager(store.config)
  let success = await llmManager.loadModels('meta')
  if (!success) {
    Dialog.alert(t('common.errorModelRefresh'))
    return false
  }

  // reload
  load()

  // done
  return true

}

const onKeyChange = () => {
  if (chat_models.value.length === 0 && apiKey.value.length > 0) {
    store.config.engines.meta.apiKey = apiKey.value
    getModels()
  }
  save()
}

const save = () => {
  store.config.engines.meta.apiKey = apiKey.value
  store.config.engines.meta.model.chat = chat_model.value
  store.config.engines.meta.model.vision = vision_model.value
  store.config.engines.meta.disableTools = disableTools.value
  store.saveSettings()
}

defineExpose({ load })

</script>

