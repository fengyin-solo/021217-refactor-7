import { ref, reactive, type Ref } from 'vue'
import {
  getPageBaseDimensions,
  type PdfjsDocument, type PdfjsViewport,
} from '@/utils/pdf-engine'

/**
 * 页面布局：缩放比、页面尺寸预计算、按 scale 换算像素尺寸。
 *
 * 只负责"页面应该多大"，不关心渲染与滚动。
 */
export function usePageLayout(options: {
  containerRef: Ref<HTMLElement | null>
  pdfDoc: Ref<PdfjsDocument | null>
}) {
  const { containerRef, pdfDoc } = options

  const scale = ref(1.5)

  /**
   * 每页的基础尺寸（scale=1 时的宽高），用于精确计算不同尺寸页面的布局。
   * 使用 reactive(Map) 确保 set/delete 操作触发视图更新。
   */
  const pageBaseDims = reactive(new Map<number, { baseWidth: number; baseHeight: number }>())

  /**
   * 每页在当前 scale 下的实际像素尺寸（响应式）。
   * getPageStyle() 依赖此 Map 驱动 template 中 .pdf-page 的宽高。
   */
  const pageDimensions = reactive(new Map<number, { width: number; height: number }>())

  /* ---- 缩放 ---- */
  function zoomIn() { if (scale.value < 5) scale.value = Math.min(5, +(scale.value + 0.25).toFixed(2)) }
  function zoomOut() { if (scale.value > 0.25) scale.value = Math.max(0.25, +(scale.value - 0.25).toFixed(2)) }
  function fitWidth() {
    if (!containerRef.value || !pdfDoc.value) return
    const containerWidth = containerRef.value.clientWidth - 64
    // 使用第一页的基础宽度（scale=1）计算适合宽度的缩放比
    const base = pageBaseDims.get(1)
    if (!base) return
    scale.value = +(containerWidth / base.baseWidth).toFixed(2)
  }

  /* ---- 页面尺寸 ---- */
  function getPageStyle(n: number) {
    const d = pageDimensions.get(n)
    return d ? { width: `${d.width}px`, height: `${d.height}px` } : {}
  }

  /** 根据 pageBaseDims 和当前 scale 重新计算所有页面的像素尺寸 */
  function recomputeScaledDimensions() {
    const s = scale.value
    for (const [n, base] of pageBaseDims) {
      pageDimensions.set(n, {
        width: base.baseWidth * s,
        height: base.baseHeight * s,
      })
    }
  }

  /**
   * 预计算所有页面的基础尺寸（scale=1）。
   * 逐页获取 viewport，正确处理混合页面大小（纵向/横向/不同尺寸）。
   */
  async function precomputePageDimensions() {
    const doc = pdfDoc.value
    if (!doc) return
    const baseDims = await getPageBaseDimensions(doc)
    pageBaseDims.clear()
    for (const [n, dim] of baseDims) {
      pageBaseDims.set(n, dim)
    }
    recomputeScaledDimensions()
  }

  /** 加载新文档前清空尺寸 */
  function reset() {
    pageDimensions.clear()
    pageBaseDims.clear()
  }

  /**
   * 按当前缩放比构造单页 viewport。
   * 高亮层只使用 width/height/scale，rotation 固定为 0（阅读器不支持旋转）。
   */
  function getViewportForPage(n: number): PdfjsViewport | null {
    const base = pageBaseDims.get(n)
    if (!base) return null
    const s = scale.value
    return {
      width: base.baseWidth * s,
      height: base.baseHeight * s,
      scale: s,
      rotation: 0,
      transform: [1, 0, 0, 1, 0, 0],
      clone: () => ({ /* 简化的 clone，实际高亮层不需要完整 viewport */ }),
    } as unknown as PdfjsViewport
  }

  return {
    scale,
    pageBaseDims,
    pageDimensions,
    zoomIn,
    zoomOut,
    fitWidth,
    getPageStyle,
    recomputeScaledDimensions,
    precomputePageDimensions,
    getViewportForPage,
    reset,
  }
}
