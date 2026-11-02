<script setup lang="ts">
import { ref } from "vue";
import { useSpace } from "../stores/space";
import { useTask } from "../lib/task";
const s = useSpace(),
  register = ref(new URL(location.href).searchParams.has("invite")),
  username = ref(""),
  password = ref(""),
  task = useTask();
function login() {
  task.run(async () => {
    await s.login(
      username.value.trim(),
      password.value,
      register.value,
      new URL(location.href).searchParams.get("invite") || "",
    );
    password.value = "";
    history.replaceState(null, "", location.pathname + location.hash);
  });
}
</script>
<template>
  <main class="v2-auth">
    <form class="card" @submit.prevent="login">
      <h1 class="page-title">我们</h1>
      <p class="page-sub">两个人的时间账本</p>
      <label class="v2-field"
        >账号<input
          v-model="username"
          name="username"
          autocomplete="username"
          required
          pattern="[A-Za-z0-9_]{3,32}"
          placeholder="账号" /></label
      ><label class="v2-field"
        >密码<input
          v-model="password"
          type="password"
          name="password"
          :autocomplete="register ? 'new-password' : 'current-password'"
          required
          :minlength="register ? 12 : 1"
      /></label>
      <p v-if="register" class="muted">
        新账号密码至少 12 位，注册后可邀请另一位加入。
      </p>
      <p class="v2-error" role="alert">{{ task.error.value }}</p>
      <button type="submit" class="btn-primary" :disabled="task.busy.value">
        {{ register ? "注册并登录" : "登录" }}</button
      ><button class="btn-ghost" type="button" @click="register = !register">
        {{ register ? "返回登录" : "注册新账号" }}
      </button>
    </form>
  </main>
</template>
