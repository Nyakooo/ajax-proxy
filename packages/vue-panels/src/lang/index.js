import Vue from 'vue'
import VueI18n from 'vue-i18n'

import ElementLocale from 'element-ui/lib/locale'
import enLocale from 'element-ui/lib/locale/lang/en'
import zhLocale from 'element-ui/lib/locale/lang/zh-CN'
import twLocale from 'element-ui/lib/locale/lang/zh-TW'
// 日本语
import jaLocale from 'element-ui/lib/locale/lang/ja'
// 法语
import frLocale from 'element-ui/lib/locale/lang/fr'
// 韩语
import koLocale from 'element-ui/lib/locale/lang/ko'
// 俄语
import ruLocale from 'element-ui/lib/locale/lang/ru-RU'

import langZh from "./zh_CN.js"
import langEN from "./en.js"
import langTW from "./zh_TW.js"
import langJA from "./ja.js"
import langFR from "./fr.js"
import langKO from "./ko.js"
import langRU from "./ru.js"
// 爱尔兰
import langIE from "./ireland.js"

Vue.use(VueI18n)

const i18n = new VueI18n({
    locale: 'en',
    messages: {
        'zh': { ...langZh, ...zhLocale },
        'en': { ...langEN, ...enLocale },
        'tw': { ...langTW, ...twLocale },
        'ja': { ...langJA, ...jaLocale },
        'fr': { ...langFR, ...frLocale },
        'ko': { ...langKO, ...koLocale },
        'ru': { ...langRU, ...ruLocale },
        'ie': { ...langIE, ...enLocale }
    }
})
ElementLocale.i18n((key, value) => i18n.t(key, value))

export default i18n

export const Langs = [
    { value: 'en', label: 'English' },
    { value: 'zh', label: '简体中文' },
    { value: 'tw', label: '繁體中文' },
    { value: 'ja', label: '日本語' },
    { value: 'fr', label: 'Français' },
    { value: 'ko', label: '한국어' },
    { value: 'ru', label: 'Русский' },
    { value: 'ie', label: 'Gaeilge' }
]