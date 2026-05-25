<script setup lang="ts">
defineProps<{
  modelValue: boolean;
  title: string;
  label?: string;
  description?: string;
  width?: string;
  iconText?: string;
  hideHeader?: boolean;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
}>();

const close = () => {
  emit('update:modelValue', false);
};
</script>

<template>
  <el-dialog
    :model-value="modelValue"
    :width="width || 'min(92vw, 520px)'"
    class="glass-dialog"
    :class="{ 'glass-dialog--hidden-header': hideHeader }"
    append-to-body
    modal-class="glass-dialog-overlay"
    :show-close="!hideHeader"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <div class="glass-dialog-content">
      <header
        v-if="hideHeader"
        class="glass-dialog-hero"
      >
        <div
          class="glass-dialog-orb"
          aria-hidden="true"
        >
          <span></span>
          {{ iconText || 'DB' }}
        </div>
        <div>
          <p
            v-if="label"
            class="glass-dialog-label"
          >
            {{ label }}
          </p>
          <h3>{{ title }}</h3>
          <p v-if="description">{{ description }}</p>
        </div>
      </header>

      <slot></slot>
    </div>

    <template #footer>
      <slot
        name="footer"
        :close="close"
      ></slot>
    </template>
  </el-dialog>
</template>

<style>
.glass-dialog-overlay {
  background:
    radial-gradient(circle at 22% 18%, hsla(var(--theme-hue), 82%, 56%, 0.16), transparent 34%),
    rgba(2, 5, 14, 0.58) !important;
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
}

.glass-dialog {
  overflow: hidden;
  border: 1px solid hsla(var(--theme-hue), 80%, 72%, 0.2);
  border-radius: 28px;
  background:
    radial-gradient(circle at 18% 0%, hsla(var(--theme-hue), 86%, 62%, 0.22), transparent 34%),
    radial-gradient(circle at 86% 18%, hsla(calc(var(--theme-hue) + 34), 86%, 64%, 0.14), transparent 30%),
    linear-gradient(145deg, rgba(255, 255, 255, 0.075), rgba(255, 255, 255, 0.025)),
    rgba(7, 12, 28, 0.9) !important;
  box-shadow:
    0 26px 78px rgba(0, 0, 0, 0.42),
    0 0 48px hsla(var(--theme-hue), 82%, 62%, 0.14),
    inset 0 1px 0 rgba(255, 255, 255, 0.12);
  backdrop-filter: blur(22px);
  -webkit-backdrop-filter: blur(22px);
}

.glass-dialog::before {
  position: absolute;
  inset: 0;
  content: '';
  pointer-events: none;
  background:
    linear-gradient(120deg, rgba(255, 255, 255, 0.09), transparent 34%),
    linear-gradient(220deg, transparent 62%, hsla(var(--theme-hue), 80%, 60%, 0.08));
}

.glass-dialog--hidden-header {
  margin-top: 12vh;
}

.glass-dialog--hidden-header .el-dialog__header {
  display: none;
}

.glass-dialog .el-dialog__header {
  position: relative;
  padding: 28px 34px 4px;
}

.glass-dialog .el-dialog__title,
.glass-dialog .el-dialog__body {
  color: var(--glass-text-strong);
}

.glass-dialog .el-dialog__title {
  font-weight: 800;
}

.glass-dialog .el-dialog__headerbtn .el-dialog__close {
  color: var(--glass-text-muted);
  transition: var(--glass-transition);
}

.glass-dialog .el-dialog__headerbtn:hover .el-dialog__close {
  color: var(--glass-text-strong);
  filter: drop-shadow(0 0 8px hsla(var(--theme-hue), 80%, 70%, 0.5));
}

.glass-dialog .el-dialog__body {
  position: relative;
  padding: 34px 34px 18px;
}

.glass-dialog .el-dialog__footer {
  position: relative;
  padding: 18px 34px 30px;
}

.glass-dialog-content {
  position: relative;
}

.glass-dialog-hero {
  position: relative;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 18px;
  align-items: center;
  margin-bottom: 26px;
}

.glass-dialog-label {
  margin: 0 0 8px;
  color: var(--theme-primary-light);
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.08em;
}

