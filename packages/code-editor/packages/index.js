import VueCodeEditor from "./index.vue";

// 动态引入src目录下的所有index.js
function install(Vue) {
    Vue.component(VueCodeEditor.name, VueCodeEditor);
}

if (typeof window !== "undefined" && window.Vue) {
    install(window.Vue);
}

export default { install };
export { VueCodeEditor }