<template>
  <div class="tag-container">
    <section :key="key" v-for="(tag, key) in dynamicTags" class="tag-list">
      <!-- 关闭 -->
      <i class="el-icon-error" @click="handleRemove(tag)"></i>
      <el-button
        @click="handleTagStatus(tag)"
        :type="tag.used ? 'primary' : ''"
        plain
        >{{ tag.name }}</el-button
      >
    </section>
    <el-input
      style="width: 100px"
      v-if="inputVisible"
      v-model="inputValue"
      ref="saveTagInput"
      @keyup.enter.native="handleInputConfirm"
      @blur="handleInputConfirm"
    >
    </el-input>
    <i class="el-icon-collection-tag" v-else @click="showInput"></i>
  </div>
</template>

<script>
import { useInterceptorRoutes, useTags } from "@/common/store";
import { uniqueId } from "@alrale/common-lib";
import { confirmFunc } from "@/common";
// 变迁栏
export default {
  data() {
    return {
      dynamicTags: [],
      inputVisible: false,
      inputValue: "",
    };
  },
  methods: {
    // 移除
    async handleRemove({ id }) {
      const { ok } = await confirmFunc({
        message: this.$t("msg.confirmDeletion"),
      });
      if (!ok) return;
      const newTags = [];
      this.dynamicTags.forEach((item) => {
        if (item.id !== id) newTags.push(item);
      });
      this.dynamicTags = newTags;
      // 移除table tagId
      await this.refreshRoutes(id);
      // 更新
      this.refreshData(newTags);
    },
    // 更新Store routes
    async refreshRoutes(id) {
      const routes = await useInterceptorRoutes.getReal();
      const newRoutes = routes.map((item) => {
        const { tagId, ...data } = item;
        if (item.tagId && item.tagId === id) return data;
        return item;
      });
      useInterceptorRoutes.set(newRoutes);
    },
    // 修改tag状态
    handleTagStatus(tag) {
      tag.used = !tag.used;
      this.refreshData(this.dynamicTags);
    },
    showInput() {
      this.inputVisible = true;
      this.$nextTick((_) => {
        this.$refs.saveTagInput.$refs.input.focus();
      });
    },
    refreshData(tags) {
      useTags.set(tags);
      this.$emit("initList");
    },
    handleInputConfirm() {
      let inputValue = this.inputValue;
      if (inputValue) {
        this.dynamicTags.push({
          id: uniqueId(),
          name: inputValue,
          used: false,
        });
      }
      this.inputVisible = false;
      this.inputValue = "";
      this.refreshData(this.dynamicTags);
    },
    initList() {
      this.dynamicTags = useTags.get();
    },
  },
  mounted() {
    this.initList();
  },
};
</script>

<style lang="scss" scoped>
.tag-container {
  display: flex;
  align-items: center;
  .tag-list {
    display: flex;
    margin-right: 10px;
    position: relative;
    .el-icon-error {
      position: absolute;
      top: -6px;
      right: -6px;
      display: none;
    }
    &:hover {
      .el-icon-error {
        display: block;
      }
    }
  }
  .el-icon-collection-tag {
    cursor: pointer;
    color: teal;
    font-size: 20px;
  }
}
</style>
