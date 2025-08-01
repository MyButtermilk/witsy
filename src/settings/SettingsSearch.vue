<template>
  <div class="form form-vertical form-large">

    <div class="description">
      {{ t('settings.plugins.search.description') }}
    </div>

    <div class="form-field horizontal">
      <input type="checkbox" name="enabled" v-model="enabled" @change="save" />
      <label>{{ t('common.enabled') }}</label>
    </div>

    <div class="form-field">
      <label>{{ t('settings.plugins.search.engine') }}</label>
      <select v-model="engine" name="engine" @change="save">
        <option value="local">{{ t('settings.plugins.search.engines.local') }}</option>
        <option value="exa">Exa</option>
        <option value="brave">Brave</option>
        <option value="tavily">Tavily</option>
      </select>
    </div>

    <div class="form-field" v-if="engine == 'exa'">
      <label>{{ t('settings.plugins.search.exaApiKey') }}</label>
      <div class="form-subgroup">
        <InputObfuscated v-model="exaApiKey" name="exaApiKey" @change="save" />
        <a href="https://dashboard.exa.ai/home" target="_blank">{{ t('settings.plugins.search.getApiKey') }}</a>
      </div>
    </div>

    <div class="form-field" v-if="engine == 'tavily'">
      <label>{{ t('settings.plugins.search.tavilyApiKey') }}</label>
      <div class="form-subgroup">
        <InputObfuscated v-model="tavilyApiKey" name="tavilyApiKey" @change="save" />
        <a href="https://app.tavily.com/home" target="_blank">{{ t('settings.plugins.search.getApiKey') }}</a>
      </div>
    </div>

    <div class="form-field" v-if="engine == 'brave'">
      <label>{{ t('settings.plugins.search.braveApiKey') }}</label>
      <div class="form-subgroup">
        <InputObfuscated v-model="braveApiKey" name="braveApiKey" @change="save" />
        <a href="https://brave.com/search/api/" target="_blank">{{ t('settings.plugins.search.getApiKey') }}</a>
      </div>
    </div>

    <div class="form-field">
      <label>{{ t('settings.plugins.search.contentLength') }}</label>
      <div class="form-subgroup">
        <div>{{ t('settings.plugins.search.truncateTo') }}&nbsp; <input type="text" name="contentLength" v-model="contentLength" @change="save" />&nbsp; {{ t('settings.plugins.search.characters') }}</div>
        <p>{{ t('settings.plugins.search.truncationWarning') }}</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">

import { ref } from 'vue'
import { store } from '../services/store'
import { t } from '../services/i18n'
import InputObfuscated from '../components/InputObfuscated.vue'

const enabled = ref(false)
const engine = ref('local')
const contentLength = ref(0)
const tavilyApiKey = ref(null)
const braveApiKey = ref(null)
const exaApiKey = ref(null)

const load = () => {
  enabled.value = store.config.plugins.search.enabled || false
  engine.value = store.config.plugins.search.engine || 'local'
  contentLength.value = store.config.plugins.search.contentLength ?? 4096
  tavilyApiKey.value = store.config.plugins.search.tavilyApiKey || ''
  braveApiKey.value = store.config.plugins.search.braveApiKey || ''
  exaApiKey.value = store.config.plugins.search.exaApiKey || ''
}

const save = () => {
  store.config.plugins.search.enabled = enabled.value
  store.config.plugins.search.engine = engine.value
  store.config.plugins.search.contentLength = parseInt(contentLength.value.toString()) ?? 4096
  store.config.plugins.search.tavilyApiKey = tavilyApiKey.value
  store.config.plugins.search.braveApiKey = braveApiKey.value
  store.config.plugins.search.exaApiKey = exaApiKey.value
  store.saveSettings()
}

defineExpose({ load })

</script>


<style scoped>

.form .form-field .form-subgroup input {
  width: 40px;
}

</style>
