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

export default {
  submissionMemoryFormat: submissionMemoryFormat,
  submissionTimeFormat: submissionTimeFormat,
  getACRate: getACRate,
  filterEmptyValue: filterEmptyValue,
  breakLongWords: breakLongWords,
  downloadFile: downloadFile,
  getLanguages: getLanguages
}
