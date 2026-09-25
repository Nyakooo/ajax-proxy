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

const app = createApp(App)
app.use(PrimeVue, {
  theme: {
    preset: AjaxProxyPreset,
    options: {
      darkModeSelector: '.app-dark',
    },
  },
})
app.component('AppButton', PrimeButton)
app.component('InputText', InputText)
app.component('AppTag', PrimeTag)
app.component('ToggleSwitch', ToggleSwitch)
app.mount('#app')
