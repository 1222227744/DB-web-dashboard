<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { applyPreferences, fetchPreferences, updatePreferences } from '../utils/preferences';

const themeHue = ref(210);
const isSaving = ref(false);

const readCurrentHue = () => {
  const rawHue = getComputedStyle(document.documentElement).getPropertyValue('--theme-hue');
  const hue = Number.parseInt(rawHue, 10);
  return Number.isFinite(hue) ? hue : 210;
};

const previewThemeHue = () => {
  document.documentElement.style.setProperty('--theme-hue', String(themeHue.value));
};

const saveThemeHue = async () => {
  isSaving.value = true;

  try {
    const preferences = await updatePreferences({
      themeHue: themeHue.value
    });
    themeHue.value = preferences.themeHue;
    applyPreferences(preferences);
  } finally {
    isSaving.value = false;
  }
};

onMounted(async () => {
  themeHue.value = readCurrentHue();

  try {
    const preferences = await fetchPreferences();
    themeHue.value = preferences.themeHue;
    applyPreferences(preferences);
  } catch {
    previewThemeHue();
  }
});
</script>

<template>
  <div
    class="theme-hue-control"
    :class="{ 'is-saving': isSaving }"
    aria-label="主题色设置"
  >
    <span
      class="theme-dot"
      aria-hidden="true"
    ></span>
    <span class="theme-label">主题</span>
    <el-slider
      v-model="themeHue"
      :min="0"
      :max="359"
      :show-tooltip="false"
      size="small"
      @input="previewThemeHue"
      @change="saveThemeHue"
    />
  </div>
</template>

<style scoped>
.theme-hue-control {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 40px;
  height: 40px;
  padding: 0 11px;
  border: 1px solid var(--glass-border-soft);
  border-radius: 999px;
  background:
    radial-gradient(circle at 28% 24%, rgba(255, 255, 255, 0.18), transparent 32%),
    linear-gradient(135deg, hsla(var(--theme-hue), 84%, 60%, 0.18), rgba(255, 255, 255, 0.06));
  box-shadow:
    var(--glass-shadow-control),
    inset 0 1px 0 rgba(255, 255, 255, 0.1);
  overflow: hidden;
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  transition:
    width 0.34s ease,
    border-color 0.3s ease,
    background 0.3s ease,
    box-shadow 0.3s ease,
    opacity 0.2s ease;
}

.theme-hue-control:hover,
.theme-hue-control:focus-within {
  width: 176px;
  justify-content: flex-start;
  border-color: hsla(var(--theme-hue), 90%, 72%, 0.34);
  box-shadow:
    0 14px 34px rgba(0, 0, 0, 0.2),
    0 0 28px hsla(var(--theme-hue), 82%, 62%, 0.16),
    inset 0 1px 0 rgba(255, 255, 255, 0.12);
}

.theme-hue-control.is-saving {
  opacity: 0.82;
}

.theme-dot {
  flex: 0 0 auto;
  width: 16px;
  height: 16px;
  border: 2px solid rgba(255, 255, 255, 0.74);
  border-radius: 50%;
  background: hsl(var(--theme-hue), 82%, 60%);
  box-shadow: 0 0 18px var(--theme-primary-glow);
}

.theme-label {
  flex: 0 0 auto;
  width: 0;
  overflow: hidden;
  color: var(--glass-text-muted);
  font-size: 12px;
  opacity: 0;
  white-space: nowrap;
  transition: width 0.3s ease, opacity 0.22s ease;
}

.theme-hue-control:hover .theme-label,
.theme-hue-control:focus-within .theme-label {
  width: 26px;
  opacity: 1;
}

.theme-hue-control :deep(.el-slider) {
  flex: 1 1 auto;
  width: 0;
  min-width: 0;
  opacity: 0;
  transform: translateX(-4px);
  transition: width 0.34s ease, opacity 0.24s ease, transform 0.3s ease;
}

.theme-hue-control:hover :deep(.el-slider),
.theme-hue-control:focus-within :deep(.el-slider) {
  width: 92px;
  opacity: 1;
  transform: translateX(0);
}

@media (max-width: 620px) {
  .theme-hue-control:hover,
  .theme-hue-control:focus-within {
    width: 164px;
  }
}
</style>
