<template>
  <div class="app-container">
    <div class="global-switch">
      <section>
        <i class="el-icon-switch-button"></i>
        <el-switch v-model="globalSwitchOn" @change="handleSwitch" />
      </section>
      <section v-if="globalSwitchOn">
        <!-- 备份 -->
        <el-button
          style="margin-right: 10px"
          type="info"
          plain
          @click="handleDownload"
          >{{ $t("backup") }}</el-button
        >
        <!-- 数据恢复 -->
        <el-upload
          action
          :auto-upload="false"
          :on-change="handleUpload"
          :show-file-list="false"
          style="margin-right: 20px"
        >
          <el-button type="info">{{ $t("restore") }}</el-button>
        </el-upload>
        <!-- 模式选择 -->
        <el-radio-group
          style="margin-right: 10px"
          v-model="currentMode"
          @change="handleModeChange"
        >
          <el-radio-button label="interceptor">{{
            $t("interceptor")
          }}</el-radio-button>
          <el-radio-button label="redirector">{{
            $t("redirector")
          }}</el-radio-button>
        </el-radio-group>
        <!-- 多语言 -->
        <el-select
          style="width: 100px"
          @change="handleLangChange"
          v-model="language"
          placeholder="language"
        >
          <el-option
            v-for="item in Langs"
            :key="item.value"
            :label="item.label"
            :value="item.value"
          >
          </el-option>
        </el-select>
        <svg
          @click="linkToGithub"
          class="icon"
          viewBox="0 0 1024 1024"
          version="1.1"
          xmlns="http://www.w3.org/2000/svg"
          width="22"
          height="22"
        >
          <path
            d="M20.48 503.72608c0 214.4256 137.4208 396.73856 328.94976 463.6672 25.8048 6.5536 21.87264-11.8784 21.87264-24.33024v-85.07392c-148.93056 17.44896-154.86976-81.1008-164.94592-97.52576-20.23424-34.52928-67.91168-43.33568-53.69856-59.76064 33.91488-17.44896 68.48512 4.42368 108.46208 63.61088 28.95872 42.88512 85.44256 35.6352 114.15552 28.4672a138.8544 138.8544 0 0 1 38.0928-66.7648c-154.25536-27.60704-218.60352-121.77408-218.60352-233.79968 0-54.31296 17.94048-104.2432 53.0432-144.54784-22.36416-66.43712 2.08896-123.24864 5.3248-131.6864 63.81568-5.7344 130.00704 45.6704 135.168 49.68448 36.2496-9.78944 77.57824-14.9504 123.82208-14.9504 46.4896 0 88.064 5.3248 124.5184 15.23712 12.288-9.4208 73.80992-53.53472 133.12-48.128 3.15392 8.43776 27.0336 63.93856 6.02112 129.4336 35.59424 40.38656 53.69856 90.76736 53.69856 145.24416 0 112.18944-64.7168 206.4384-219.42272 233.71776a140.0832 140.0832 0 0 1 41.7792 99.9424v123.4944c0.86016 9.87136 0 19.6608 16.50688 19.6608 194.31424-65.49504 334.2336-249.15968 334.2336-465.5104C1002.57792 232.48896 782.66368 12.77952 511.5904 12.77952 240.18944 12.65664 20.48 232.40704 20.48 503.72608z"
          ></path>
        </svg>
      </section>
    </div>
    <div class="current-title" v-if="globalSwitchOn && currentTitle">
      <el-alert
        show-icon
        :title="currentTitle"
        type="success"
        :closable="false"
      />
    </div>
    <transition name="fade" mode="out-in">
      <section v-if="globalSwitchOn" class="table-container">
        <transition name="fade" mode="out-in">
          <IntercepTable v-if="currentMode === 'interceptor'" ref="table" />
          <RedirecTable v-else ref="redirecTable" />
        </transition>
      </section>
      <div v-else class="closed-container">
        <i class="el-icon-close-notification"></i>
      </div>
    </transition>
  </div>
