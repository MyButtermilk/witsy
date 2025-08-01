<template>
  <div class="empty">
    <div class="selector">
      <div class="engines">
        <EngineLogo v-for="engine in visibleEngines" :engine="engine" :grayscale="true" :custom-label="true" @click="onEngine(engine)" />
        <div class="logo more" @click="onEngineMore"><BIconPlusCircleDotted /></div>
      </div>
      <div class="current">
        <div class="tip engine" v-if="showEngineTip()">
          {{ t('emptyChat.tips.switchProvider') }}<br/>
          <img src="/assets/arrow_dashed.svg" @load="centerLogos()" />
        </div>
        <EngineLogo :engine="engine" :grayscale="true" :custom-label="true" @click="onEngine(engine)" />
        <div class="models" v-if="models?.length">
          <BIconArrowRepeat class="for=symmetry" style="visibility: hidden; margin-right: 0.5rem;" v-if="!showAllEngines && engine != favoriteMockEngine" />
          <ModelSelectPlus v-if="models?.length" :models="models" :caps-hover-only="true" v-model="model" class="select-model" :class="{ hidden: showAllEngines }" @change="onSelectModel" @click="onClickModel" />
          <BIconArrowRepeat v-if="!showAllEngines && engine != favoriteMockEngine" @click="onRefreshModels" :class="{ refresh: true, 'rotating': isRefreshing }"/>
        </div>
        <template v-else-if="!showAllEngines">
          <div class="help apiKey" v-if="!llmManager.isEngineConfigured(engine)">
            <div class="form form-vertical form-large">
              <div class="form-field">
                <label>{{ t('emptyChat.settings.needsApiKey') }}</label>
                <div class="control-group">
                  <InputObfuscated name="apiKey" v-model="apiKey"/>
                  <button name="saveApiKey" @click="saveApiKey">{{ t('common.save') }}</button>
                </div>
              </div>
            </div>
          </div>
          <div class="help loading" v-else-if="isRefreshing">
            {{ t('emptyChat.settings.refreshingModels') }}
            <BIconArrowRepeat class="refresh rotating"/>
          </div>
          <div class="help models" v-else>
            <span v-html="t('emptyChat.settings.needsModels', { engine: engine })"></span>
          </div>
        </template>
        <div class="favorite" v-if="!showModelTip() && !showAllEngines">
          <span class="action remove" @click="removeFavorite" v-if="isFavoriteModel"><BIconStarFill /> {{ t('common.favorites.remove') }}</span>
          <span class="action add" @click="addToFavorites" v-else-if="models?.length"><BIconStar /> {{ t('common.favorites.add') }}</span>
          <span class="shortcut" v-if="modelShortcut">{{ t('emptyChat.favorites.shortcut', { shortcut: modelShortcut }) }}</span>
        </div>
        <div class="tip model" v-if="showModelTip()">
          <img src="/assets/arrow_dashed.svg" @load="centerLogos()" /><br/>
          {{ t('emptyChat.tips.switchModel') }}
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">

import { ref, shallowReactive, computed, onMounted, onUnmounted, onBeforeUpdate, onUpdated } from 'vue'
import { store } from '../services/store'
import { t } from '../services/i18n'
import EngineLogo from './EngineLogo.vue'
import useTipsManager from '../composables/tips_manager'
import LlmFactory, { favoriteMockEngine } from '../llms/llm'
import ModelSelectPlus from './ModelSelectPlus.vue'
import InputObfuscated from './InputObfuscated.vue'

const tipsManager = useTipsManager(store)
const llmManager = LlmFactory.manager(store.config)

const showAllEngines = ref(false)
const engines = shallowReactive(store.config.engines)
const isRefreshing = ref(false)
const apiKey = ref('')

const visibleEngines = computed(() => {
  return llmManager.getChatEngines().filter(engine => {
    return (llmManager.getPriorityEngines().includes(engine) || llmManager.isEngineReady(engine))
  })
})

