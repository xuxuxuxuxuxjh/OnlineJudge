/**
 * 图表响应式指令
 * 用于自动处理 ECharts 图表的响应式调整
 * 
 * 使用方式：
 * <div v-chart-resize="chartInstance" ref="chart"></div>
 * 
 * 或者自动绑定到元素上的 ECharts 实例：
 * <div v-chart-resize></div>
 */

// 防抖函数
function debounce(func, wait, immediate) {
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
}

// ResizeObserver 兼容性检查和 polyfill
const isResizeObserverSupported = typeof ResizeObserver !== 'undefined'

// 存储图表实例和监听器的 Map
const chartInstanceMap = new WeakMap()
const resizeObserverMap = new WeakMap()

const chartResize = {
  bind(el, binding) {
    // 创建防抖的 resize 函数
    const debouncedResize = debounce(() => {
      const chartInstance = binding.value || chartInstanceMap.get(el)
      if (chartInstance && typeof chartInstance.resize === 'function') {
        try {
          // 延迟执行以确保 DOM 更新完成
          setTimeout(() => {
            chartInstance.resize()
          }, 100)
        } catch (error) {
          console.warn('Chart resize error:', error)
        }
      }
    }, 250)

    // 如果传入了图表实例，存储它
    if (binding.value) {
      chartInstanceMap.set(el, binding.value)
    }

    // 优先使用 ResizeObserver，如果不支持则使用 window resize
    if (isResizeObserverSupported) {
      const resizeObserver = new ResizeObserver(entries => {
        for (let entry of entries) {
          if (entry.target === el) {
            debouncedResize()
            break
          }
        }
      })
      
      resizeObserver.observe(el)
      resizeObserverMap.set(el, resizeObserver)
    } else {
      // 降级到 window resize 事件
      const resizeHandler = () => {
        // 检查元素是否仍然可见
        if (el.offsetWidth > 0 && el.offsetHeight > 0) {
          debouncedResize()
        }
      }

      window.addEventListener('resize', resizeHandler)
      
      // 监听父元素尺寸变化（针对容器内部变化）
      const mutationObserver = new MutationObserver(() => {
        resizeHandler()
      })
      
      mutationObserver.observe(el.parentElement || document.body, {
        attributes: true,
        attributeFilter: ['style', 'class'],
        subtree: false
      })

      // 存储清理函数
      el._chartResizeCleanup = () => {
        window.removeEventListener('resize', resizeHandler)
        mutationObserver.disconnect()
      }
    }

    // 存储防抖函数供后续使用
    el._debouncedResize = debouncedResize
  },

  update(el, binding) {
    // 更新图表实例
    if (binding.value && binding.value !== binding.oldValue) {
      chartInstanceMap.set(el, binding.value)
      
      // 立即触发一次 resize 以适应可能的尺寸变化
      if (el._debouncedResize) {
        el._debouncedResize()
      }
    }
  },

  unbind(el) {
    // 清理 ResizeObserver
    const resizeObserver = resizeObserverMap.get(el)
    if (resizeObserver) {
      resizeObserver.disconnect()
      resizeObserverMap.delete(el)
    }

    // 清理传统的事件监听器
    if (el._chartResizeCleanup) {
      el._chartResizeCleanup()
      delete el._chartResizeCleanup
    }

    // 清理防抖函数
    if (el._debouncedResize) {
      delete el._debouncedResize
    }

    // 清理图表实例引用
    chartInstanceMap.delete(el)
  }
}

export default chartResize