import { ref, reactive, computed, type Ref } from 'vue'
import {
  searchDocument, buildHighlightLayer, clearHighlightLayer,
  type PdfjsDocument, type PdfjsViewport,
  type SearchMatch, type SearchResult,
} from '@/utils/pdf-engine'
import type { usePageElements } from './usePageElements'
import type { usePageLayout } from './usePageLayout'

export interface PdfSearchContext {
  getDoc: () => PdfjsDocument | null
  getScale: () => number
  containerRef: Ref<HTMLElement | null>
  elements: ReturnType<typeof usePageElements>
  layout: ReturnType<typeof usePageLayout>
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void
}

/**
 * 查找相关的全部状态与行为：
 * 搜索词/进度/结果、结果面板展开状态、上一处/下一处、点击结果跳转、
 * 以及页面高亮层的构建、刷新与清除。
 * 不感知滚动调度与渲染队列；跳转只通过容器 scrollTo 完成，
 * 随后由滚动事件自然驱动目标页渲染。
 */
export function usePdfSearch(ctx: PdfSearchContext) {
  const { getDoc, getScale, containerRef, elements, layout, showToast } = ctx

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

  /* ---- 非响应式内部状态 ---- */
  let highlightVersion = 0

  /* ---- 搜索功能 ---- */
  async function startSearch() {
    const keyword = searchKeyword.value.trim()
    const doc = getDoc()
    if (!keyword || !doc) return

    searching.value = true
    searchCancelled.value = false
    searchProgress.current = 0
    searchProgress.total = doc.numPages
    currentMatchIndex.value = -1

    Object.assign(searchResult, {
      keyword,
      totalMatches: 0,
      totalPages: doc.numPages,
      pages: [],
    })

    clearAllHighlights()

    try {
      const result = await searchDocument(
        doc,
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

  function clearAllHighlights() {
    highlightVersion++
    for (const container of elements.highlightLayerRefs.values()) {
      clearHighlightLayer(container)
    }
  }

  function refreshHighlights() {
    // 作废可能进行中的旧高亮构建（当前构建为同步操作，保留版本计数语义）
    ++highlightVersion
    const matchesByPage = new Map<number, SearchMatch[]>()
    for (const match of allMatches.value) {
      if (!matchesByPage.has(match.pageNumber)) {
        matchesByPage.set(match.pageNumber, [])
      }
      matchesByPage.get(match.pageNumber)!.push(match)
    }

    const scale = getScale()
    for (const [pageNum, matches] of matchesByPage) {
      const container = elements.highlightLayerRefs.get(pageNum)
      if (!container) continue

      const base = layout.pageBaseDims.get(pageNum)
      if (!base) continue

      const viewport = {
        width: base.baseWidth * scale,
        height: base.baseHeight * scale,
        scale,
        rotation: 0,
        transform: [1, 0, 0, 1, 0, 0],
        clone: () => ({ /* 简化的 clone，实际高亮层不需要完整 viewport */ }),
      } as unknown as PdfjsViewport

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

  function jumpToMatch(match: SearchMatch) {
    const idx = allMatches.value.findIndex(
      (m) => m.pageNumber === match.pageNumber && m.matchIndex === match.matchIndex,
    )
    if (idx !== -1) {
      currentMatchIndex.value = idx
    }

    const wrapper = elements.pageWrapperRefs.get(match.pageNumber)
    if (!wrapper || !containerRef.value) return

    const containerHeight = containerRef.value.clientHeight
    const wrapperTop = wrapper.offsetTop
    const wrapperHeight = wrapper.offsetHeight

    const matchTop = match.transform[5] * getScale()
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

  /** 换文档时复位查找状态（不主动清理高亮层，引用注册表本身也会被清空） */
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

  /** 组件卸载时终止进行中的搜索 */
  function dispose() {
    searchCancelled.value = true
  }

  return {
    searchKeyword,
    searching,
    searchProgress,
    searchResult,
    currentMatchIndex,
    showSearchPanel,
    expandedPages,
    allMatches,
    startSearch,
    clearSearch,
    refreshHighlights,
    isCurrentMatch,
    nextMatch,
    prevMatch,
    jumpToMatch,
    togglePageGroup,
    highlightMatchText,
    reset,
    dispose,
  }
}
