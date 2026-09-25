import Vue from 'vue'
import App from './App.vue'

import '@/app/element-plugin'
import i18n from '@/lang/index'

import { initStorage } from '@proxy/shared-utils'

Vue.prototype.$ELEMENT = { size: 'mini' }
import './index.scss'

Vue.config.productionTip = false

initStorage()
  .then(() => {
    const app = new Vue({
      i18n,
      render: (h) => h(App),
    }).$mount('#app')
    window.addEventListener('ajax-proxy:storage-error', (event) => {
      const { operation, message } = event.detail
      app.$message.error(`Storage ${operation} failed: ${message}`)
    })
  })
  .catch((error) => {
    console.error('[AjaxProxy] Storage initialization failed', error)
    const root = document.getElementById('app')
    if (root) root.textContent = `Storage initialization failed: ${error.message}`
  })
