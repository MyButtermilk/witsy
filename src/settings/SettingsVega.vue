<template>
  <div class="form form-vertical form-large">
    <div class="description">
      {{ t('settings.plugins.vega.description') }}
    </div>
    <div class="form-field horizontal">
      <input type="checkbox" v-model="enabled" @change="save" />
      <label>{{ t('common.enabled') }}</label>
    </div>
  </div>
</template>

<script setup lang="ts">

import { ref } from 'vue'
import { store } from '../services/store'
import { t } from '../services/i18n'

const enabled = ref(false)

const load = () => {
  enabled.value = store.config.plugins.vega.enabled || false
}

const save = () => {
  store.config.plugins.vega.enabled = enabled.value
  store.saveSettings()
}

defineExpose({ load })

</script>


