import { ref, onUnmounted, type Ref } from 'vue'

/**
 * 滚动监听 / 可见页检测
 *
 * - onScroll() 用 requestAnimationFrame 合并同一帧内的多次滚动事件；
 * - getVisiblePages() 基于页外壳的 offsetTop/offsetHeight，判定视口
 *   上下各一个屏高缓冲区内的页号，按页号升序返回；
 * - 当前页码取距视口中心最近的页。
 *
 * 检测结果如何驱动渲染由 onFrame 回调注入，本模块不持有渲染逻辑。
 */
export function useScrollSpy(options: {
  containerRef: Ref<HTMLElement | null>
  pageWrapperRefs: Map<number, HTMLElement>
  /** rAF 回调（更新页码、调度渲染等），每帧最多执行一次 */
  onFrame?: () => void
}) {
  const { containerRef, pageWrapperRefs, onFrame } = options

  const currentVisiblePage = ref(1)
  let scrollRafId: number | null = null
  // 帧回调允许在本模块创建之后再注册（渲染队列依赖本模块的可见页检测，
  // 两者存在创建顺序上的环），默认取 options.onFrame
  let frameHandler: (() => void) | undefined = onFrame

  /** 注册 / 替换每帧回调（更新页码、调度渲染等） */
  function setOnFrame(fn: (() => void) | undefined) {
    frameHandler = fn
  }

  /** 视口上下各预留一个屏高作为缓冲区，结果按页号升序 */
  function getVisiblePages(): number[] {
    const c = containerRef.value
    if (!c) return []
    const st = c.scrollTop, sb = st + c.clientHeight, buf = c.clientHeight
    const vis: number[] = []
    for (const [n, w] of pageWrapperRefs) {
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
    for (const [n, w] of pageWrapperRefs) {
      const d = Math.abs(w.offsetTop + w.offsetHeight / 2 - center)
      if (d < minD) { minD = d; closest = n }
    }
    currentVisiblePage.value = closest
  }

  function onScroll() {
    if (scrollRafId) return
    scrollRafId = requestAnimationFrame(() => {
      scrollRafId = null
      updateCurrentPage()
      frameHandler?.()
    })
  }

  /** 换文档后重置页码 */
  function resetCurrentPage() {
    currentVisiblePage.value = 1
  }

  onUnmounted(() => {
    if (scrollRafId) cancelAnimationFrame(scrollRafId)
  })

  return {
    currentVisiblePage,
    getVisiblePages,
    updateCurrentPage,
    onScroll,
    resetCurrentPage,
    setOnFrame,
  }
}
