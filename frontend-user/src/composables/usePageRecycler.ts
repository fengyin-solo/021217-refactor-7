import type { Ref } from 'vue'

/** 单页需要清空的四层渲染产物 */
export interface PageLayerRefs {
  canvasRefs: Map<number, HTMLCanvasElement>
  textLayerRefs: Map<number, HTMLDivElement>
  annotationLayerRefs: Map<number, HTMLDivElement>
  highlightLayerRefs: Map<number, HTMLDivElement>
}

/**
 * 页面回收（LRU）
 *
 * 维护"已渲染页面"集合（以 `${页号}-${scale}` 为键，缩放后旧键自然失效）
 * 和最近使用顺序；超过上限时优先回收不在可见范围内、最久未使用的页面，
 * 清空其 canvas/text/annotation/highlight 四层产物。
 */
export function usePageRecycler(options: {
  layers: PageLayerRefs
  scale: Ref<number>
  maxRendered?: number
}) {
  const { layers, scale } = options
  const MAX_RENDERED = options.maxRendered ?? 15

  const renderedPages = new Set<string>()
  const renderedPageOrder: number[] = []

  /** 回收单页：清空四层 DOM 并从 LRU 记录中移除 */
  function recyclePage(n: number) {
    const key = `${n}-${scale.value}`
    if (!renderedPages.has(key)) return
    const c = layers.canvasRefs.get(n)
    if (c) { c.width = 0; c.height = 0 }
    const t = layers.textLayerRefs.get(n)
    if (t) t.innerHTML = ''
    const a = layers.annotationLayerRefs.get(n)
    if (a) a.innerHTML = ''
    const h = layers.highlightLayerRefs.get(n)
    if (h) h.innerHTML = ''
    renderedPages.delete(key)
    const idx = renderedPageOrder.indexOf(n)
    if (idx !== -1) renderedPageOrder.splice(idx, 1)
  }

  /** 已渲染数量超过上限时，从最久未使用的不可见页开始回收 */
  function evictExcess(visible: number[]) {
    const vs = new Set(visible)
    while (renderedPageOrder.length > MAX_RENDERED) {
      const c = renderedPageOrder.find(p => !vs.has(p))
      if (c === undefined) break
      recyclePage(c)
    }
  }

  /** 某页是否已按当前 scale 渲染 */
  function isRendered(n: number): boolean {
    return renderedPages.has(`${n}-${scale.value}`)
  }

  /** 记录一页渲染完成（已存在则移到队尾，保证 LRU 顺序） */
  function markRendered(n: number) {
    renderedPages.add(`${n}-${scale.value}`)
    const idx = renderedPageOrder.indexOf(n)
    if (idx !== -1) renderedPageOrder.splice(idx, 1)
    renderedPageOrder.push(n)
  }

  /** 缩放 / 加载新文档：清空全部渲染记录（DOM 清理由调用方按需要触发） */
  function clear() {
    renderedPages.clear()
    renderedPageOrder.length = 0
  }

  return {
    renderedPageOrder,
    recyclePage,
    evictExcess,
    isRendered,
    markRendered,
    clear,
  }
}
