<template>
</template>

<script>
  import api from '../../api.js'

  export default {
    mounted () {
      api.logout().then(res => {
        // 清理用户相关缓存
        api.cache.clearUserCache()
        this.$store.dispatch('clearProfile')
        this.$router.replace({
          path: '/'
        })
      })
    }
  }
</script>
