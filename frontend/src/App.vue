<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import ParticleBackground from './components/ParticleBackground.vue';

const route = useRoute();

const showParticleBackground = computed(() => {
  return route.path === '/login' || route.path === '/register' || route.path === '/home';
});
</script>

<template>
  <ParticleBackground
    v-if="showParticleBackground"
    :key="route.path"
    class="particle-background"
    :sync-theme="route.path !== '/home'"
  />

  <div class="app-content">
    <router-view />
  </div>
</template>

<style scoped>
  .particle-background {
    position: fixed;
    z-index: 0;
  }

  .app-content {
    position: relative;
    z-index: 1;
}
</style>
