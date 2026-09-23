import {
  renderPageToCanvas, buildTextLayer, buildAnnotationLayer,
  type PdfjsDocument, type PdfjsPage,
} from '@/utils/pdf-engine'
import type { usePageElements } from './usePageElements'
import type { usePageLayout } from './usePageLayout'

export interface PageRendererContext {
  getDoc: () => PdfjsDocument | null
  getScale: () => number
  elements: ReturnType<typeof usePageElements>
  layout: ReturnType<typeof usePageLayout>
}

/**
 * 渲染队列与页面回收（LRU）。
 * - requestRender：接收按优先级（距视口中心距离）排好序的可见页列表，
 *   未渲染的页依次入队串行渲染，超出上限的不可见页被回收。
 * - 缩放/换文档时调用 invalidate/reset 使进行中的渲染通过 renderVersion 失效。
 * 不监听滚动、不持有查找状态；可见页集合由外部（滚动监听模块）计算后传入。
 */
export function usePageRenderer(ctx: PageRendererContext) {
  const { getDoc, getScale, elements, layout } = ctx

  const renderedPages = new Set<string>()
  const renderedPageOrder: number[] = []
  const MAX_RENDERED = 15
  let renderVersion = 0
  let renderQueue: number[] = []
  let isRendering = false

  /* ---- 页面回收（LRU） ---- */
  function recyclePage(n: number) {
    const key = `${n}-${getScale()}`
    if (!renderedPages.has(key)) return
    const c = elements.canvasRefs.get(n)
    if (c) { c.width = 0; c.height = 0 }
    const t = elements.textLayerRefs.get(n)
    if (t) t.innerHTML = ''
    const a = elements.annotationLayerRefs.get(n)
    if (a) a.innerHTML = ''
    const h = elements.highlightLayerRefs.get(n)
    if (h) h.innerHTML = ''
    renderedPages.delete(key)
    const idx = renderedPageOrder.indexOf(n)
    if (idx !== -1) renderedPageOrder.splice(idx, 1)
  }

  function evictExcess(visible: number[]) {
    const vs = new Set(visible)
    while (renderedPageOrder.length > MAX_RENDERED) {
      const c = renderedPageOrder.find(p => !vs.has(p))
      if (c === undefined) break
      recyclePage(c)
    }
  }

  async function renderPage(n: number, ver: number) {
    const key = `${n}-${getScale()}`
    if (renderedPages.has(key) || ver !== renderVersion) return
    const doc = getDoc()
    if (!doc) return

    const page: PdfjsPage = await doc.getPage(n)
    if (ver !== renderVersion) return

    const canvas = elements.canvasRefs.get(n)
    const textDiv = elements.textLayerRefs.get(n)
    const annoDiv = elements.annotationLayerRefs.get(n)
    if (!canvas || !textDiv) return

    const { viewport } = await renderPageToCanvas(page, canvas, getScale())
    if (ver !== renderVersion) return

    // 渲染后用实际 viewport 修正尺寸（响应式更新 template）
    layout.pageDimensions.set(n, { width: viewport.width, height: viewport.height })

    await buildTextLayer(page, textDiv, viewport)
    if (ver !== renderVersion) return

    if (annoDiv) await buildAnnotationLayer(page, annoDiv, viewport)

    renderedPages.add(key)
    const idx = renderedPageOrder.indexOf(n)
    if (idx !== -1) renderedPageOrder.splice(idx, 1)
    renderedPageOrder.push(n)
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

  /**
   * 根据已按优先级排序的可见页列表安排渲染（列表顺序即渲染先后顺序），
   * 同时回收超出保留上限的不可见页面。
   */
  function requestRender(visibleSorted: number[]) {
    renderQueue = visibleSorted.filter(p => !renderedPages.has(`${p}-${getScale()}`))
    evictExcess(visibleSorted)
    if (renderQueue.length > 0) processQueue()
  }

  /** 使当前渲染批次作废并清空队列与已渲染记录（缩放、换文档时使用） */
  function invalidate() {
    renderVersion++
    renderQueue = []
    renderedPages.clear()
    renderedPageOrder.length = 0
  }

  /** 组件卸载时使进行中的异步渲染失效 */
  function dispose() {
    renderVersion++
  }

  return {
    requestRender,
    invalidate,
    dispose,
  }
}
