/**
 * 页面 DOM 引用登记表
 *
 * 集中管理 template 中按页号绑定的五类节点（canvas / text layer /
 * annotation layer / highlight layer / 页面外壳），供渲染、回收、
 * 查找高亮等模块按页号取用。
 */
export function usePageRegistry() {
  /* ---- 非响应式内部状态（不驱动 template，无需 reactive） ---- */
  const canvasRefs = new Map<number, HTMLCanvasElement>()
  const textLayerRefs = new Map<number, HTMLDivElement>()
  const annotationLayerRefs = new Map<number, HTMLDivElement>()
  const highlightLayerRefs = new Map<number, HTMLDivElement>()
  const pageWrapperRefs = new Map<number, HTMLElement>()

  /* ---- Ref 绑定（卸载时不删除，节点随文档生命周期一直存在） ---- */
  function setCanvasRef(el: HTMLCanvasElement | null, n: number) { if (el) canvasRefs.set(n, el) }
  function setTextLayerRef(el: HTMLDivElement | null, n: number) { if (el) textLayerRefs.set(n, el) }
  function setAnnotationLayerRef(el: HTMLDivElement | null, n: number) { if (el) annotationLayerRefs.set(n, el) }
  function setHighlightLayerRef(el: HTMLDivElement | null, n: number) { if (el) highlightLayerRefs.set(n, el) }
  function setPageRef(el: HTMLElement | null, n: number) { if (el) pageWrapperRefs.set(n, el) }

  /** 加载新文档前清空所有引用 */
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