const engine = computed(() => store.config.llm.engine)
const models = computed(() => llmManager.getChatModels(engine.value))
const model = computed(() => llmManager.getDefaultChatModel(engine.value, true))
const isFavoriteModel = computed(() => llmManager.isFavoriteModel(engine.value, model.value))

const modelShortcut = computed(() => {
  const favorites = llmManager.getChatModels(favoriteMockEngine)
  const id = engine.value == favoriteMockEngine ? model.value : llmManager.getFavoriteId(engine.value, model.value)
  let index = favorites.findIndex(m => m.id === id)
  if (index < 0 || index > 9) return null
  if (index === 9) index = -1
  const mod = window.api.platform == 'darwin' ? '⌥' : 'Alt'
  return `${mod}+${String.fromCharCode(49 + index)}`
})

const showEngineTip = () => {
  return tipsManager.isTipAvailable('engineSelector') && !showAllEngines.value && Object.keys(engines).length > 1
}

const showModelTip = () => {
  return !tipsManager.isTipAvailable('engineSelector') && tipsManager.isTipAvailable('modelSelector') && !showAllEngines.value && models.value.length > 1
}

onBeforeUpdate(() => {
  if (store.config.engines[engine.value] === undefined) {
    store.config.llm.engine = 'openai'
  }
})

onMounted(() => {
  centerLogos()
  document.addEventListener('keydown', onKeyDown)
  loadApiKey()
})

onUnmounted(() => {
  document.removeEventListener('keydown', onKeyDown)
})

onUpdated(() => {
  centerLogos()
})

const loadApiKey = () => {
  apiKey.value = store.config.engines[engine.value]?.apiKey
}

const onKeyDown = (ev: KeyboardEvent) => {
  if (showAllEngines.value) return
  const favorites = llmManager.getChatModels(favoriteMockEngine)
  if (!favorites.length) return
  if (!ev.altKey) return
  let index = ev.keyCode - 49
  if (index === -1) index = 9
  if (index < 0 || index > favorites.length-1) return
  llmManager.setChatModel(favoriteMockEngine, favorites[index].id)
}

const onEngineMore = () => {
  window.api.settings.open({ initialTab: 'models' })
  onEngine(engine.value)
}

const onEngine = (engine: string) => {
  
  if (showAllEngines.value === false) {

    // show all always
    showAllEngines.value = true

    // now animate current icon to the ones in the selector
    const current = store.config.llm.engine
    animateEngineLogo(`.selector .current .logo`, `.selector .engines .logo.${current}`, (elems, progress) => {
      if (elems) {
        elems.clone.style.opacity = Math.max(0, 1 - 1.25 * progress).toString()
        elems.container.style.opacity = Math.min(1, 1.25 * (progress - 0.25)).toString()
        if (progress >= 1) {
          try { elems.clone.remove() } catch { /* empty */ }
          elems.container.style.opacity = '1'
          elems.source.parentElement.style.pointerEvents = 'none'
        }
      }
    })
  
  } else {

    // close and disable tip
    store.config.general.tips.engineSelector = false

    // select the engine
    store.config.llm.engine = engine
    store.saveSettings()

    // load api key
    loadApiKey()

    // can we try and load models
    if (llmManager.isEngineConfigured(engine) && !llmManager.isCustomEngine(engine)) {
      if (!llmManager.getChatModels(engine).length) {
        onRefreshModels()
      }
    }

    // and do the animation in reverse
    animateEngineLogo(`.selector .engines .logo.${engine}`, `.selector .current .logo`, async (elems, progress) => {
      if (elems) {
        elems.clone.style.opacity = Math.max(0, 1 - 1.25 * progress).toString()
        elems.container.style.opacity = Math.max(0, 1 - 1.25 * progress).toString()
        if (progress >= 1) {
          try { elems.clone.remove() } catch { /* empty */ }
          elems.container.style.opacity = '0'
          elems.source.style.opacity = '1'
          elems.target.style.opacity = '1'
          elems.target.parentElement.style.pointerEvents = 'auto'
        }
      }
      if (progress >= 1) {
        showAllEngines.value = false
      }
    })

  }

}