.glass-dialog-hero h3 {
  margin: 0;
  color: var(--glass-text-strong);
  font-size: clamp(24px, 4vw, 34px);
  line-height: 1.08;
  letter-spacing: -0.04em;
}

.glass-dialog-hero p:not(.glass-dialog-label) {
  max-width: 360px;
  margin: 12px 0 0;
  color: var(--glass-text-muted);
  line-height: 1.8;
}

.glass-dialog-orb {
  position: relative;
  display: grid;
  place-items: center;
  width: 86px;
  height: 86px;
  color: var(--glass-text-strong);
  font-weight: 800;
  border: 1px solid hsla(var(--theme-hue), 90%, 72%, 0.34);
  border-radius: 26px;
  background:
    radial-gradient(circle at 32% 24%, rgba(255, 255, 255, 0.3), transparent 30%),
    linear-gradient(135deg, hsla(var(--theme-hue), 86%, 60%, 0.28), rgba(255, 255, 255, 0.055));
  box-shadow:
    0 0 34px hsla(var(--theme-hue), 82%, 62%, 0.24),
    inset 0 1px 0 rgba(255, 255, 255, 0.14);
  overflow: hidden;
}

.glass-dialog-orb span {
  position: absolute;
  width: 122%;
  height: 42%;
  border: 1px solid hsla(var(--theme-hue), 90%, 76%, 0.38);
  border-radius: 50%;
  transform: rotate(-12deg);
  box-shadow: 0 0 18px hsla(var(--theme-hue), 85%, 65%, 0.2);
}

.glass-dialog .el-input__wrapper {
  min-height: 46px;
  border: 1px solid hsla(var(--theme-hue), 80%, 72%, 0.18);
  border-radius: 16px;
  background:
    linear-gradient(135deg, hsla(var(--theme-hue), 80%, 60%, 0.075), rgba(255, 255, 255, 0.055)) !important;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.09),
    0 10px 22px rgba(0, 0, 0, 0.12) !important;
  transition: var(--glass-transition);
}

.glass-dialog .el-input__wrapper:hover,
.glass-dialog .el-input__wrapper.is-focus {
  border-color: hsla(var(--theme-hue), 90%, 72%, 0.46);
  box-shadow:
    0 0 22px hsla(var(--theme-hue), 80%, 62%, 0.18),
    inset 0 1px 0 rgba(255, 255, 255, 0.12) !important;
}

.glass-dialog .el-input__inner {
  color: var(--glass-text-strong);
}

.glass-dialog .el-input__inner::placeholder {
  color: var(--glass-placeholder);
}

.glass-dialog .el-button {
  min-height: 38px;
  padding: 0 18px;
  color: var(--glass-text) !important;
  border: 1px solid var(--glass-border-soft) !important;
  border-radius: 999px !important;
  background:
    linear-gradient(135deg, hsla(var(--theme-hue), 80%, 60%, 0.1), rgba(255, 255, 255, 0.055)) !important;
  box-shadow:
    var(--glass-shadow-control),
    inset 0 1px 0 rgba(255, 255, 255, 0.1) !important;
  transition: var(--glass-transition) !important;
}

.glass-dialog .el-button:hover:not(.is-disabled) {
  color: var(--glass-text-strong) !important;
  border-color: hsla(var(--theme-hue), 90%, 72%, 0.42) !important;
  box-shadow:
    0 12px 28px rgba(0, 0, 0, 0.22),
    0 0 24px hsla(var(--theme-hue), 80%, 62%, 0.16) !important;
  transform: translateY(-1px);
}

.glass-dialog .el-button--danger {
  color: #fecaca !important;
  border-color: rgba(248, 113, 113, 0.55) !important;
  background: rgba(248, 113, 113, 0.24) !important;
}

.glass-dialog .el-button--danger:hover {
  border-color: rgba(248, 113, 113, 0.72) !important;
  background: rgba(248, 113, 113, 0.34) !important;
}

@media (max-width: 620px) {
  .glass-dialog-hero {
    grid-template-columns: 1fr;
    gap: 14px;
  }

  .glass-dialog-orb {
    width: 72px;
    height: 72px;
  }

  .glass-dialog .el-dialog__body {
    padding: 28px 22px 14px;
  }

  .glass-dialog .el-dialog__footer {
    padding: 14px 22px 24px;
  }
}
</style>
