<template>
  <div style="margin: 0px 0px 15px 0px">
    <Row type="flex" justify="space-between" class="header">
      <Col :span=12>
      <div>
        <span>{{$t('m.Language')}}:</span>
        <Select :value="language" @on-change="onLangChange" class="adjust">
          <Option v-for="item in languages" :key="item" :value="item">{{item}}
          </Option>
        </Select>

        <Tooltip :content="this.$i18n.t('m.Reset_to_default_code_definition')" placement="top" style="margin-left: 10px">
          <Button icon="refresh" @click="onResetClick"></Button>
        </Tooltip>

        <Tooltip :content="this.$i18n.t('m.Upload_file')" placement="top" style="margin-left: 10px">
          <Button icon="upload" @click="onUploadFile"></Button>
        </Tooltip>

        <Tooltip content="AI Modify Code (GPT-3.5-turbo)" placement="top" style="margin-left: 10px">
          <Button icon="ios-color-wand" :loading="aiModifying" @click="onAIModify" :disabled="!value || value.trim() === ''">
            AI Modify
          </Button>
        </Tooltip>

        <input type="file" id="file-uploader" style="display: none" @change="onUploadFileDone">
        
        <div style="margin-top: 10px;">
          <Input 
            v-model="openaiApiKey" 
            type="password"
            placeholder="Enter your OpenAI API Key"
            style="width: 100%;"
            :show-password="true">
            <span slot="prepend">OpenAI API Key:</span>
          </Input>
          <p style="margin-top: 5px; font-size: 12px; color: #999;">
            Enter your OpenAI API Key to use AI Modify feature. If empty, default key will be used.
          </p>
        </div>

      </div>
      </Col>
      <Col :span=12>
      <div class="fl-right">
        <span>{{$t('m.Theme')}}:</span>
        <Select :value="theme" @on-change="onThemeChange" class="adjust">
          <Option v-for="item in themes" :key="item.label" :value="item.value">{{item.label}}
          </Option>
        </Select>
      </div>
      </Col>
    </Row>
    <codemirror :value="value" :options="options" @change="onEditorCodeChange" ref="myEditor">
    </codemirror>
  </div>
</template>
<script>
  import utils from '@/utils/utils'
  import { codemirror } from 'vue-codemirror-lite'
  import api from '@oj/api'

  // theme
  import 'codemirror/theme/monokai.css'
  import 'codemirror/theme/solarized.css'
  import 'codemirror/theme/material.css'

  // mode
  import 'codemirror/mode/clike/clike.js'
  import 'codemirror/mode/python/python.js'
  import 'codemirror/mode/go/go.js'
  import 'codemirror/mode/javascript/javascript.js'

  // active-line.js
  import 'codemirror/addon/selection/active-line.js'

  // foldGutter
  import 'codemirror/addon/fold/foldgutter.css'
  import 'codemirror/addon/fold/foldgutter.js'
  import 'codemirror/addon/fold/brace-fold.js'
  import 'codemirror/addon/fold/indent-fold.js'

  export default {
    name: 'CodeMirror',
    components: {
      codemirror
    },
    data () {
      return {
        aiModifying: false,
        openaiApiKey: '',
        options: {
          // codemirror options
          tabSize: 4,
          mode: 'text/x-csrc',
          theme: 'solarized',
          lineNumbers: true,
          line: true,
          // 代码折叠
          foldGutter: true,
          gutters: ['CodeMirror-linenumbers', 'CodeMirror-foldgutter'],
          // 选中文本自动高亮，及高亮方式
          styleSelectedText: true,
          lineWrapping: true,
          highlightSelectionMatches: {showToken: /\w/, annotateScrollbar: true}
        },
        mode: {
          'C++': 'text/x-csrc'
        },
        themes: [
          {label: this.$i18n.t('m.Monokai'), value: 'monokai'},
          {label: this.$i18n.t('m.Solarized_Light'), value: 'solarized'},
          {label: this.$i18n.t('m.Material'), value: 'material'}
        ]
      }
    },
    props: {
      value: {
        type: String,
        default: ''
      },
      languages: {
        type: Array,
        default: () => {
          return ['C', 'C++', 'Java', 'Python2']
        }
      },
      language: {
        type: String,
        default: 'C++'
      },
      theme: {
        type: String,
        default: 'solarized'
      },
      problemDescription: {
        type: String,
        default: ''
      }
    },
    mounted () {
      utils.getLanguages().then(languages => {
        let mode = {}
        languages.forEach(lang => {
          mode[lang.name] = lang.content_type
        })
        this.mode = mode
        this.editor.setOption('mode', this.mode[this.language])
      })
      this.editor.focus()
    },
    methods: {
      onEditorCodeChange (newCode) {
        this.$emit('update:value', newCode)
      },
      onLangChange (newVal) {
        this.editor.setOption('mode', this.mode[newVal])
        this.$emit('changeLang', newVal)
      },
      onThemeChange (newTheme) {
        this.editor.setOption('theme', newTheme)
        this.$emit('changeTheme', newTheme)
      },
      onResetClick () {
        this.$emit('resetCode')
      },
      onUploadFile () {
        document.getElementById('file-uploader').click()
      },
      onUploadFileDone () {
        let f = document.getElementById('file-uploader').files[0]
        let fileReader = new window.FileReader()
        let self = this
        fileReader.onload = function (e) {
          var text = e.target.result
          self.editor.setValue(text)
          document.getElementById('file-uploader').value = ''
        }
        fileReader.readAsText(f, 'UTF-8')
      },
      onAIModify () {
        if (!this.value || this.value.trim() === '') {
          this.$Message.warning('Code cannot be empty')
          return
        }
        
        // API Key is optional, will use default if empty
        // Removed the check to allow using default key
        
        this.aiModifying = true
        const data = {
          code: this.value,
          language: this.language,
          problem_description: this.problemDescription || '',
          openai_api_key: this.openaiApiKey.trim()
        }
        
        api.aiModifyCode(data).then(res => {
          this.aiModifying = false
          const modifiedCode = res.data.data.modified_code
          if (modifiedCode) {
            this.editor.setValue(modifiedCode)
            this.$Message.success('Code modified successfully by AI')
          } else {
            this.$Message.warning('No modified code returned')
          }
        }).catch(err => {
          this.aiModifying = false
          const errorMsg = (err.response && err.response.data && err.response.data.data) || err.message || 'Unknown error'
          this.$Message.error('Failed to modify code: ' + errorMsg)
        })
      }
    },
    computed: {
      editor () {
        // get current editor object
        return this.$refs.myEditor.editor
      }
    },
    watch: {
      'theme' (newVal, oldVal) {
        this.editor.setOption('theme', newVal)
      }
    }
  }
</script>

<style lang="less" scoped>
  .header {
    margin: 5px 5px 15px 5px;
    .adjust {
      width: 150px;
      margin-left: 10px;
    }
    .fl-right {
      float: right;
    }
  }
</style>

<style>
  .CodeMirror {
    height: auto !important;
  }
  .CodeMirror-scroll {
    min-height: 300px;
    max-height: 1000px;
  }
</style>
