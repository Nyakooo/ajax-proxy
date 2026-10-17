<template>
  <div ref="ace"></div>
</template>

<script>
import { getDefaultContent, useInit } from "./useEditor";
// this.aceEditor.getSession().on('change', () => {
//   this.aceEditor.getSession().getValue()
// })
export default {
  name: "CodeEditor",
  props: {
    value: {
      type: String,
      default: "",
    },
    type: {
      type: String,
      default: "interceptor",
    },
  },
  watch: {
    value: {
      immediate: true,
      async handler(val) {
        if (!this.internalChange) {
          this.setValue(val);
        }
      },
      deep: true,
    },
  },
  data() {
    return {
      aceEditor: null,
      internalChange: false,
    };
  },

  methods: {
    initEditor() {
      this.aceEditor = useInit(this.$refs.ace, this.type);

      this.aceEditor.getSession().on("change", () => {
        this.$emit("change", this.aceEditor.getSession().getValue());
        this.internalChange = true;
        this.$emit("input", this.aceEditor.getSession().getValue());
        this.$nextTick(() => {
          this.internalChange = false;
        });
      });
      this.setValue(this.value);
    },
    setValue(value) {
      if (this.aceEditor) {
        if (!value) this.aceEditor.setValue(getDefaultContent(this.type));
        else this.aceEditor.setValue(value);
      }
    },
  },
  mounted() {
    this.initEditor();
  },
};
</script>

<style></style>
