/**
 * 前端性能优化工具集
 * 提供各种性能优化的工具函数和Vue mixins
 */

// 高效的深拷贝函数
function deepClone (obj, cache = new WeakMap()) {
  // 处理基础类型和null
  if (obj === null || typeof obj !== 'object') {
    return obj
  }

  // 检查循环引用
  if (cache.has(obj)) {
    return cache.get(obj)
  }

  // 处理日期
  if (obj instanceof Date) {
    return new Date(obj.getTime())
  }

  // 处理数组
  if (Array.isArray(obj)) {
    const clonedArray = []
    cache.set(obj, clonedArray)
    for (let i = 0; i < obj.length; i++) {
      clonedArray[i] = deepClone(obj[i], cache)
    }
    return clonedArray
  }

  // 处理对象
  const clonedObj = {}
  cache.set(obj, clonedObj)
  for (const key in obj) {
    if (obj.hasOwnProperty(key)) {
      clonedObj[key] = deepClone(obj[key], cache)
    }
  }
  return clonedObj
}

// 浅拷贝函数（更高效）
function shallowClone (obj) {
  if (Array.isArray(obj)) {
    return [...obj]
  }
  if (obj && typeof obj === 'object') {
    return { ...obj }
  }
  return obj
}

// 对象比较函数（浅比较）
function shallowEqual (obj1, obj2) {
  const keys1 = Object.keys(obj1)
  const keys2 = Object.keys(obj2)

  if (keys1.length !== keys2.length) {
    return false
  }

  for (const key of keys1) {
    if (obj1[key] !== obj2[key]) {
      return false
    }
  }

  return true
}

// 数组比较函数
function arrayEqual (arr1, arr2) {
  if (arr1.length !== arr2.length) {
    return false
  }
  
  for (let i = 0; i < arr1.length; i++) {
    if (arr1[i] !== arr2[i]) {
      return false
    }
  }
  
  return true
}

// 缓存计算结果的装饰器
function memoize (fn, keyGenerator) {
  const cache = new Map()
  
  return function (...args) {
    const key = keyGenerator ? keyGenerator(args) : JSON.stringify(args)
    
    if (cache.has(key)) {
      return cache.get(key)
    }
    
    const result = fn.apply(this, args)
    cache.set(key, result)
    
    return result
  }
}

// Vue性能优化Mixin
const PerformanceMixin = {
  data () {
    return {
      // 用于缓存计算属性的结果
      _computedCache: new Map(),
      // 用于存储上次的props/data，避免不必要的重新渲染
      _lastState: null
    }
  },
  
  methods: {
    // 安全的深拷贝方法
    $deepClone (obj) {
      return deepClone(obj)
    },
    
    // 浅拷贝方法
    $shallowClone (obj) {
      return shallowClone(obj)
    },
    
    // 比较方法
    $shallowEqual (obj1, obj2) {
      return shallowEqual(obj1, obj2)
    },
    
    // 缓存方法调用结果
    $memoize (fn, key) {
      if (this._computedCache.has(key)) {
        return this._computedCache.get(key)
      }
      
      const result = fn.call(this)
      this._computedCache.set(key, result)
      
      return result
    },
    
    // 清除缓存
    $clearCache (key) {
      if (key) {
        this._computedCache.delete(key)
      } else {
        this._computedCache.clear()
      }
    },
    
    // 批量更新数据（减少响应式更新）
    $batchUpdate (updates) {
      this.$nextTick(() => {
        Object.assign(this.$data, updates)
      })
    }
  },
  
  beforeDestroy () {
    // 清理缓存，防止内存泄漏
    if (this._computedCache) {
      this._computedCache.clear()
    }
  }
}

// 大列表渲染优化Mixin
const VirtualListMixin = {
  data () {
    return {
      virtualList: {
        itemHeight: 50, // 每项的高度
        containerHeight: 400, // 容器高度
        scrollTop: 0, // 滚动位置
        buffer: 5 // 缓冲区项目数
      }
    }
  },
  
  computed: {
    // 可见项目的索引范围
    visibleRange () {
      const { itemHeight, containerHeight, scrollTop, buffer } = this.virtualList
      const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - buffer)
      const endIndex = Math.min(
        this.items.length - 1,
        Math.ceil((scrollTop + containerHeight) / itemHeight) + buffer
      )
      
      return { startIndex, endIndex }
    },
    
    // 当前可见的项目
    visibleItems () {
      const { startIndex, endIndex } = this.visibleRange
      return this.items.slice(startIndex, endIndex + 1).map((item, index) => ({
        ...item,
        index: startIndex + index
      }))
    },
    
    // 总高度
    totalHeight () {
      return this.items.length * this.virtualList.itemHeight
    },
    
    // 偏移量
    offsetY () {
      return this.visibleRange.startIndex * this.virtualList.itemHeight
    }
  },
  
  methods: {
    // 处理滚动事件
    handleScroll (event) {
      this.virtualList.scrollTop = event.target.scrollTop
    },
    
    // 更新项目高度
    updateItemHeight (height) {
      this.virtualList.itemHeight = height
    }
  }
}

// 防止频繁更新的Mixin
const ThrottleUpdateMixin = {
  data () {
    return {
      _updateTimer: null,
      _pendingUpdates: {}
    }
  },
  
  methods: {
    // 节流更新数据
    $throttleUpdate (key, value, delay = 100) {
      this._pendingUpdates[key] = value
      
      if (this._updateTimer) {
        clearTimeout(this._updateTimer)
      }
      
      this._updateTimer = setTimeout(() => {
        Object.keys(this._pendingUpdates).forEach(k => {
          this.$set(this, k, this._pendingUpdates[k])
        })
        this._pendingUpdates = {}
        this._updateTimer = null
      }, delay)
    }
  },
  
  beforeDestroy () {
    if (this._updateTimer) {
      clearTimeout(this._updateTimer)
    }
  }
}

export default {
  deepClone,
  shallowClone,
  shallowEqual,
  arrayEqual,
  memoize,
  PerformanceMixin,
  VirtualListMixin,
  ThrottleUpdateMixin
}