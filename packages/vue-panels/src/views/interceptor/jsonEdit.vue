<template>
  <div class="json-editor-container">
    <el-drawer size="60%" :visible.sync="drawer" :with-header="false">
      <vue-json-editor
        v-model="json"
        style="height: 100%"
        :language="language"
        :expandedOnStart="true"
        mode="code"
        @json-change="onJsonChange"
      ></vue-json-editor>
      <div class="json-editor-drawer__footer">
        <el-button type="primary" style="width: 100px" @click="handleSubmit">{{
          $t("confirm")
        }}</el-button>
      </div>
    </el-drawer>
  </div>
</template>

<script>
import "@proxy/json-editor/lib/index.css";
import { VueJsonEditor } from "@proxy/json-editor";
import { useLang } from "@/common/store";

export default {
  components: { VueJsonEditor },
  data() {
    return {
      drawer: false,
      json: {},
      cache: null,
      language: "en",
    };
  },
  methods: {
    show(json) {
      const lang = useLang.get();
      // https://github.com/josdejong/jsoneditor/blob/master/docs/api.md
      // en es zh-CN pt-BR tr ja fr-FR de ru ko languages
      const langMap = {
        en: "en",
        zh: "zh-CN",
        tw: "zh-CN",
        ja: "ja",
        fr: "fr-FR",
        ko: "ko",
        ru: "ru",
      };
      this.language = langMap[lang] || "en";
      this.cache = null;
      this.json = json;
      this.drawer = true;
    },
    onJsonChange(value) {
      this.cache = value;
    },
    handleSubmit() {
      this.$emit("change", this.cache || this.json);
      this.drawer = false;
    },
  },
};
</script>
<style lang="scss" scoped>
.json-editor-container {
  width: 100%;
  height: 100%;
  /*1.显示滚动条：当内容超出容器的时候，可以拖动：*/
  :deep(.el-drawer__body) {
    overflow: auto;
  }
  /*2.隐藏滚动条，太丑了*/
  // :deep( .el-drawer__container ::-webkit-scrollbar) {
  //   display: none;
  // }
  :deep(.jsoneditor-vue) {
    height: 100%;
  }
  :deep(.jsoneditor-mode-form) {
    border-color: teal !important;
  }
  :deep(.jsoneditor-menu) {
    background-color: teal !important;
    border-bottom: 1px solid teal !important;
    a.jsoneditor-poweredBy {
      display: none;
    }
  }
  :deep(.json-editor-drawer__footer) {
    position: absolute;
    bottom: 28px;
    right: 40px;
    z-index: 999;
  }
}
</style>
