<template>
  <div id="app">
    <MainView />
  </div>
</template>
<script>
import MainView from "./views/index.vue";
export default {
  components: { MainView },
};
</script>

<style>
html,
body,
#app {
  width: 100%;
  height: 100%;
  margin: 0;
  padding: 0;
}
</style>
<style scoped>
/* 取消窗口滚动条 */
::-webkit-scrollbar {
  display: none;
}
</style>
