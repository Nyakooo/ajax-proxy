<template>
  <div class="response-modal-container">
    <el-dialog
      :title="title"
      :visible.sync="isShow"
      :before-close="handleClose"
      :close-on-click-modal="false"
      :close-on-press-escape="true"
      top="1%"
      width="80%"
    >
      <el-form :model="form" ref="form">
        <el-form-item
          :label="$t('matchPath')"
          :rules="[
            {
              required: true,
              trigger: 'blur',
              message: $t('msg.pathNotEmpty'),
            },
            {
              validator: validUrl,
              trigger: 'change',
              message: $t('msg.existsEmptyString'),
            },
          ]"
          prop="match_url"
        >
          <el-input
            v-model="form.match_url"
            :placeholder="$t('placeholder.input')"
          >
            <el-select
              style="width: 90px"
              v-model="form.filter_type"
              slot="prepend"
            >
              <el-option :label="$t('normal')" value="normal"></el-option>
              <el-option :label="$t('regex')" value="regex"></el-option>
            </el-select>
            <el-select
              style="width: 90px"
              v-model="form.method"
              slot="append"
              placeholder="Method"
            >
              <el-option label="any(*)" value="ANY" />
              <el-option label="GET" value="GET" />
              <el-option label="POST" value="POST" />
              <el-option label="PUT" value="PUT" />
              <el-option label="DELETE" value="DELETE" />
              <el-option label="PATCH" value="PATCH" />
            </el-select>
          </el-input>
        </el-form-item>
        <el-form-item :label="$t('remark')">
          <el-input
            v-model="form.remark"
            :placeholder="$t('placeholder.input')"
          >
          </el-input>
        </el-form-item>
        <el-form-item :label="$t('tag')">
          <el-select
            v-model="form.tagId"
            :placeholder="$t('placeholder.select')"
            style="width: 100%"
            clearable
          >
            <el-option
              v-for="(item, index) in tags"
              :key="index"
              :label="item.name"
              :value="item.id"
            >
            </el-option>
          </el-select>
        </el-form-item>
        <el-form-item
          :label="$t('statusCode')"
          prop="status_code"
          :rules="[
            {
              type: 'number',
              max: 999,
              min: 100,
              message: $t('msg.formatErr'),
            },
          ]"
        >
          <el-input v-model.number="form.status_code" placeholder="200" />
        </el-form-item>

        <el-tabs v-model="form.override_type" type="card">
          <el-tab-pane :label="$t('responseData')" name="json">
            <el-form-item
              v-if="form.override_type === 'json'"
              :rules="[
                {
                  required: true,
                  trigger: 'change',
                  message: $t('msg.responseDataNotEmpty'),
                },
              ]"
              prop="override"
            >
              <el-button
                type="primary"
                :disabled="!form.override"
                style="margin-bottom: 10px"
                @click="handleOpenJsonEditor(form.override)"
                >JSON Editor</el-button
              >
              <el-input
                type="textarea"
                :rows="10"
                v-model="form.override"
                :placeholder="$t('placeholder.input')"
              >
              </el-input>
            </el-form-item>
          </el-tab-pane>
          <el-tab-pane :label="$t('responseFunc')" name="function">
            <!-- 函数式 -->
            <el-form-item
              v-if="form.override_type === 'function'"
              :rules="[
                {
                  required: true,
                  trigger: 'change',
                  message: $t('msg.responseDataNotEmpty'),
                },
              ]"
              prop="override_func"
            >
              <CodeEditor v-model="form.override_func" ref="codeEditor" />
            </el-form-item>
          </el-tab-pane>
        </el-tabs>
      </el-form>
      <span slot="footer" class="dialog-footer">
        <el-button @click="handleClose">{{ $t("cancel") }}</el-button>
        <el-button type="primary" @click="handleSubmit">{{
          $t("confirm")
        }}</el-button>
      </span>
    </el-dialog>
    <JsonEditor ref="jsonEditor" @change="handleJsonSubmit" />
  </div>
</template>

<script>
import { uniqueId } from "@alrale/common-lib";
import { useTags } from "@/common/store";
import JsonEditor from "./jsonEdit";
import { VueCodeEditor } from "@proxy/code-editor";

export default {
  components: { JsonEditor, CodeEditor: VueCodeEditor },
  data() {
    return {
      isShow: false,
      form: {},
      title: "",
      isEdit: false,
      tags: [],
    };
  },
  methods: {
    validUrl(rule, value, callback) {
      if (value) {
        const trimStr = value.trim();
        if (value.length != trimStr.length) {
          callback(new Error());
        }
      }
      callback();
    },
    // 打开编辑器
    handleOpenJsonEditor(jsonStr) {
      try {
        const _json = JSON.parse(jsonStr);
        this.$refs.jsonEditor.show(_json);
      } catch (error) {
        this.$message.error(this.$t("msg.jsonFormatError"));
      }
    },
    handleJsonSubmit(json) {
      this.form.override = JSON.stringify(json);
    },
    // 模态展示
    async open(row) {
      // 获取标签
      this.tags = useTags.get();
      if (row) {
        this.isEdit = true;
        // 编辑
        this.title = this.$t("edit");
        // 响应类型
        if (!row.override_type) row.override_type = "json";
      } else {
        this.isEdit = false;
        // 新增
        this.title = this.$t("create");
      }
      this.isShow = true;
      this.form = row || {
        status_code: 200,
        remark: "",
        filter_type: "normal",
        override_type: "json",
      };
      this.$nextTick(() => this.$refs.form.clearValidate());
    },
    // 模态关闭
    handleClose() {
      this.isShow = false;
    },
    // 表单提交
    handleSubmit() {
      this.$refs.form.validate((valid) => {
        if (valid) this.createData();
      });
    },
    createData() {
      if (this.isEdit) this.$emit("editData", this.form);
      else
        this.$emit("putData", {
          ...this.form,
          switch_on: true,
          id: uniqueId(),
        });
      this.isShow = false;
    },
  },
};
</script>
