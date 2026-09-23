<template>
  <div class="pdf-viewer">
    <header class="toolbar">
      <div class="toolbar__left">
        <button
          v-for="s in sampleFiles" :key="s.name"
          class="toolbar__sample-btn"
          :class="{ 'toolbar__sample-btn--active': fileName === s.name }"
          :disabled="loading"
          @click="loadSample(s.name)"
        >{{ s.label }}</button>
        <div class="toolbar__divider" v-if="totalPages > 0" />
        <span class="toolbar__info" v-if="totalPages > 0">第 {{ currentVisiblePage }} / {{ totalPages }} 页</span>
      </div>
      <div class="toolbar__center">
        <div class="toolbar__search">
          <svg class="toolbar__search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            ref="searchInputRef"
            v-model="searchKeyword"
            type="text"
            class="toolbar__search-input"
            placeholder="搜索关键词..."
            :disabled="!pdfDoc || searching"
            @keyup.enter="startSearch"
          />
          <button
            v-if="searchKeyword"
            class="toolbar__search-clear"
            :disabled="searching"
            @click="clearSearch"
            title="清除搜索"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
          <button
            class="toolbar__btn toolbar__search-btn"
            :disabled="!pdfDoc || !searchKeyword.trim() || searching"
            @click="startSearch"
            title="搜索"
          >
            <svg v-if="!searching" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <div v-else class="toolbar__search-spinner"/>
          </button>
        </div>
        <span v-if="searchResult.totalMatches > 0" class="toolbar__search-count">
          {{ currentMatchIndex + 1 }} / {{ searchResult.totalMatches }}
        </span>
        <button
          v-if="searchResult.totalMatches > 0"
          class="toolbar__btn"
          :disabled="currentMatchIndex <= 0"
          @click="prevMatch"
          title="上一个匹配"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
            <polyline points="18 15 12 9 6 15"/>
          </svg>
        </button>
        <button
          v-if="searchResult.totalMatches > 0"
          class="toolbar__btn"
          :disabled="currentMatchIndex >= searchResult.totalMatches - 1"
          @click="nextMatch"
          title="下一个匹配"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </button>
        <div class="toolbar__divider" />
        <button class="toolbar__btn" :disabled="scale <= 0.25" @click="zoomOut" title="缩小">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="8" y1="11" x2="14" y2="11"/>
          </svg>
        </button>
        <span class="toolbar__zoom-value">{{ Math.round(scale * 100) }}%</span>
        <button class="toolbar__btn" :disabled="scale >= 5" @click="zoomIn" title="放大">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/>
          </svg>
        </button>
        <button class="toolbar__btn" @click="fitWidth" title="适合宽度">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
            <rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="3" x2="9" y2="21"/><line x1="15" y1="3" x2="15" y2="21"/>
          </svg>
        </button>
      </div>
      <div class="toolbar__right">
        <span class="toolbar__hint" v-if="totalPages > 0">可直接选中文字复制</span>
      </div>
    </header>

    <main class="pdf-main">
      <aside class="search-panel" v-if="showSearchPanel && searchResult.totalMatches > 0">
        <div class="search-panel__header">
          <span class="search-panel__title">搜索结果</span>
          <span class="search-panel__count">共 {{ searchResult.totalMatches }} 处</span>
          <button class="search-panel__close" @click="showSearchPanel = false" title="关闭">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
        <div class="search-panel__content">
          <div v-for="pageResult in searchResult.pages" :key="pageResult.pageNumber" class="search-panel__page-group">
            <div class="search-panel__page-header" @click="togglePageGroup(pageResult.pageNumber)">
              <svg class="search-panel__expand-icon" :class="{ 'search-panel__expand-icon--expanded': expandedPages.has(pageResult.pageNumber) }" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12">
                <polyline points="9 18 15 12 9 6"/>
              </svg>
              <span class="search-panel__page-title">第 {{ pageResult.pageNumber }} 页</span>
              <span class="search-panel__page-count">{{ pageResult.matches.length }} 处</span>
            </div>
            <div v-show="expandedPages.has(pageResult.pageNumber)" class="search-panel__matches">
              <div
                v-for="(match, idx) in pageResult.matches"
                :key="idx"
                class="search-panel__match"
                :class="{ 'search-panel__match--active': isCurrentMatch(match) }"
                @click="jumpToMatch(match)"
              >
                <span class="search-panel__match-text" v-html="highlightMatchText(match, pageResult.pageText)"></span>
              </div>
            </div>
          </div>
        </div>
      </aside>
      <div class="pdf-container" ref="containerRef" @scroll="onScroll">
        <div class="pdf-empty" v-if="!pdfDoc && !loading">
          <label class="pdf-empty__card pdf-empty__card--clickable">
            <svg class="pdf-empty__icon" viewBox="0 0 64 64" fill="none">
              <rect x="12" y="4" width="40" height="56" rx="4" stroke="#d9d9d9" stroke-width="2"/>
              <path d="M28 4V20H12" stroke="#d9d9d9" stroke-width="2"/>
              <text x="32" y="44" text-anchor="middle" fill="#bfbfbf" font-size="12" font-family="Arial">PDF</text>
            </svg>
            <p class="pdf-empty__text">点击上传 PDF 文件</p>
            <p class="pdf-empty__sub">点击上方示例按钮，或拖拽本地 PDF 文件到此处</p>
            <input type="file" accept=".pdf" class="pdf-empty__input" @change="onFileChange" />
          </label>
        </div>
        <div class="pdf-loading" v-if="loading">
          <div class="pdf-loading__spinner"/>
          <p class="pdf-loading__text">正在解析 PDF 文档...</p>
        </div>
        <div class="pdf-searching" v-if="searching">
          <div class="pdf-searching__spinner"/>
          <p class="pdf-searching__text">正在搜索：{{ searchKeyword }}</p>
          <p class="pdf-searching__progress">{{ searchProgress.current }} / {{ searchProgress.total }} 页</p>
        </div>
        <div class="pdf-error" v-if="errorMsg">
          <div class="pdf-error__card">
            <p class="pdf-error__text">{{ errorMsg }}</p>
            <button class="pdf-error__btn" @click="errorMsg = ''">关闭</button>
          </div>
        </div>
        <div class="pdf-pages" v-show="pdfDoc && !loading">
          <div v-for="pageNum in totalPages" :key="pageNum" class="pdf-page-wrapper"
            :data-page="pageNum" :ref="(el) => setPageRef(el as HTMLElement, pageNum)">
            <div class="pdf-page" :style="getPageStyle(pageNum)">
              <canvas :ref="(el) => setCanvasRef(el as HTMLCanvasElement, pageNum)"/>
              <div class="pdf-page__text-layer textLayer"
                :ref="(el) => setTextLayerRef(el as HTMLDivElement, pageNum)"/>
              <div class="pdf-page__annotation-layer annotationLayer"
                :ref="(el) => setAnnotationLayerRef(el as HTMLDivElement, pageNum)"/>
              <div class="pdf-page__highlight-layer"
                :ref="(el) => setHighlightLayerRef(el as HTMLDivElement, pageNum)"/>
            </div>
            <div class="pdf-page__number">{{ pageNum }}</div>
          </div>
        </div>
      </div>
    </main>
    <Transition name="toast">
      <div class="toast" v-if="toastMsg" :class="`toast--${toastType}`">{{ toastMsg }}</div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, nextTick, watch } from 'vue'
