<template>
  <div class="request-container">
    <el-button type="primary" @click="handleCreate">{{
      $t("create")
    }}</el-button>

    <Modal ref="modal" @putData="putData" @editData="editData" />

    <!-- 表格 -->
    <el-table :data="tableData" stripe style="margin-top: 20px">
      <el-table-column :label="$t('status')" width="100">
        <template slot-scope="{ row }">
          <el-switch v-model="row.switch_on" @change="handleSwitch" />
        </template>
      </el-table-column>
      <el-table-column :label="$t('matchType')" width="100">
        <template slot-scope="{ row }">
          {{
            { normal: $t("normal"), regex: $t("regex") }[
              row.filter_type || "normal"
            ]
          }}
        </template>
      </el-table-column>
      <el-table-column label="Method" width="90">
        <template slot-scope="{ row }">
          {{ row.method || "ANY" }}
        </template>
      </el-table-column>
      <el-table-column
        prop="domain"
        :label="$t('domain')"
        show-overflow-tooltip
      />
      <el-table-column
        prop="redirect_url"
        :label="$t('redirect')"
        show-overflow-tooltip
      />
      <el-table-column
        prop="remark"
        :label="$t('remark')"
        show-overflow-tooltip
      />
      <el-table-column :label="$t('handle')" align="center" width="270">
        <template slot-scope="{ row }">
          <!-- 编辑 -->
          <el-button @click="handleEdit(row)" plain>{{ $t("edit") }}</el-button>
          <!-- 删除 -->
          <el-button type="danger" @click="handleDel(row)" plain>{{
            $t("del")
          }}</el-button>
          <!-- 复制 -->
          <el-button type="primary" @click="handleCopy(row)" plain>{{
            $t("copy")
          }}</el-button>
        </template>
      </el-table-column>
    </el-table>
  </div>
</template>

<script>
import Modal from "./modal";
import { confirmFunc } from "@/common/index";
import { deepClone, uniqueId } from "@alrale/common-lib";
import { useRedirects } from "@/common/store";
import { useNotice } from "@/common/notice";

export default {
  components: {
    Modal,
  },
  data() {
    return {
      tableData: [],
    };
  },
  methods: {
    handleCreate() {
      this.$refs.modal.open();
    },
    handleEdit(row) {
      const newRow = deepClone(row);
      this.$refs.modal.open(newRow);
    },
    handleSwitch() {
      this.modifyNotice(this.tableData);
    },
    async handleDel({ id }) {
      const { ok } = await confirmFunc({
        message: this.$t("msg.confirmDeletion"),
      });
      if (ok) {
        const newList = [];
        this.tableData.forEach((item) => {
          if (item.id != id) newList.push(item);
        });
        this.tableData = newList;
        this.modifyNotice(newList);
      }
    },
    // 复制
    handleCopy(row) {
      const list = useRedirects.get();
      let remark = row.remark || "";
      if (!remark.includes("[ -- copy -- ]"))
        remark = "[ -- copy -- ]  " + remark;
      list.push({
        ...row,
        remark,
        switch_on: false,
        id: uniqueId(),
      });
      this.modifyNotice(list);
      this.initList();
    },
    putData(row) {
      this.tableData.push(row);
      this.modifyNotice(this.tableData);
    },
    editData(row) {
      const list = useRedirects.get();
      const newList = [];
      list.forEach((item) => {
        if (item.id == row.id) newList.push(row);
        else newList.push(item);
      });
      this.modifyNotice(newList);
      this.initList(newList);
    },
    // 通知
    modifyNotice(redirects) {
      useRedirects.set(redirects);
      useNotice.changeRedirects(redirects);
    },
    initList() {
      this.tableData = useRedirects.get();
    },
  },
  mounted() {
    this.initList();
  },
};
</script>

<style lang="scss" scoped>
.request-container {
  padding: 0 10px;
}
</style>
