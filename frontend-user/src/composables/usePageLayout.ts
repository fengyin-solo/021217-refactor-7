import { reactive } from 'vue'
import { getPageBaseDimensions, type PdfjsDocument } from '@/utils/pdf-engine'

/**
 * 页面尺寸与缩放布局：
 * - pageBaseDims：每页 scale=1 时的基础尺寸（预计算，支持混合页面大小）
 * - pageDimensions：当前 scale 下的实际像素尺寸，驱动 template 中 .pdf-page 的宽高
 * 只管尺寸数据本身，不关心渲染与滚动。
 */
export function usePageLayout() {
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

  /* ---- 页面尺寸 ---- */
  function getPageStyle(n: number) {
    const d = pageDimensions.get(n)
    return d ? { width: `${d.width}px`, height: `${d.height}px` } : {}
  }

  /** 根据 pageBaseDims 和当前 scale 重新计算所有页面的像素尺寸 */
  function recomputeScaledDimensions(scale: number) {
    for (const [n, base] of pageBaseDims) {
      pageDimensions.set(n, {
        width: base.baseWidth * scale,
        height: base.baseHeight * scale,
      })
    }
  }

  /**
   * 预计算所有页面的基础尺寸（scale=1）。
   * 逐页获取 viewport，正确处理混合页面大小（纵向/横向/不同尺寸）。
   */
  async function precomputePageDimensions(doc: PdfjsDocument) {
    const baseDims = await getPageBaseDimensions(doc)
    pageBaseDims.clear()
    for (const [n, dim] of baseDims) {
      pageBaseDims.set(n, dim)
    }
  }

  /** 切换文档时清空尺寸数据 */
  function reset() {
    pageDimensions.clear()
    pageBaseDims.clear()
  }

  return {
    pageBaseDims,
    pageDimensions,
    getPageStyle,
    recomputeScaledDimensions,
    precomputePageDimensions,
    reset,
  }
}
