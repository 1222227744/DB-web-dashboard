<script setup lang="ts">
import { computed } from 'vue';
import { getAuthUser } from '../utils/auth';

const user = computed(() => getAuthUser());
</script>

<template>
  <main class="home-page">
    <section class="home-card">
      <p class="home-label">欢迎回来</p>
      <h1>{{ user?.displayName || '用户' }}</h1>
      <p>账号：{{ user?.accountNo || '-' }}</p>
      <p>V1 工作台骨架正在建设中。</p>
    </section>
  </main>
</template>

<style scoped>
.home-page {
  min-height: 100vh;
  padding: 48px;
  background: var(--app-bg, #0f172a);
  color: var(--text-primary, #ffffff);
}

.home-card {
  max-width: 720px;
  padding: 32px;
  border-radius: 24px;
  background: rgba(255, 255, 255, 0.12);
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.28);
  backdrop-filter: blur(16px);
}

.home-label {
  margin: 0 0 8px;
  color: var(--primary-color, #409eff);
}
</style>
