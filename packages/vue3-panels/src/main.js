import { createApp } from 'vue'
import PrimeVue from 'primevue/config'
import Aura from '@primeuix/themes/aura'
import { definePreset } from '@primeuix/themes'
import PrimeButton from 'primevue/button'
import InputText from 'primevue/inputtext'
import PrimeTag from 'primevue/tag'
import ToggleSwitch from 'primevue/toggleswitch'
import App from './App.vue'
import './style.css'

const AjaxProxyPreset = definePreset(Aura, {
  semantic: {
    focusRing: {
      width: '3px',
      style: 'solid',
      color: '{primary.color}',
      offset: '2px',
      shadow: 'none',
    },
    primary: {
      50: '#e6f4f3',
      100: '#c8e8e5',
      200: '#9dd7d2',
      300: '#6cc2bb',
      400: '#3a9d98',
      500: '#006d75',
      600: '#005b62',
      700: '#004b51',
      800: '#003d43',
      900: '#12343b',
      950: '#0b252a',
    },
  },
})

const unstyled = import.meta.env.VITE_UI_UNSTYLED === 'true'
const app = createApp(App)
if (unstyled) {
  app.use(PrimeVue, {
    unstyled: true,
    pt: {
      button: { root: 'ap-pt-button', label: 'ap-pt-button-label' },
      inputtext: { root: 'ap-pt-input' },
      tag: { root: 'ap-pt-tag' },
      toggleswitch: {
        root: 'ap-pt-switch',
        input: 'ap-pt-switch-input',
        slider: 'ap-pt-switch-slider',
        handle: 'ap-pt-switch-handle',
      },
    },
  })
} else {
  app.use(PrimeVue, {
    theme: {
      preset: AjaxProxyPreset,
      options: { darkModeSelector: '.app-dark' },
    },
  })
}
app.component('AppButton', PrimeButton)
app.component('InputText', InputText)
app.component('AppTag', PrimeTag)
app.component('ToggleSwitch', ToggleSwitch)
app.mount('#app')