/* v8 ignore start */
const centerLogos = () => {

  try {

    // get the engines and current
    const engines = document.querySelector<HTMLElement>('.selector .engines')
    const current = document.querySelector<HTMLElement>('.selector .current')
    if (!engines || !current) {
      return
    }

    // get vertical center of engines
    const rc1 = engines.getBoundingClientRect()
    const midY1 = rc1.top + rc1.height / 2

    // get verical center of logo
    const logo = current.querySelector<HTMLElement>('.logo')
    const rc2 = logo.getBoundingClientRect()
    const midY2 = rc2.top + rc2.height / 2

    // align current engine so that the logo is centered 
    let top = parseInt(current.style.top) || 0
    top = top+midY1-midY2
    current.style.top = `${top}px`

    const actions = document.querySelector<HTMLElement>('.actions')
    if (actions) {
      const minHeight = parseInt(getComputedStyle(engines).minHeight)
      if (rc1.height > minHeight) {
        const offset = rc1.height - minHeight
        actions.style.top = `${-offset/2}px`
      } else {
        actions.style.top = '0px'
      }
    }

  } catch (e) {
    if (!process.env.TEST) {
      console.error('Error setting element width:', e)
    }
  }


}

const animateEngineLogo = (srcSelector: string, dstSelector: string, callback: (elems: {
  container: HTMLElement,
  source: HTMLElement,
  target: HTMLElement,
  clone: HTMLElement
}, progress: number) => void) => {

  try {

    const container = document.querySelector<HTMLElement>('.engines')
    const source = document.querySelector<HTMLElement>(srcSelector)
    const target = document.querySelector<HTMLElement>(dstSelector)
    const clone = source.cloneNode(true) as HTMLElement
    clone.style.position = 'absolute'
    clone.style.width = source.getBoundingClientRect().width + 'px'
    clone.style.height = source.getBoundingClientRect().height + 'px'
    clone.style.left = source.getBoundingClientRect().left + 'px'
    clone.style.top = source.getBoundingClientRect().top + 'px'
    document.body.appendChild(clone)
    source.style.opacity = '0'
    const targetX = target.getBoundingClientRect().left
    const targetY = target.getBoundingClientRect().top
    moveElement(clone, targetX, targetY, 150, (progress) => callback({ container, source, target, clone }, progress))

  } catch (error) {
    //console.log(error)
    callback(null, 1)
  }

}

const moveElement = (element: HTMLElement, endX: number, endY: number, duration: number, callback: (progress: number) => void) => {

  const startX = parseInt(element.style.left)
  const startY = parseInt(element.style.top)
  var startTime: DOMHighResTimeStamp = null;

  function animate(currentTime: DOMHighResTimeStamp) {
    if (!startTime) startTime = currentTime;
    var timeElapsed = currentTime - startTime;
    var progress = Math.min(timeElapsed / duration, 1);

    element.style.left = startX + (endX - startX) * progress + 'px';
    element.style.top = startY + (endY - startY) * progress + 'px';

    if (progress < 1) {
      requestAnimationFrame(animate);
      callback(progress)
    } else if (progress > 0) {
      callback(1)
    }
  }

  requestAnimationFrame(animate);
}
/* v8 ignore stop */

const saveApiKey = async () => {
  
  if (apiKey.value) {
    
    // first save
    store.config.engines[engine.value].apiKey = apiKey.value
    store.saveSettings()

    // refresh models
    onRefreshModels()

  }
}

const onRefreshModels = async () => {
  isRefreshing.value = true
  try {
    await llmManager.loadModels(engine.value)
  } finally {
    isRefreshing.value = false
  }
}

const onClickModel = () => {
  store.config.general.tips.modelSelector = false
  store.saveSettings()
}

