<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';

const canvasRef = ref<HTMLCanvasElement | null>(null);
let animationId: number;

onMounted(() => {
  const canvas = canvasRef.value;
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const resizeCanvas = () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  };
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);

  // --- 粒子系统初始化 ---
  const particles: any[] = [];
  const particleCount = 80;
  for (let i = 0; i < particleCount; i++) {
    particles.push({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      vx: (Math.random() - 0.5) * 1.2, // 基础速度 X
      vy: (Math.random() - 0.5) * 1.2, // 基础速度 Y
      radius: Math.random() * 2 + 1,
    });
  }

  // --- 鼠标交互状态管理 ---
  let mouseX = 0;
  let mouseY = 0;
  let prevMouseX = 0;
  let prevMouseY = 0;
  let smoothedMouseSpeed = 0; // 平滑处理后的鼠标速度

  window.addEventListener('mousemove', (e) => {
    mouseX = e.clientX;
    mouseY = e.clientY;
  });

  // --- 颜色控制变量 ---
  let anchorHue = 210;         // 核心改变 1：不再是固定 baseHue，而是可以移动的 anchorHue (锚点)
  let currentHue = anchorHue;  // 当前实时色相
  let hueDirection = 1;        // 色相变化方向 (1 为增加，-1 为减少)
  const hueSpeed = 0.25;        // 颜色变化的绝对速度
  let currentHueRange = 90;    // 当前允许波动的色相范围
  // --- 动画循环 ---
  const draw = () => {
    // 1. 计算鼠标移动速度
    const dx = mouseX - prevMouseX;
    const dy = mouseY - prevMouseY;
    const currentMouseSpeed = Math.sqrt(dx * dx + dy * dy);
    prevMouseX = mouseX;
    prevMouseY = mouseY;

    // 让鼠标速度的变化平滑一点，不要太突兀
    smoothedMouseSpeed = smoothedMouseSpeed * 0.9 + currentMouseSpeed * 0.1;

    // 2. 根据鼠标速度，动态计算各种参数 (顺便帮你把灵敏度调高了)
    const particleSpeedMultiplier = 1 + smoothedMouseSpeed * 0.15; 
    const targetHueRange = 15 + Math.min(smoothedMouseSpeed * 15, 180); // 乘以 15，轻轻一动就能看彩虹
    currentHueRange += (targetHueRange - currentHueRange) * 0.05;

    // 3. 计算当前帧的统一颜色
    currentHue += hueSpeed * hueDirection;
    
    // 如果当前颜色超出了正在缩小的墙壁，就强行把锚点中心拖拉过来
    if (currentHue > anchorHue + currentHueRange) {
      anchorHue = currentHue - currentHueRange; // 把锚点拉过来
      hueDirection = -1; // 碰到墙壁，掉头往回走
    } else if (currentHue < anchorHue - currentHueRange) {
      anchorHue = currentHue + currentHueRange; // 把锚点拉过来
      hueDirection = 1;  // 碰到墙壁，掉头往回走
    }

    // 4. 绘制渐变背景
    // 创建一个从中心向四周发散的径向渐变
    const gradient = ctx.createRadialGradient(
      canvas.width / 2, canvas.height / 2, 0, // 内圆心及半径
      canvas.width / 2, canvas.height / 2, Math.max(canvas.width, canvas.height) // 外圆心及半径
    );
    // 中心颜色稍亮，边缘颜色深邃（HSL 配合 currentHue 保持色系一致）
    gradient.addColorStop(0, `hsl(${currentHue}, 50%, 15%)`); 
    gradient.addColorStop(1, `hsl(${currentHue}, 60%, 4%)`);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // 5. 绘制粒子和连线 (统一使用计算好的 currentHue)
    const nodeColor = `hsl(${currentHue}, 80%, 60%)`;

    particles.forEach((p, index) => {
      // 粒子移动 (基础速度 * 鼠标加速倍率)
      p.x += p.vx * particleSpeedMultiplier;
      p.y += p.vy * particleSpeedMultiplier;

      // 边界反弹
      if (p.x < 0 || p.x > canvas.width) p.vx *= -1;
      if (p.y < 0 || p.y > canvas.height) p.vy *= -1;

      // 画节点
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      ctx.fillStyle = nodeColor; // 统一节点颜色
      ctx.fill();

      // 画连线
      for (let j = index + 1; j < particles.length; j++) {
        const p2 = particles[j];
        const distDx = p.x - p2.x;
        const distDy = p.y - p2.y;
        const dist = Math.sqrt(distDx * distDx + distDy * distDy);

        if (dist < 120) {
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p2.x, p2.y);
          // 统一连线颜色，只有透明度随距离变化
          ctx.strokeStyle = `hsla(${currentHue}, 80%, 60%, ${1 - dist / 120})`;
          ctx.lineWidth = 0.8; // 线条稍微加粗一点点，更有质感
          ctx.stroke();
        }
        
      }
    });

    // 在 ParticleBackground.vue 的 draw 函数内
    const safeHue = Math.floor((currentHue % 360 + 360) % 360);

    // 🌟 新增：把当前的色相动态写到 CSS 全局变量里
    document.documentElement.style.setProperty('--theme-hue', safeHue.toString());

    animationId = requestAnimationFrame(draw);
  };

  draw();
});

onUnmounted(() => {
  cancelAnimationFrame(animationId);
  window.removeEventListener('resize', () => {});
  // 清理鼠标事件，防止内存泄漏
  window.removeEventListener('mousemove', () => {});
});
</script>

<template>
  <canvas ref="canvasRef" class="particle-canvas"></canvas>
</template>

<style scoped>
.particle-canvas {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 0;
  /* 删除了之前的 CSS 动画，背景完全由 Canvas 接管 */
}
</style>