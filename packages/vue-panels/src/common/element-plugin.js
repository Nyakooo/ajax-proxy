import Vue from "vue";
import {
  Dialog,
  Input,
  Switch,
  Select,
  Option,
  Button,
  RadioGroup,
  RadioButton,
  Table,
  TableColumn,
  Tooltip,
  Form,
  FormItem,
  Upload,
  MessageBox,
  Message,
  Alert,
  Drawer,
  Tag,
  Row,
  Col,
  Tabs,
  TabPane,
} from "element-ui";

Vue.use(Dialog);
Vue.use(Input);
Vue.use(Switch);
Vue.use(Select);
Vue.use(Option);
Vue.use(Button);
Vue.use(RadioGroup);
Vue.use(RadioButton);
Vue.use(Table);
Vue.use(TableColumn);
Vue.use(Tooltip);
Vue.use(Form);
Vue.use(FormItem);
Vue.use(Upload);
Vue.use(Alert);
Vue.use(Drawer);
Vue.use(Tag);
Vue.use(Row);
Vue.use(Col);
Vue.use(Tabs);
Vue.use(TabPane);

Vue.prototype.$msgbox = MessageBox;
Vue.prototype.$alert = MessageBox.alert;
Vue.prototype.$confirm = MessageBox.confirm;
Vue.prototype.$prompt = MessageBox.prompt;
Vue.prototype.$message = Message;
