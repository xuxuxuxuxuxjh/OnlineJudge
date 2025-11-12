/**
 * API缓存管理工具
 * 提供请求去重、结果缓存、智能失效等功能
 * 专为OnlineJudge前端第三轮迭代优化设计
 */

class APICache {
  constructor() {
    // 请求缓存：存储API响应结果
    this.cache = new Map()
    // 请求进行中标记：防止重复请求
    this.pendingRequests = new Map()
    // 默认缓存时间：5分钟
    this.defaultTTL = 5 * 60 * 1000
    
    // 不同API的缓存配置
    this.cacheConfig = {
      // 长期缓存（30分钟）- 相对稳定的数据
      'website': { ttl: 30 * 60 * 1000 },
      'languages': { ttl: 30 * 60 * 1000 },
      'problem/tags': { ttl: 30 * 60 * 1000 },
      
      // 中期缓存（10分钟）- 中等频率更新的数据
      'announcement': { ttl: 10 * 60 * 1000 },
      'problem': { ttl: 10 * 60 * 1000 },
      'contest': { ttl: 10 * 60 * 1000 },
      
      // 短期缓存（2分钟）- 频繁更新的数据
      'submissions': { ttl: 2 * 60 * 1000 },
      'contest_rank': { ttl: 2 * 60 * 1000 },
      'user_rank': { ttl: 2 * 60 * 1000 }
    }
  }

  /**
   * 生成缓存键
   * @param {string} url - API路径
   * @param {string} method - HTTP方法
   * @param {Object} params - 请求参数
   * @returns {string} 缓存键
   */
  generateKey(url, method, params = {}) {
    const sortedParams = Object.keys(params)
      .sort()
      .reduce((result, key) => {
        result[key] = params[key]
        return result
      }, {})
    
    return `${method}:${url}:${JSON.stringify(sortedParams)}`
  }

  /**
   * 检查是否应该缓存该请求
   * @param {string} url - API路径
   * @param {string} method - HTTP方法
   * @returns {boolean} 是否可缓存
   */
  isCacheable(url, method) {
    // 只缓存GET请求
    if (method.toUpperCase() !== 'GET') {
      return false
    }
    
    // 排除一些不应缓存的API
    const nonCacheablePatterns = [
      /captcha/, // 验证码每次都应该是新的
      /logout/,  // 登出操作
      /session/, // 会话相关
      /csrf/     // CSRF令牌
    ]
    
    return !nonCacheablePatterns.some(pattern => pattern.test(url))
  }

  /**
   * 获取API的缓存配置
   * @param {string} url - API路径
   * @returns {Object} 缓存配置
   */
  getCacheConfig(url) {
    // 匹配具体的缓存配置
    for (const [pattern, config] of Object.entries(this.cacheConfig)) {
      if (url.includes(pattern)) {
        return config
      }
    }
    
    // 默认配置
    return { ttl: this.defaultTTL }
  }

  /**
   * 检查缓存是否有效
   * @param {Object} cacheItem - 缓存项
   * @returns {boolean} 是否有效
   */
  isValid(cacheItem) {
    if (!cacheItem) return false
    return Date.now() - cacheItem.timestamp < cacheItem.ttl
  }

  /**
   * 从缓存获取数据
   * @param {string} key - 缓存键
   * @returns {any|null} 缓存的数据或null
   */
  get(key) {
    const cacheItem = this.cache.get(key)
    if (this.isValid(cacheItem)) {
      console.log(`[API Cache] Cache hit: ${key}`)
      return cacheItem.data
    }
    
    // 清理过期缓存
    if (cacheItem) {
      this.cache.delete(key)
    }
    
    return null
  }

  /**
   * 设置缓存
   * @param {string} key - 缓存键
   * @param {any} data - 要缓存的数据
   * @param {number} ttl - 缓存时间（毫秒）
   */
  set(key, data, ttl = this.defaultTTL) {
    this.cache.set(key, {
      data: data,
      timestamp: Date.now(),
      ttl: ttl
    })
    
    console.log(`[API Cache] Cache set: ${key}, TTL: ${ttl}ms`)
  }

  /**
   * 清理所有缓存
   */
  clear() {
    this.cache.clear()
    this.pendingRequests.clear()
    console.log('[API Cache] All cache cleared')
  }

  /**
   * 清理特定模式的缓存
   * @param {string|RegExp} pattern - 匹配模式
   */
  clearPattern(pattern) {
    const regex = typeof pattern === 'string' ? new RegExp(pattern) : pattern
    const keysToDelete = []
    
    for (const key of this.cache.keys()) {
      if (regex.test(key)) {
        keysToDelete.push(key)
      }
    }
    
    keysToDelete.forEach(key => {
      this.cache.delete(key)
      console.log(`[API Cache] Pattern cache cleared: ${key}`)
    })
  }

  /**
   * 检查是否有正在进行的请求
   * @param {string} key - 缓存键
   * @returns {Promise|null} 正在进行的请求Promise或null
   */
  getPendingRequest(key) {
    return this.pendingRequests.get(key) || null
  }

  /**
   * 设置正在进行的请求
   * @param {string} key - 缓存键
   * @param {Promise} promise - 请求Promise
   */
  setPendingRequest(key, promise) {
    this.pendingRequests.set(key, promise)
    
    // 请求完成后清理
    promise.finally(() => {
      this.pendingRequests.delete(key)
    })
  }

  /**
   * 获取缓存统计信息
   * @returns {Object} 统计信息
   */
  getStats() {
    let validCount = 0
    let expiredCount = 0
    
    for (const cacheItem of this.cache.values()) {
      if (this.isValid(cacheItem)) {
        validCount++
      } else {
        expiredCount++
      }
    }
    
    return {
      total: this.cache.size,
      valid: validCount,
      expired: expiredCount,
      pending: this.pendingRequests.size
    }
  }
}

// 创建全局单例
const apiCache = new APICache()

// 定期清理过期缓存（每10分钟）
setInterval(() => {
  const stats = apiCache.getStats()
  if (stats.expired > 0) {
    const keysToDelete = []
    for (const [key, cacheItem] of apiCache.cache.entries()) {
      if (!apiCache.isValid(cacheItem)) {
        keysToDelete.push(key)
      }
    }
    keysToDelete.forEach(key => apiCache.cache.delete(key))
    console.log(`[API Cache] Cleaned ${keysToDelete.length} expired cache items`)
  }
}, 10 * 60 * 1000)

export default apiCache