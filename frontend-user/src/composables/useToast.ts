import { ref, onUnmounted } from 'vue'

/**
 * 轻提示（Toast）状态与自动消失计时。
 */
export function useToast() {
  const toastMsg = ref('')
  const toastType = ref<'success' | 'error' | 'info'>('info')
  let toastTimer: ReturnType<typeof setTimeout> | null = null

  function showToast(msg: string, type: 'success' | 'error' | 'info' = 'info') {
    toastMsg.value = msg
    toastType.value = type
    if (toastTimer) clearTimeout(toastTimer)
    toastTimer = setTimeout(() => { toastMsg.value = '' }, 3000)
  }

  onUnmounted(() => {
    if (toastTimer) clearTimeout(toastTimer)
  })

  return {
    toastMsg,
    toastType,
    showToast,
  }
}