import { loadPdfDocument, preloadPdfjs, type PdfjsDocument } from '@/utils/pdf-engine'
import { usePageRegistry } from '@/composables/usePageRegistry'
import { usePageLayout } from '@/composables/usePageLayout'
import { usePageRecycler } from '@/composables/usePageRecycler'
import { useRenderQueue } from '@/composables/useRenderQueue'
import { useScrollSpy } from '@/composables/useScrollSpy'
import { useDocumentSearch } from '@/composables/useDocumentSearch'

const sampleFiles = [
  { name: 'sample.pdf', label: '示例一：学术论文' },
  { name: 'test.pdf', label: '示例二：200页压测' },
  { name: 'document.pdf', label: '示例三：图文混排' },
]

/* ---- 文档级响应式状态 ---- */
const pdfDoc = ref<PdfjsDocument | null>(null)
const totalPages = ref(0)
const loading = ref(false)
const errorMsg = ref('')
const fileName = ref('')
const toastMsg = ref('')
const toastType = ref<'success' | 'error' | 'info'>('info')

const containerRef = ref<HTMLElement | null>(null)

/* ---- Toast（查找模块通过回调使用，不属于查找职责） ---- */
let toastTimer: ReturnType<typeof setTimeout> | null = null
function showToast(msg: string, type: 'success' | 'error' | 'info' = 'info') {
  toastMsg.value = msg; toastType.value = type
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => { toastMsg.value = '' }, 3000)
}

/* ---- 各职责模块（按数据流接线，模块之间不直接相互引用） ---- */
// DOM 引用登记
const {
  canvasRefs, textLayerRefs, annotationLayerRefs, highlightLayerRefs, pageWrapperRefs,
  setCanvasRef, setTextLayerRef, setAnnotationLayerRef, setHighlightLayerRef, setPageRef,
  reset: resetRegistry,
} = usePageRegistry()

