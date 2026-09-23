/**
 * 页面各层 DOM 元素引用注册表。
 * 只负责 template ref 的收集与重置，不参与任何渲染/滚动逻辑。
 */
export function usePageElements() {
  const canvasRefs = new Map<number, HTMLCanvasElement>()
  const textLayerRefs = new Map<number, HTMLDivElement>()
  const annotationLayerRefs = new Map<number, HTMLDivElement>()
  const highlightLayerRefs = new Map<number, HTMLDivElement>()
  const pageWrapperRefs = new Map<number, HTMLElement>()

  /* ---- Ref 绑定 ---- */
  function setCanvasRef(el: HTMLCanvasElement | null, n: number) { if (el) canvasRefs.set(n, el) }
  function setTextLayerRef(el: HTMLDivElement | null, n: number) { if (el) textLayerRefs.set(n, el) }
  function setAnnotationLayerRef(el: HTMLDivElement | null, n: number) { if (el) annotationLayerRefs.set(n, el) }
  function setHighlightLayerRef(el: HTMLDivElement | null, n: number) { if (el) highlightLayerRefs.set(n, el) }
  function setPageRef(el: HTMLElement | null, n: number) { if (el) pageWrapperRefs.set(n, el) }

  /** 切换文档时清空所有引用 */
  function reset() {
    canvasRefs.clear()
    textLayerRefs.clear()
    annotationLayerRefs.clear()
    highlightLayerRefs.clear()
    pageWrapperRefs.clear()
  }

  return {
    canvasRefs,
    textLayerRefs,
    annotationLayerRefs,
    highlightLayerRefs,
    pageWrapperRefs,
    setCanvasRef,
    setTextLayerRef,
    setAnnotationLayerRef,
    setHighlightLayerRef,
    setPageRef,
    reset,
  }
}