const onSelectModel = (model: string) => {

  // computer-use warning
  if (llmManager.isComputerUseModel(engine.value, model)) {
    tipsManager.showTip('computerUse')
  }

  // continue
  llmManager.setChatModel(engine.value, model)
}

const addToFavorites = () => {
  llmManager.addFavoriteModel(engine.value, model.value)
  tipsManager.showTip('favoriteModels')
}

const removeFavorite = () => {
  llmManager.removeFavoriteModel(engine.value, model.value)
}

</script>


<style scoped>

.empty {
  --form-font-size: 10.5pt;
}

.hidden {
  visibility: hidden;
}

.empty {
  padding: 16px;
  margin-top: -64px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  background-color: var(--message-list-bg-color);
  color: var(--message-list-text-color);
}

.empty .tip {
  text-align: center;
  font-style: italic;
  font-size: 11pt;
  font-family: var(--font-family-serif);
  color: var(--message-list-tip-text-color);
  margin-bottom: 0px;

  img {
    margin-top: 4px;
    width: 32px;
    rotate: 90deg;
    stroke: var(--message-list-tip-text-color);
  }

  &.model {
    img {
      rotate: 270deg;
    }
  }

}

.windows .empty .tip {
  font-size: 14pt;
}

.empty .selector {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.empty .engines {
  display: flex;
  max-width: 400px;
  min-height: 240px;
  flex-wrap: wrap;
  justify-content: center;
  align-items: center;
  align-content: center;
  opacity: 0;
}

.empty .engines .more svg {
  height: 48px;
  width: 48px;
}

.empty .selector .logo {
  flex: 0 0 48px;
  cursor: pointer;
  margin: 16px;
  width: 48px;
  height: 48px;
  opacity: 1;
}

.empty .selector .current {
  position: absolute;
  display: flex;
  flex-direction: column;
  align-items: center;

  .help {
    margin-top: 0.5rem;
    font-size: var(--form-large-font-size);
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
  }

  form {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
  }
}

.empty .models {
  
  display: flex;
  align-items: center;
  width: 400px;
  gap: 8px;

  svg {
    visibility: hidden;
    cursor: pointer;
    position: relative;
    top: 4px;
  }

  &:hover {
    svg {
      visibility: visible;
    }
  }
}

  .rotating {
    animation: spin 1.5s linear infinite;
  }

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

.empty .select-model {
  z-index: 2;
  margin-top: 8px;
  padding: 4px 0px;
  font-size: 10.5pt;
  cursor: pointer;
}

.empty .refresh {
  font-size: 15.5pt;
}

.favorite {
  margin-top: 1rem;
  font-size: 9.5pt;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;

  .action {
    cursor: pointer;
  }

  .shortcut {
    opacity: 0.5;
  }
}

.actions {
  position: relative;
  margin-top: 2rem;
  margin-left: 4rem;
  margin-right: 4rem;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  flex-wrap: wrap;

  --action-bg-color-alpha-normal: 97.5%;
  --action-bg-color-alpha-hover: 92.5%;

  .action {
    display: flex;
    align-items: center;
    font-size: 10.5pt;
    gap: 0.5rem;
    padding: 6px 16px;
    border-radius: 8px;
    background-color: color-mix(in srgb, var(--text-color), transparent var(--action-bg-color-alpha-normal));
    border: 1px solid var(--control-border-color);
    cursor: pointer;

    &:hover {
      background-color: color-mix(in srgb, var(--text-color), transparent var(--action-bg-color-alpha-hover));
    }
  }
}

.empty:has(.shortcut) .actions {
  margin-top: 3rem;
}

.empty:has(.tip.model) .actions {
  margin-top: 4rem;
}

@media (prefers-color-scheme: dark) {
  .actions {
    --action-bg-color-alpha-normal: 92.5%;
    --action-bg-color-alpha-hover: 85%;
  }
}

</style>
