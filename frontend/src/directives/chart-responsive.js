/**
 * 增强版图表响应式指令
 * 提供更多配置选项和功能
 * 
 * 使用方式：
 * <div v-chart-responsive="options" ref="chart"></div>
 * 
 * options: {
 *   chart: chartInstance,           // ECharts 实例
 *   delay: 300,                    // 防抖延迟时间
 *   throttle: false,               // 是否使用节流而非防抖
 *   minWidth: 200,                 // 最小宽度
 *   minHeight: 150,                // 最小高度
 *   maintainAspectRatio: false,    // 是否保持宽高比
 *   aspectRatio: 16/9,             // 宽高比
 *   animationDuration: 300,        // 动画持续时间
 *   onResize: function(size) {},   // 自定义 resize 回调
 *   watchParent: true,             // 是否监听父容器变化
 *   autoInit: true                 // 是否自动初始化
 * }
 */

// 工具函数
const utils = {
  // 防抖函数
  debounce(func, wait, immediate) {
    let timeout
    return function executedFunction(...args) {
      const later = () => {
        timeout = null
        if (!immediate) func(...args)
      }
      const callNow = immediate && !timeout
      clearTimeout(timeout)
      timeout = setTimeout(later, wait)
      if (callNow) func(...args)
    }
  },

  // 节流函数
  throttle(func, limit) {
    let inThrottle
    return function(...args) {
      if (!inThrottle) {
        func.apply(this, args)
        inThrottle = true
        setTimeout(() => inThrottle = false, limit)
      }
    }
  },

  // 获取元素尺寸
  getElementSize(el) {
    const rect = el.getBoundingClientRect()
    return {
      width: rect.width,
      height: rect.height,
      offsetWidth: el.offsetWidth,
      offsetHeight: el.offsetHeight
    }
  },

  // 检查元素是否可见
  isElementVisible(el) {
    return !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length)
  }
}

// 默认配置
const DEFAULT_OPTIONS = {
  delay: 300,
  throttle: false,
  minWidth: 100,
  minHeight: 100,
  maintainAspectRatio: false,
  aspectRatio: 16 / 9,
  animationDuration: 300,
  watchParent: true,
  autoInit: true
}

// 存储元素相关数据的 Map
const elementDataMap = new WeakMap()

class ChartResponsiveHandler {
  constructor(el, options) {
    this.el = el
    this.options = { ...DEFAULT_OPTIONS, ...options }
    this.chart = this.options.chart
    this.resizeObserver = null
    this.mutationObserver = null
    this.windowResizeHandler = null
    this.isDestroyed = false
    
    this.init()
  }

  init() {
    if (!this.options.autoInit) return

    // 创建 resize 处理函数
    this.createResizeHandler()
    
    // 设置监听器
    this.setupObservers()
    
    // 初始化尺寸
    this.handleResize()
  }

  createResizeHandler() {
    const resizeLogic = () => {
      if (this.isDestroyed || !utils.isElementVisible(this.el)) return

      const currentSize = utils.getElementSize(this.el)
      
      // 应用最小尺寸限制
      let { width, height } = currentSize
      width = Math.max(width, this.options.minWidth)
      height = Math.max(height, this.options.minHeight)

      // 保持宽高比
      if (this.options.maintainAspectRatio) {
        const aspectRatio = this.options.aspectRatio
        if (width / height > aspectRatio) {
          width = height * aspectRatio
        } else {
          height = width / aspectRatio
        }
      }

      // 执行自定义回调
      if (typeof this.options.onResize === 'function') {
        try {
          this.options.onResize({
            width,
            height,
            originalSize: currentSize
          })
        } catch (error) {
          console.warn('Custom resize callback error:', error)
        }
      }

      // 调整图表尺寸
      this.resizeChart({ width, height })
    }

    // 根据配置选择防抖或节流
    if (this.options.throttle) {
      this.resizeHandler = utils.throttle(resizeLogic, this.options.delay)
    } else {
      this.resizeHandler = utils.debounce(resizeLogic, this.options.delay)
    }
  }

  resizeChart(size) {
    if (!this.chart || typeof this.chart.resize !== 'function') return

    try {
      // 添加动画效果
      this.chart.resize({
        width: size.width,
        height: size.height,
        animation: {
          duration: this.options.animationDuration
        }
      })
    } catch (error) {
      console.warn('Chart resize error:', error)
      // 降级处理
      try {
        this.chart.resize()
      } catch (fallbackError) {
        console.error('Chart resize fallback error:', fallbackError)
      }
    }
  }

  setupObservers() {
    // 使用 ResizeObserver（优先）
    if (typeof ResizeObserver !== 'undefined') {
      this.setupResizeObserver()
    } else {
      // 降级到传统方式
      this.setupLegacyObservers()
    }
  }

  setupResizeObserver() {
    this.resizeObserver = new ResizeObserver(entries => {
      for (let entry of entries) {
        if (entry.target === this.el) {
          this.resizeHandler()
          break
        }
      }
    })

    this.resizeObserver.observe(this.el)

    // 如果需要监听父容器
    if (this.options.watchParent && this.el.parentElement) {
      this.resizeObserver.observe(this.el.parentElement)
    }
  }

  setupLegacyObservers() {
    // Window resize 事件
    this.windowResizeHandler = () => this.resizeHandler()
    window.addEventListener('resize', this.windowResizeHandler)

    // DOM 变化监听
    if (this.options.watchParent) {
      this.mutationObserver = new MutationObserver(() => {
        this.resizeHandler()
      })

      const target = this.el.parentElement || document.body
      this.mutationObserver.observe(target, {
        attributes: true,
        attributeFilter: ['style', 'class'],
        subtree: false
      })
    }
  }

  updateChart(newChart) {
    this.chart = newChart
    // 立即触发一次 resize
    setTimeout(() => this.handleResize(), 50)
  }

  updateOptions(newOptions) {
    this.options = { ...this.options, ...newOptions }
    // 重新创建 resize 处理函数
    this.createResizeHandler()
  }

  handleResize() {
    if (this.resizeHandler) {
      this.resizeHandler()
    }
  }

  destroy() {
    this.isDestroyed = true

    // 清理 ResizeObserver
    if (this.resizeObserver) {
      this.resizeObserver.disconnect()
      this.resizeObserver = null
    }

    // 清理 MutationObserver
    if (this.mutationObserver) {
      this.mutationObserver.disconnect()
      this.mutationObserver = null
    }

    // 清理 window 事件
    if (this.windowResizeHandler) {
      window.removeEventListener('resize', this.windowResizeHandler)
      this.windowResizeHandler = null
    }

    // 清理引用
    this.el = null
    this.chart = null
    this.options = null
  }
}

// Vue 指令定义
const chartResponsive = {
  bind(el, binding) {
    const options = typeof binding.value === 'object' ? binding.value : { chart: binding.value }
    const handler = new ChartResponsiveHandler(el, options)
    elementDataMap.set(el, handler)
  },

  update(el, binding) {
    const handler = elementDataMap.get(el)
    if (!handler) return

    const newOptions = typeof binding.value === 'object' ? binding.value : { chart: binding.value }
    
    // 更新图表实例
    if (newOptions.chart && newOptions.chart !== handler.chart) {
      handler.updateChart(newOptions.chart)
    }

    // 更新其他选项
    if (typeof binding.value === 'object') {
      handler.updateOptions(newOptions)
    }
  },

  unbind(el) {
    const handler = elementDataMap.get(el)
    if (handler) {
      handler.destroy()
      elementDataMap.delete(el)
    }
  }
}

export default chartResponsive