import Vue from 'vue'
import storage from '@/utils/storage'
import { STORAGE_KEY } from '@/utils/constants'
import ojAPI from '@oj/api'

function submissionMemoryFormat (memory) {
  if (memory === undefined) return '--'
  // 1048576 = 1024 * 1024
  let t = parseInt(memory) / 1048576
  return String(t.toFixed(0)) + 'MB'
}

function submissionTimeFormat (time) {
  if (time === undefined) return '--'
  return time + 'ms'
}

function getACRate (acCount, totalCount) {
  let rate = totalCount === 0 ? 0.00 : (acCount / totalCount * 100).toFixed(2)
  return String(rate) + '%'
}

// 去掉值为空的项，返回object
function filterEmptyValue (object) {
  let query = {}
  Object.keys(object).forEach(key => {
    if (object[key] || object[key] === 0 || object[key] === false) {
      query[key] = object[key]
    }
  })
  return query
}

// 按指定字符数截断添加换行，非英文字符按指定字符的半数截断
function breakLongWords (value, length = 16) {
  let re
  if (escape(value).indexOf('%u') === -1) {
    // 没有中文
    re = new RegExp('(.{' + length + '})', 'g')
  } else {
    // 中文字符
    re = new RegExp('(.{' + (length / 2 + 1) + '})', 'g')
  }
  return value.replace(re, '$1\n')
}

function downloadFile (url) {
  return new Promise((resolve, reject) => {
    Vue.prototype.$http.get(url, {responseType: 'blob'}).then(resp => {
      let headers = resp.headers
      
      // 改进错误处理：更准确的错误检测和资源清理
      if (headers['content-type'] && headers['content-type'].indexOf('json') !== -1) {
        const fr = new window.FileReader()
        
        fr.onload = (event) => {
          try {
            const data = JSON.parse(event.target.result)
            if (data.error) {
              Vue.prototype.$error(data.data || '下载失败')
              reject(new Error(data.data || '下载失败'))
            } else {
              Vue.prototype.$error('无效的文件格式')
              reject(new Error('无效的文件格式'))
            }
          } catch (parseError) {
            Vue.prototype.$error('文件解析失败')
            reject(parseError)
          }
        }
        
        fr.onerror = () => {
          Vue.prototype.$error('文件读取失败')
          reject(new Error('文件读取失败'))
        }
        
        const blob = new window.Blob([resp.data], {type: 'application/json'})
        fr.readAsText(blob)
        return
      }
      
      // 改进文件下载：更安全的文件名提取和资源清理
      try {
        const contentDisposition = headers['content-disposition']
        let filename = 'download'
        
        if (contentDisposition) {
          // 更安全的文件名提取，支持 UTF-8 编码
          const filenameMatch = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/)
          if (filenameMatch && filenameMatch[1]) {
            filename = filenameMatch[1].replace(/['"]/g, '')
            // 处理 UTF-8 编码的文件名
            try {
              filename = decodeURIComponent(filename)
            } catch (e) {
              // 如果解码失败，使用原始文件名
            }
          }
        }
        
        const blob = new window.Blob([resp.data], {type: headers['content-type']})
        const objectURL = window.URL.createObjectURL(blob)
        
        const link = document.createElement('a')
        link.href = objectURL
        link.download = filename
        link.style.display = 'none'
        
        document.body.appendChild(link)
        link.click()
        
        // 清理资源：移除 DOM 元素和释放 Object URL
        setTimeout(() => {
          document.body.removeChild(link)
          window.URL.revokeObjectURL(objectURL)
        }, 100)
        
        resolve(filename)
      } catch (downloadError) {
        Vue.prototype.$error('文件下载失败')
        reject(downloadError)
      }
    }).catch((error) => {
      Vue.prototype.$error('网络请求失败')
      reject(error)
    })
  })
}

function getLanguages () {
  return new Promise((resolve, reject) => {
    let languages = storage.get(STORAGE_KEY.languages)
    if (languages) {
      resolve(languages)
    }
    ojAPI.getLanguages().then(res => {
      let languages = res.data.data.languages
      storage.set(STORAGE_KEY.languages, languages)
      resolve(languages)
    }, err => {
      reject(err)
    })
  })
}

// 防抖函数：在事件被触发n秒后再执行回调，如果在这n秒内又被触发，则重新计时
function debounce (func, wait, immediate) {
  let timeout
  return function executedFunction (...args) {
    const later = () => {
      timeout = null
      if (!immediate) func.apply(this, args)
    }
    const callNow = immediate && !timeout
    clearTimeout(timeout)
    timeout = setTimeout(later, wait)
    if (callNow) func.apply(this, args)
  }
}

// 节流函数：规定在一个单位时间内，只能触发一次函数
function throttle (func, limit) {
  let inThrottle
  return function (...args) {
    if (!inThrottle) {
      func.apply(this, args)
      inThrottle = true
      setTimeout(() => (inThrottle = false), limit)
    }
  }
}

// 创建一个防抖化的搜索函数
function createDebouncedSearch (searchFunction, delay = 300) {
  return debounce(searchFunction, delay)
}

// 安全获取嵌套对象属性的函数
function safeGet (object, path, defaultValue = null) {
  const keys = path.split('.')
  let result = object
  
  for (const key of keys) {
    if (result === null || result === undefined || !(key in result)) {
      return defaultValue
    }
    result = result[key]
  }
  
  return result
}

// 通用的API错误处理函数
function handleApiError (error, context = '') {
  let errorMessage = '请求失败'
  
  // 尝试从多个可能的位置获取错误信息
  const errorData = safeGet(error, 'response.data.data') || 
                   safeGet(error, 'response.data.message') || 
                   safeGet(error, 'response.statusText') || 
                   safeGet(error, 'message')
  
  if (errorData) {
    errorMessage = typeof errorData === 'string' ? errorData : '服务器错误'
  }
  
  // 根据HTTP状态码提供更友好的错误信息
  const status = safeGet(error, 'response.status')
  switch (status) {
    case 400:
      errorMessage = '请求参数错误'
      break
    case 401:
      errorMessage = '请先登录'
      break
    case 403:
      errorMessage = '权限不足'
      break
    case 404:
      errorMessage = '资源不存在'
      break
    case 429:
      errorMessage = '请求过于频繁，请稍后再试'
      break
    case 500:
      errorMessage = '服务器内部错误'
      break
    case 502:
      errorMessage = '网关错误'
      break
    case 503:
      errorMessage = '服务暂不可用'
      break
  }
  
  if (context) {
    errorMessage = `${context}: ${errorMessage}`
  }
  
  return errorMessage
}

// 检查对象是否为空
function isEmpty (obj) {
  if (obj === null || obj === undefined) return true
  if (typeof obj === 'string') return obj.trim() === ''
  if (Array.isArray(obj)) return obj.length === 0
  if (typeof obj === 'object') return Object.keys(obj).length === 0
  return false
}

export default {
  submissionMemoryFormat: submissionMemoryFormat,
  submissionTimeFormat: submissionTimeFormat,
  getACRate: getACRate,
  filterEmptyValue: filterEmptyValue,
  breakLongWords: breakLongWords,
  downloadFile: downloadFile,
  getLanguages: getLanguages,
  debounce: debounce,
  throttle: throttle,
  createDebouncedSearch: createDebouncedSearch,
  safeGet: safeGet,
  handleApiError: handleApiError,
  isEmpty: isEmpty
}
