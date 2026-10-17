import Vue from 'vue'
import App from './App.vue'

import '@/common/element-plugin'
import i18n from "@/lang/index";

import { initStorage } from "@proxy/shared-utils";

Vue.prototype.$ELEMENT = { size: 'mini' };
import "./index.scss"

Vue.config.productionTip = false

initStorage().then(() => {
  new Vue({
    i18n,
    render: h => h(App)
  }).$mount('#app')
})
