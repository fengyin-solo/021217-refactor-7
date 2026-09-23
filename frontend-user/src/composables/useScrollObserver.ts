import { ref, type Ref } from 'vue'
import type { usePageElements } from './usePageElements'

export interface ScrollObserverContext {
  containerRef: Ref<HTMLElement | null>
  elements: ReturnType<typeof usePageElements>
  /** 可见页列表（已按距视口中心距离排序）确定后的回调，触发渲染队列 */
  onScheduleRender: (visibleSorted: number[]) => void
}

/**
 * 滚动监听与可见页检测：
 * - onScroll 通过 requestAnimationFrame 节流；
 * - 每帧更新当前页码，并计算视口（含一屏缓冲）内的可见页，
 *   按页面中心到视口中心的距离排序后交给渲染模块，保证连续滚动时页面出现顺序不变。
 * 不触碰渲染内容本身与查找状态。
 */
export function useScrollObserver(ctx: ScrollObserverContext) {
  const { containerRef, elements, onScheduleRender } = ctx

  const currentVisiblePage = ref(1)
  let scrollRafId: number | null = null

  /** 返回视口（含上下各一屏缓冲）内的页码，按页号升序 */
  function getVisiblePages(): number[] {
    const c = containerRef.value
    if (!c) return []
    const st = c.scrollTop, sb = st + c.clientHeight, buf = c.clientHeight
    const vis: number[] = []
    for (const [n, w] of elements.pageWrapperRefs) {
      const top = w.offsetTop, bot = top + w.offsetHeight
      if (bot >= st - buf && top <= sb + buf) vis.push(n)
    }
    return vis.sort((a, b) => a - b)
  }

  function updateCurrentPage() {
    const c = containerRef.value
    if (!c) return
    const center = c.scrollTop + c.clientHeight / 2
    let closest = 1, minD = Infinity
    for (const [n, w] of elements.pageWrapperRefs) {
      const d = Math.abs(w.offsetTop + w.offsetHeight / 2 - center)
      if (d < minD) { minD = d; closest = n }
    }
    currentVisiblePage.value = closest
  }

  /** 计算可见页并按距视口中心距离排序（距离越近渲染优先级越高） */
  function getVisiblePagesByPriority(): number[] {
    const visible = getVisiblePages()
    const c = containerRef.value
    if (c) {
      const center = c.scrollTop + c.clientHeight / 2
      visible.sort((a, b) => {
        const wa = elements.pageWrapperRefs.get(a), wb = elements.pageWrapperRefs.get(b)
        if (!wa || !wb) return 0
        return Math.abs(wa.offsetTop + wa.offsetHeight / 2 - center) -
               Math.abs(wb.offsetTop + wb.offsetHeight / 2 - center)
      })
    }
    return visible
  }

  function scheduleRender() {
    onScheduleRender(getVisiblePagesByPriority())
    updateCurrentPage()
  }

  function onScroll() {
    if (scrollRafId) return
    scrollRafId = requestAnimationFrame(() => {
      scrollRafId = null
      updateCurrentPage()
      scheduleRender()
    })
  }

  /** 文档加载完成后手动触发一次检测 */
  function check() {
    scheduleRender()
  }

  /** 换文档时重置当前页并取消尚未执行的帧回调 */
  function reset() {
    if (scrollRafId) cancelAnimationFrame(scrollRafId)
    scrollRafId = null
    currentVisiblePage.value = 1
  }

  function dispose() {
    if (scrollRafId) cancelAnimationFrame(scrollRafId)
    scrollRafId = null
  }

  return {
    currentVisiblePage,
    onScroll,
    check,
    reset,
    dispose,
  }
}
