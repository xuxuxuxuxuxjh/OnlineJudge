/**
 * 全局指令入口文件
 * 统一管理和注册所有自定义指令
 */

import chartResize from './chart-resize'
import chartResponsive from './chart-responsive'

// 指令集合
const directives = {
  'chart-resize': chartResize,
  'chart-responsive': chartResponsive
}

/**
 * 安装指令的函数
 * @param {Vue} Vue - Vue 构造函数
 */
const install = function(Vue) {
  // 注册所有指令
  Object.keys(directives).forEach(key => {
    Vue.directive(key, directives[key])
  })
}

// 如果是直接引入的方式，自动安装
if (typeof window !== 'undefined' && window.Vue) {
  install(window.Vue)
}

// 导出安装函数和各个指令
export default {
  install,
  ...directives
}

// 单独导出指令，方便按需引入
export {
  chartResize,
  chartResponsive
}