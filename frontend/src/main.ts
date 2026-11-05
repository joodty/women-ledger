import { createApp } from "vue";
import { createPinia } from "pinia";
import { createRouter, createWebHashHistory } from "vue-router";
import App from "./App.vue";
import Today from "./features/TodayPage.vue";
import Together from "./features/TogetherPage.vue";
import Goals from "./features/GoalsPage.vue";
import Wallet from "./features/WalletPage.vue";
import Story from "./features/StoryPage.vue";
import Review from "./features/ReviewPage.vue";
import Settings from "./features/SettingsPage.vue";
import WishList from "./features/WishListPage.vue";
import Meet from "./features/MeetPage.vue";
import StoryFull from "./features/StoryFullPage.vue";
import "./styles/theme.css";
import "./styles/app.css";
const routes = [
  { path: "/", component: Today },
  { path: "/together", component: Together },
  { path: "/goals", component: Goals },
  { path: "/points", component: Wallet },
  { path: "/story", component: Story },
  { path: "/review", component: Review },
  { path: "/settings", component: Settings },
  { path: "/palette", component: Settings },
  { path: "/wishlist", component: WishList },
  { path: "/meet", component: Meet },
  { path: "/past", component: Meet },
  { path: "/story/full", component: StoryFull },
  { path: "/:pathMatch(.*)*", redirect: "/" },
];
createApp(App)
  .use(createPinia())
  .use(createRouter({ history: createWebHashHistory(), routes }))
  .mount("#app");