// 缩放与页面尺寸
const layout = usePageLayout({ containerRef, pdfDoc })
const {
  scale, pageDimensions,
  zoomIn, zoomOut, fitWidth, getPageStyle,
  recomputeScaledDimensions, precomputePageDimensions,
  reset: resetLayout,
} = layout

// LRU 页面回收
const recycler = usePageRecycler({
  layers: { canvasRefs, textLayerRefs, annotationLayerRefs, highlightLayerRefs },
  scale,
})

// 查找状态、检索流程与高亮
const {
  searchInputRef, searchKeyword, searching, searchCancelled, searchProgress,
  searchResult, currentMatchIndex, showSearchPanel, expandedPages,
  startSearch, clearSearch, refreshHighlights, isCurrentMatch,
  nextMatch, prevMatch, jumpToMatch, togglePageGroup, highlightMatchText,
  reset: resetSearch,
} = useDocumentSearch({
  pdfDoc,
  layout,
  highlightLayerRefs,
  pageWrapperRefs,
  containerRef,
  showToast,
})

// 滚动监听（可见页检测 / 当前页码）
const {
  currentVisiblePage, getVisiblePages, updateCurrentPage, onScroll,
  resetCurrentPage, setOnFrame,
} = useScrollSpy({ containerRef, pageWrapperRefs })

// 渲染队列（消费可见页，驱动 LRU 回收）
const { scheduleRender, invalidate: invalidateRender, cancel: cancelRender } = useRenderQueue({
  pdfDoc,
  scale,
  canvasRefs,
  textLayerRefs,
  annotationLayerRefs,
  pageWrapperRefs,
  pageDimensions,
  recycler,
  containerRef,
  getVisiblePages,
  // 保持与拆分前一致：调度末尾同步一次当前页码
  onAfterSchedule: updateCurrentPage,
})

// 滚动帧 → 调度渲染（打破 scrollSpy 与渲染队列的创建顺序环）
setOnFrame(scheduleRender)

/* ---- 缩放 watcher：跨模块编排（布局重算 → 作废渲染 → 重渲染 → 高亮重建） ---- */
watch(scale, async () => {
  if (!pdfDoc.value) return
  invalidateRender(); recycler.clear()
  recomputeScaledDimensions()
  await nextTick()
  scheduleRender()
  if (searchResult.totalMatches > 0) {
    refreshHighlights()
  }
})

/* ---- 加载 PDF ---- */
async function loadPdf(url: string) {
  loading.value = true; errorMsg.value = ''
  invalidateRender(); recycler.clear()
  resetLayout(); resetRegistry()

  resetSearch()

  try {
    const doc = await loadPdfDocument(url)
    pdfDoc.value = doc
    totalPages.value = doc.numPages
    resetCurrentPage()
    await precomputePageDimensions()
    loading.value = false
    showToast(`加载成功，共 ${doc.numPages} 页`, 'success')
    await nextTick()
    setTimeout(scheduleRender, 50)
  } catch (e: unknown) {
    loading.value = false
    const msg = e instanceof Error ? e.message : String(e)
    errorMsg.value = `PDF 加载失败: ${msg}`
    showToast('加载失败', 'error')
    console.error('PDF 加载失败:', e)
  }
}

function loadSample(name: string) {
  fileName.value = name
  loadPdf(`/${name}`)
}

function onFileChange(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0]
  if (!f) return
  if (f.type !== 'application/pdf') { showToast('请选择 PDF 文件', 'error'); return }
  fileName.value = f.name
  loadPdf(URL.createObjectURL(f))
}

function onDragOver(e: DragEvent) { e.preventDefault(); e.stopPropagation() }
function onDrop(e: DragEvent) {
  e.preventDefault(); e.stopPropagation()
  const f = e.dataTransfer?.files?.[0]
  if (!f || f.type !== 'application/pdf') { showToast('请拖入 PDF 文件', 'error'); return }
  fileName.value = f.name
  loadPdf(URL.createObjectURL(f))
}

onMounted(() => {
  document.addEventListener('dragover', onDragOver)
  document.addEventListener('drop', onDrop)
  preloadPdfjs().catch(() => {})
})

onUnmounted(() => {
  document.removeEventListener('dragover', onDragOver)
  document.removeEventListener('drop', onDrop)
  if (toastTimer) clearTimeout(toastTimer)
  searchCancelled.value = true
  cancelRender()
  pdfDoc.value?.destroy()
})
</script>

<style lang="scss" src="@/styles/pdf-viewer.scss" scoped></style>
