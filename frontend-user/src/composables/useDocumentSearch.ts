import { ref, reactive, computed, type Ref } from 'vue'
import {
  searchDocument, buildHighlightLayer, clearHighlightLayer,
  type PdfjsDocument, type PdfjsViewport, type SearchResult, type SearchMatch,
} from '@/utils/pdf-engine'

type ToastType = 'success' | 'error' | 'info'

/** 查找模块对布局的全部依赖：当前缩放比 + 按缩放构造单页 viewport */
export interface SearchLayout {
  scale: Ref<number>
  getViewportForPage(n: number): PdfjsViewport | null
}

/**
 * 文档查找
 *
 * 收拢查找相关的全部状态与行为：关键字输入、逐页检索（可取消、带进度）、
 * 结果面板分组展开、当前匹配游标、上一个/下一个/点击跳转，以及页面上的
 * 高亮层绘制与刷新。
 *
 * 与渲染管线互不感知：回收某页时由外部直接清空其高亮 DOM，本模块在下次
 * refreshHighlights 时按当前匹配状态重建。
 */
export function useDocumentSearch(options: {
  pdfDoc: Ref<PdfjsDocument | null>
  layout: SearchLayout
  highlightLayerRefs: Map<number, HTMLDivElement>
  pageWrapperRefs: Map<number, HTMLElement>
  containerRef: Ref<HTMLElement | null>
  showToast: (msg: string, type?: ToastType) => void
}) {
  const { pdfDoc, layout, highlightLayerRefs, pageWrapperRefs, containerRef, showToast } = options

  const searchInputRef = ref<HTMLInputElement | null>(null)

  /* ---- 搜索相关状态 ---- */
  const searchKeyword = ref('')
  const searching = ref(false)
  const searchCancelled = ref(false)
  const searchProgress = reactive({ current: 0, total: 0 })
  const searchResult = reactive<SearchResult>({
    keyword: '',
    totalMatches: 0,
    totalPages: 0,
    pages: [],
  })
  const currentMatchIndex = ref(-1)
  const showSearchPanel = ref(false)
  const expandedPages = reactive(new Set<number>())
  const allMatches = computed<SearchMatch[]>(() => {
    return searchResult.pages.flatMap((p) => p.matches)
  })

  // 作废进行中的高亮构建（缩放/清除时自增）
  let highlightVersion = 0

  function clearAllHighlights() {
    highlightVersion++
    for (const container of highlightLayerRefs.values()) {
      clearHighlightLayer(container)
    }
  }

  /** 按当前 scale 与当前匹配游标重建所有命中页的高亮层 */
  function refreshHighlights() {
    ++highlightVersion
    const matchesByPage = new Map<number, SearchMatch[]>()
    for (const match of allMatches.value) {
      if (!matchesByPage.has(match.pageNumber)) {
        matchesByPage.set(match.pageNumber, [])
      }
      matchesByPage.get(match.pageNumber)!.push(match)
    }

    for (const [pageNum, matches] of matchesByPage) {
      const container = highlightLayerRefs.get(pageNum)
      if (!container) continue

      const viewport = layout.getViewportForPage(pageNum)
      if (!viewport) continue

      let pageCurrentIdx: number | undefined
      if (currentMatchIndex.value >= 0 && currentMatchIndex.value < allMatches.value.length) {
        const currentMatch = allMatches.value[currentMatchIndex.value]
        if (currentMatch && currentMatch.pageNumber === pageNum) {
          pageCurrentIdx = currentMatch.matchIndex
        }
      }

      buildHighlightLayer(container, matches, viewport, pageCurrentIdx)
    }
  }

  async function startSearch() {
    const keyword = searchKeyword.value.trim()
    if (!keyword || !pdfDoc.value) return

    searching.value = true
    searchCancelled.value = false
    searchProgress.current = 0
    searchProgress.total = pdfDoc.value.numPages
    currentMatchIndex.value = -1

    Object.assign(searchResult, {
      keyword,
      totalMatches: 0,
      totalPages: pdfDoc.value.numPages,
      pages: [],
    })

    clearAllHighlights()

    try {
      const result = await searchDocument(
        pdfDoc.value,
        keyword,
        false,
        (page, total) => {
          searchProgress.current = page
          searchProgress.total = total
        },
        () => searchCancelled.value,
      )

      if (!searchCancelled.value) {
        Object.assign(searchResult, result)
        expandedPages.clear()
        result.pages.forEach((p) => expandedPages.add(p.pageNumber))

        if (result.totalMatches > 0) {
          showSearchPanel.value = true
          currentMatchIndex.value = -1
          showToast(`找到 ${result.totalMatches} 处匹配`, 'success')
          refreshHighlights()
        } else {
          showToast('未找到匹配内容', 'info')
        }
      }
    } catch (e) {
      console.error('搜索失败:', e)
      showToast('搜索失败', 'error')
    } finally {
      searching.value = false
    }
  }

  function clearSearch() {
    searchCancelled.value = true
    searching.value = false
    searchKeyword.value = ''
    currentMatchIndex.value = -1
    showSearchPanel.value = false
    Object.assign(searchResult, {
      keyword: '',
      totalMatches: 0,
      totalPages: 0,
      pages: [],
    })
    expandedPages.clear()
    clearAllHighlights()
  }

  function getCurrentMatch(): SearchMatch | null {
    if (currentMatchIndex.value < 0 || currentMatchIndex.value >= allMatches.value.length) {
      return null
    }
    return allMatches.value[currentMatchIndex.value] || null
  }

  function isCurrentMatch(match: SearchMatch): boolean {
    const current = getCurrentMatch()
    return current !== null &&
      current.pageNumber === match.pageNumber &&
      current.matchIndex === match.matchIndex
  }

  function nextMatch() {
    if (allMatches.value.length === 0) return
    currentMatchIndex.value = Math.min(
      currentMatchIndex.value + 1,
      allMatches.value.length - 1,
    )
    const match = getCurrentMatch()
    if (match) {
      jumpToMatch(match)
      refreshHighlights()
    }
  }

  function prevMatch() {
    if (allMatches.value.length === 0) return
    currentMatchIndex.value = Math.max(currentMatchIndex.value - 1, 0)
    const match = getCurrentMatch()
    if (match) {
      jumpToMatch(match)
      refreshHighlights()
    }
  }

  /** 定位到指定匹配：匹配位置滚动到视口垂直居中，并刷新当前高亮 */
  function jumpToMatch(match: SearchMatch) {
    const idx = allMatches.value.findIndex(
      (m) => m.pageNumber === match.pageNumber && m.matchIndex === match.matchIndex,
    )
    if (idx !== -1) {
      currentMatchIndex.value = idx
    }

    const wrapper = pageWrapperRefs.get(match.pageNumber)
    if (!wrapper || !containerRef.value) return

    const containerTop = containerRef.value.scrollTop
    const containerHeight = containerRef.value.clientHeight
    const wrapperTop = wrapper.offsetTop
    const wrapperHeight = wrapper.offsetHeight

    const matchTop = match.transform[5] * layout.scale.value
    const targetTop = wrapperTop + matchTop - containerHeight / 2

    containerRef.value.scrollTo({
      top: targetTop,
      behavior: 'smooth',
    })

    refreshHighlights()
  }

  function togglePageGroup(pageNumber: number) {
    if (expandedPages.has(pageNumber)) {
      expandedPages.delete(pageNumber)
    } else {
      expandedPages.add(pageNumber)
    }
  }

  /** 生成面板中匹配项的上下文片段 HTML（关键字以外内容转义） */
  function highlightMatchText(match: SearchMatch, pageText: string): string {
    const contextLength = 30
    const start = Math.max(0, match.startOffset - contextLength)
    const end = Math.min(pageText.length, match.endOffset + contextLength)

    const before = start > 0 ? '...' : ''
    const after = end < pageText.length ? '...' : ''
    const prefix = pageText.substring(start, match.startOffset)
    const matched = pageText.substring(match.startOffset, match.endOffset)
    const suffix = pageText.substring(match.endOffset, end)

    const escapeHtml = (str: string) => str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')

    return `${before}${escapeHtml(prefix)}<mark class="search-panel__match-mark">${escapeHtml(matched)}</mark>${escapeHtml(suffix)}${after}`
  }

  /** 加载新文档前重置查找状态（不主动清高亮 DOM，与原行为一致） */
  function reset() {
    searchCancelled.value = true
    searching.value = false
    searchKeyword.value = ''
    currentMatchIndex.value = -1
    showSearchPanel.value = false
    Object.assign(searchResult, {
      keyword: '',
      totalMatches: 0,
      totalPages: 0,
      pages: [],
    })
    expandedPages.clear()
  }

  return {
    searchInputRef,
    searchKeyword,
    searching,
    searchCancelled,
    searchProgress,
    searchResult,
    currentMatchIndex,
    showSearchPanel,
    expandedPages,
    allMatches,
    startSearch,
    clearSearch,
    clearAllHighlights,
    refreshHighlights,
    getCurrentMatch,
    isCurrentMatch,
    nextMatch,
    prevMatch,
    jumpToMatch,
    togglePageGroup,
    highlightMatchText,
    reset,
  }
}
