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
        <!-- 域名 -->
        <el-form-item
          :label="$t('domain')"
          :rules="[
            {
              required: true,
              trigger: 'blur',
              message: $t('msg.domainNotEmpty'),
            },
            {
              validator: validUrl,
              trigger: 'change',
              message: $t('msg.existsEmptyString'),
            },
          ]"
          prop="domain"
        >
          <el-input v-model="form.domain" placeholder="http|https://foo.com">
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
        <el-tabs v-model="form.redirect_type" type="card">
          <el-tab-pane :label="$t('redirector')" name="text">
            <!-- 重定向 -->
            <el-form-item
              v-if="form.redirect_type === 'text'"
              :rules="[
                {
                  required: true,
                  trigger: 'change',
                  message: $t('msg.redirectNotEmpty'),
                },
                {
                  validator: validUrl,
                  trigger: 'change',
                  message: $t('msg.existsEmptyString'),
                },
              ]"
              prop="redirect_url"
            >
              <el-input
                v-model="form.redirect_url"
                placeholder="http|https://foo2.com"
              ></el-input>
            </el-form-item>
            <!-- 请求头 -->
            <el-form-item
              v-if="form.redirect_type === 'text'"
              :label="$t('updateRequestHeaders')"
            >
              <section style="padding: 0 20px">
                <!-- 新增槽 -->
                <el-button
                  style="margin-bottom: 10px"
                  size="mini"
                  type="text"
                  @click="handleHeaderAdd"
                  >+{{ $t("append") }}</el-button
                >
                <el-row :gutter="24" style="margin-bottom: 10px">
                  <el-col :span="7">Key</el-col>
                  <el-col :span="7">Value</el-col>
                  <el-col :span="7">{{ $t("describe") }}</el-col>
                  <el-col :span="3">{{ $t("option") }}</el-col>
                </el-row>
                <el-row
                  :gutter="24"
                  v-for="(item, index) in form.headers"
                  :key="index"
                >
                  <el-col :span="7">
                    <!-- key -->
                    <el-form-item
                      :rules="[
                        {
                          required: true,
                          message: $t('msg.keyNotEmpty'),
                          trigger: 'change',
                        },
                      ]"
                      :prop="`headers[${index}].key`"
                    >
                      <el-input
                        v-model="form.headers[index].key"
                        :placeholder="$t('placeholder.input')"
                      />
                    </el-form-item>
                  </el-col>
                  <el-col :span="7">
                    <!-- value -->
                    <el-form-item
                      :rules="[
                        {
                          required: true,
                          message: $t('msg.valueNotEmpty'),
                          trigger: 'change',
                        },
                      ]"
                      :prop="`headers[${index}].value`"
                    >
                      <el-input
                        v-model="form.headers[index].value"
                        :placeholder="$t('placeholder.input')"
                      />
                    </el-form-item>
                  </el-col>
                  <el-col :span="7">
                    <!-- description -->
                    <el-form-item>
                      <el-input
                        v-model="form.headers[index].description"
                        :placeholder="$t('placeholder.input')"
                      />
                    </el-form-item>
                  </el-col>
                  <el-col :span="3">
                    <el-button
                      type="text"
                      class="text-btn-underline"
                      @click.stop="handleDel(index)"
                      >{{ $t("del") }}</el-button
                    >
                  </el-col>
                </el-row>
              </section>
            </el-form-item>
            <!-- 白名单列表 -->
            <el-form-item
              v-if="form.redirect_type === 'text'"
              :label="$t('exclusionList')"
            >
              <section style="padding: 0 20px">
                <!-- 新增槽 -->
                <el-button
                  style="margin-bottom: 10px"
                  size="mini"
                  type="text"
                  @click="handleIgnoresAdd"
                  >+{{ $t("append") }}</el-button
                >
                <el-row
                  v-for="(item, index) in form.ignores"
                  :key="index"
                  style="margin-bottom: 5px"
                >
                  <el-form-item
                    :rules="[
                      {
                        required: true,
                        message: $t('noEmpty'),
                        trigger: 'change',
                      },
                    ]"
                    :prop="`ignores[${index}]`"
                  >
                    <el-input
                      placeholder="http|https://foo.xxx"
                      v-model="form.ignores[index]"
                    >
                      <el-button
                        slot="append"
                        icon="el-icon-delete"
                        @click.stop="handleDelWhite(index)"
                      />
                    </el-input>
                  </el-form-item>
                </el-row>
              </section>
            </el-form-item>
          </el-tab-pane>
          <el-tab-pane :label="$t('responseFunc')" name="function">
            <!-- 函数式 -->
            <el-form-item
              v-if="form.redirect_type === 'function'"
              :rules="[
                {
                  required: true,
                  trigger: 'change',
                  message: $t('msg.responseDataNotEmpty'),
                },
              ]"
              prop="redirect_func"
            >
              <CodeEditor
                v-model="form.redirect_func"
                ref="codeEditor"
                type="redirector"
              />
            </el-form-item>
          </el-tab-pane>
        </el-tabs>
        <!-- 备注 -->
        <el-form-item :label="$t('remark')">
          <el-input
            type="textarea"
            :rows="5"
            v-model="form.remark"
            :placeholder="$t('placeholder.input')"
          >
          </el-input>
        </el-form-item>
      </el-form>
      <span slot="footer" class="dialog-footer">
        <el-button @click="handleClose">{{ $t("cancel") }}</el-button>
        <el-button type="primary" @click="handleSubmit">{{
          $t("confirm")
        }}</el-button>
      </span>
    </el-dialog>
  </div>
</template>

<script>
import { uniqueId } from "@alrale/common-lib";
import { useTags } from "@/common/store";
import { VueCodeEditor } from "@proxy/code-editor";

export default {
  components: { CodeEditor: VueCodeEditor },
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
    // 白名单添加
    handleIgnoresAdd() {
      this.form.ignores.push("");
    },
    // 删除白名单
    handleDelWhite(index) {
      this.form.ignores.splice(index, 1);
    },
    // 请求头添加
    handleHeaderAdd() {
      this.form.headers.push({
        description: "",
        key: "",
        value: "",
      });
    },
    // 删除header行
    handleDel(index) {
      this.form.headers.splice(index, 1);
    },
    // 模态展示
    open(row) {
      // 获取标签
      this.tags = useTags.get();
      if (row) {
        this.isEdit = true;
        // 编辑
        this.title = this.$t("edit");
        // 重定向类型
        if (!row.redirect_type) row.redirect_type = "text";
        // 兼容版本迭代，旧数据未存在白名单
        if (!row.ignores) row.ignores = [];
      } else {
        this.isEdit = false;
        // 新增
        this.title = this.$t("create");
      }
      this.isShow = true;
      this.form = row || {
        remark: "",
        headers: [],
        ignores: [],
        filter_type: "normal",
        redirect_type: "text",
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
