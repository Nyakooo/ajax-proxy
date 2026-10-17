<template>
  <div>
    <div>code-editor demo</div>
    <vue-code-editor
      ref="codeEditor"
      v-model="codeText"
      @change="handleChange"
      type="redirector"
    />
    <button type="button" @click="reset">reset</button>
  </div>
</template>

<script>
import { VueCodeEditor } from "../packages/index";
export default {
  data() {
    return {
      codeText: "",
    };
  },

  components: {
    VueCodeEditor,
  },

  methods: {
    handleChange(value) {
      // console.log("value:", value);
    },
    reset() {
      this.$refs.codeEditor.setValue();
    },
  },
};
</script>