</template>
<script>
import IntercepTable from "./interceptor/table";
import RedirecTable from "./redirector/table";
import {
  useLang,
  useGLobalSwitch,
  useInterceptorRoutes,
  getStoreAll,
  useTags,
  useMode,
  useRedirects,
} from "@/common/store";
import { useNotice } from "@/common/notice";
import { confirmFunc, promptFunc } from "@/common";
import { typeIs } from "@alrale/common-lib";
import { Langs } from "@/lang/index";
import exportFromJSON from "export-from-json";
import { NoticeFrom, NoticeTo, NoticeKey } from "@proxy/shared-utils";
import { onUploadForDataConversion } from "@proxy/compatibility";
export default {
  components: {
    IntercepTable,
    RedirecTable,
  },
  data() {
    return {
      globalSwitchOn: false,
      language: "",
      currentMode: "",
      Langs,
      currentTitle: "",
    };
  },
  methods: {
    // github链接
    linkToGithub() {
      window.open("https://github.com/g0ngjie/ajax-proxy", "_blank");
    },
    // 下载
    async handleDownload() {
      const { ok, data } = await getStoreAll();
      // 数据异常
      if (!ok) return this.$message.warning(this.$t("msg.dataErr"));
      const { ok: isOk, data: value } = await promptFunc({
        // 备份
        title: this.$t("backup"),
        inputValue: "backup",
      });
      if (!isOk) return;
      const { interceptors, redirectors } = data || {};
      if (interceptors?.length === 0 && redirectors?.length === 0)
        // 没有数据可以下载
        return this.$message.warning(this.$t("msg.noDataToDownload"));
      exportFromJSON({
        data,
        fileName: `${value}.json`,
        exportType: exportFromJSON.types.json,
      });
    },
    // 上传
    handleUpload(file) {
      let reader = new FileReader();
      const {
        // 上传成功原文件会被覆盖
        overrideData,
        // 读取异常，文件可能不是一个JSON
        readJsonErr,
      } = this.$t("msg");
      reader.onload = async (e) => {
        try {
          let _json = JSON.parse(e.target.result);
          const routes = await useInterceptorRoutes.getReal();
          if (!_json) return;
          if (routes.length > 0) {
            // 如果存在
            const { ok } = await confirmFunc({
              message: overrideData,
            });
            if (ok) this.setStoreData(_json);
          } else this.setStoreData(_json);
        } catch (err) {
          this.$message.error(readJsonErr);
        }
      };
      reader.readAsText(file.raw);
    },
    setStoreData(target) {
      // 新老数据转换
      const getData = onUploadForDataConversion(target);
      const { language, mode, tags, interceptors, redirectors } = getData;
      const {
        // 你导入了一个空列表
        importEmpty,
      } = this.$t("msg");
      // 设置拦截列表
      if (typeIs(interceptors) === "array") {
        if (interceptors.length > 0) {
          useInterceptorRoutes.set(interceptors);
          this.$refs.table?.initList();
        }
        // 通知 拦截列表数据变更
        useNotice.changeIntercepts(interceptors);
      } else this.$message.warning(importEmpty);
      // 设置标签列表
      if (typeIs(tags) === "array" && tags.length > 0) {
        useTags.set(tags);
        this.$refs.table?.initTags();
      }
      // 设置语言
      if (language) {
        useLang.set(language);
        this.initData();
      }
      // 设置当前模式
      if (mode) {
        useMode.set(mode);
        this.currentMode = mode;
        // 通知模式变更，重新挂载 ajax 实例
        useNotice.changeMode(mode);
      }
      // 设置重定向列表
      if (typeIs(redirectors) === "array") {
        if (redirectors.length > 0) {
          useRedirects.set(redirectors);
          this.$refs.redirecTable?.initList();
        }
        // 通知 重定向列表数据变更
        useNotice.changeRedirects(redirectors);
      }
    },
    // 国际化
    handleLangChange(name) {
      this.$i18n.locale = name;
      useLang.set(name);
    },
    // 代理模式
    handleModeChange(name) {
      useNotice.changeMode(name);
      useMode.set(name);
    },
    handleSwitch(bool) {
      // 同步开关状态
      useNotice.globalSwitchOn(bool);
      // 数据处理
      useGLobalSwitch.set(bool);
    },
    initData() {
      // 获取 开关状态
      this.globalSwitchOn = useGLobalSwitch.get();
      // 初始化国际化
      const lang = useLang.get();
      this.language = lang;
      this.$i18n.locale = lang;
      this.currentMode = useMode.get();
      // 初始化title
      const manifest = chrome.runtime?.getManifest();
      document.title = `Ajax Proxy ${manifest?.version || 'DEV'}`;
    },
  },
  mounted() {
    // 获取当前连接状态
    chrome.runtime &&
      chrome.runtime.onMessage.addListener(({ from, to, key, value }) => {
        if (from === NoticeFrom.SERVICE_WORKER && to === NoticeTo.PANELS) {
          // 当前链接tab页
          if (key === NoticeKey.GET_CURRENT_TITLE) this.currentTitle = value;
        }
      });
    // 获取Title
    useNotice.getCurrentTitle();
  },
  created() {
    this.initData();
  },
};
</script>
<style lang="scss" scoped>
.app-container {
  width: 100%;
  height: 100%;
  // 过渡动画
  .fade-enter-active,
  .fade-leave-active {
    transition: opacity 0.1s;
  }
  .fade-enter,
  .fade-leave-active {
    opacity: 0;
  }
  .global-switch {
    height: 40px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 15px;
    section {
      display: flex;
      align-items: center;
      i {
        font-size: 20px;
        font-weight: bold;
        color: #e84749;
        margin-right: 10px;
      }
    }
  }
  .current-title {
    height: 30px;
    display: flex;
    align-items: center;
    padding: 0 10px;
  }
  .table-container {
    padding-top: 8px;
  }
  .closed-container {
    width: 100%;
    height: 60%;
    display: flex;
    justify-content: center;
    align-items: center;
    i {
      font-size: 50px;
      color: #666;
    }
  }
  .icon {
    cursor: pointer;
    fill: #333;
    margin: 0 10px;
  }
}
</style>
