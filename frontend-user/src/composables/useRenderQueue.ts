import { type Ref } from 'vue'
import {
  renderPageToCanvas, buildTextLayer, buildAnnotationLayer,
  type PdfjsDocument, type PdfjsPage,
} from '@/utils/pdf-engine'
import type { usePageRecycler } from './usePageRecycler'

/**
 * 渲染队列
 *
 * 单生产者-单消费者的串行渲染管线：
 * - scheduleRender() 依据可见页重建队列，按距视口中心由近到远排序，
 *   连续滚动时页面出现顺序由此决定；
 * - renderVersion 单调递增，缩放 / 换文档 / 卸载时使进行中的渲染作废；
 * - 同一时刻只渲染一页（isRendering 串行锁）。
 *
 * 可见页检测本身不属于本模块，由 getVisiblePages 回调注入。
 */
export function useRenderQueue(options: {
  pdfDoc: Ref<PdfjsDocument | null>
  scale: Ref<number>
  canvasRefs: Map<number, HTMLCanvasElement>
  textLayerRefs: Map<number, HTMLDivElement>
  annotationLayerRefs: Map<number, HTMLDivElement>
  pageWrapperRefs: Map<number, HTMLElement>
  pageDimensions: Map<number, { width: number; height: number }>
  recycler: ReturnType<typeof usePageRecycler>
  containerRef: Ref<HTMLElement | null>
  getVisiblePages: () => number[]
  /** 每次调度完成后回调（用于同步当前页码等） */
  onAfterSchedule?: () => void
}) {
  const {
    pdfDoc, scale, canvasRefs, textLayerRefs, annotationLayerRefs,
    pageWrapperRefs, pageDimensions, recycler, containerRef,
    getVisiblePages, onAfterSchedule,
  } = options

  /* ---- 非响应式内部状态 ---- */
  let renderVersion = 0
  let renderQueue: number[] = []
  let isRendering = false

  async function renderPage(n: number, ver: number) {
    if (recycler.isRendered(n) || ver !== renderVersion) return
    const doc = pdfDoc.value
    if (!doc) return

    const page: PdfjsPage = await doc.getPage(n)
    if (ver !== renderVersion) return

    const canvas = canvasRefs.get(n)
    const textDiv = textLayerRefs.get(n)
    const annoDiv = annotationLayerRefs.get(n)
    if (!canvas || !textDiv) return

    const { viewport } = await renderPageToCanvas(page, canvas, scale.value)
    if (ver !== renderVersion) return

    // 渲染后用实际 viewport 修正尺寸（响应式更新 template）
    pageDimensions.set(n, { width: viewport.width, height: viewport.height })

    await buildTextLayer(page, textDiv, viewport)
    if (ver !== renderVersion) return

    if (annoDiv) await buildAnnotationLayer(page, annoDiv, viewport)

    recycler.markRendered(n)
  }

  async function processQueue() {
    if (isRendering) return
    isRendering = true
    const ver = renderVersion
    while (renderQueue.length > 0) {
      if (ver !== renderVersion) break
      const n = renderQueue.shift()!
      try { await renderPage(n, ver) } catch (e) { console.error(`渲染第${n}页失败:`, e) }
    }
    isRendering = false
  }

  function scheduleRender() {
    const visible = getVisiblePages()
    const c = containerRef.value
    if (c) {
      const center = c.scrollTop + c.clientHeight / 2
      visible.sort((a, b) => {
        const wa = pageWrapperRefs.get(a), wb = pageWrapperRefs.get(b)
        if (!wa || !wb) return 0
        return Math.abs(wa.offsetTop + wa.offsetHeight / 2 - center) -
               Math.abs(wb.offsetTop + wb.offsetHeight / 2 - center)
      })
    }
    renderQueue = visible.filter(p => !recycler.isRendered(p))
    recycler.evictExcess(visible)
    if (renderQueue.length > 0) processQueue()
    onAfterSchedule?.()
  }

  /** 使所有进行中/排队的渲染作废并清空队列（缩放、换文档时调用） */
  function invalidate() {
    renderVersion++
    renderQueue = []
  }

  /** 组件卸载：作废在途渲染 */
  function cancel() {
    renderVersion++
  }

  return {
    scheduleRender,
    invalidate,
    cancel,
  }
}
