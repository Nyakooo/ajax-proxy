<template>
  <div class="example-json">
    <div class="example-demo">json-editor demo</div>
    <vue-json-editor
      v-model="json"
      :mode="'code'"
      languages="en"
      @json-change="onJsonChange"
      @json-save="onJsonSave"
      @has-error="onError"
    >
    </vue-json-editor>
    <button type="button" @click="resetJson">reset</button>
  </div>
</template>

<script>
import { VueJsonEditor } from "../packages/index";
export default {
  data() {
    return {
      json: [{ name: "Dirk", age: 1234 }, { name: "Jason" }],
    };
  },

  components: {
    VueJsonEditor,
  },

  methods: {
    onJsonChange(value) {
      console.log("value:", value);
    },

    onJsonSave(value) {
      console.log("value:", value);
    },

    onError(value) {
      console.log("value:", value);
    },

    resetJson() {
      this.json = [{ name: "Dirk", age: 1234 }, { name: "Jason" }];
    },
  },
};
</script>
