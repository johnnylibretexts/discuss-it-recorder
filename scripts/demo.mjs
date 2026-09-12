// Local-only development demo. No login, API, upload or persistent storage.
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
const root = process.cwd()
const component = fs.readFileSync('resources/js/components/recording/VideoRecorder.vue', 'utf8')
const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname
  if (pathname === '/') {
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.end('<!doctype html><html lang="en"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Discuss-It recorder demo</title><link rel="stylesheet" href="/demo.css"><main><h1>Discuss-It recorder</h1><p>This demo records on your device. Nothing is uploaded. Download a copy before leaving.</p><div id="app"></div></main><script type="module">import Vue from "/vue.js"; import Recorder from "/component.js"; new Vue({render:h=>h(Recorder)}).$mount("#app")</script></html>'); return
  }
  if (pathname === '/component.js') {
    res.setHeader('Content-Type', 'application/javascript')
    const script = component.match(/<script>([\s\S]*?)<\/script>/)[1]
      .replace("'../../media/recording/Recorder'", "'/resources/js/media/recording/Recorder.js'")
      .replace("'../../media/recording/BackgroundImage.js'", "'/resources/js/media/recording/BackgroundImage.js'")
      .replace('export default', 'const component =')
    res.end(`${script}\ncomponent.template=${JSON.stringify(component.match(/<template>([\s\S]*?)<\/template>/)[1])};export default component;`); return
  }
  if (pathname === '/demo.css') {
    res.setHeader('Content-Type', 'text/css')
    res.end('html{font:16px system-ui}body{margin:0;padding:16px}*{box-sizing:border-box}main{max-width:760px;margin:auto}button,select,input{font:inherit}button,a.btn{padding:10px;border:1px solid #64748b;border-radius:5px}a{color:#1255a0}.alert{padding:12px;background:#fff0c2}' + component.match(/<style scoped>([\s\S]*?)<\/style>/)[1]); return
  }
  const relative = pathname === '/vue.js' ? 'node_modules/vue/dist/vue.esm.browser.js' : pathname.slice(1)
  if (pathname !== '/vue.js' && !/^\/(resources\/js\/media\/recording|assets\/discuss-it)\//.test(pathname)) { res.writeHead(404); res.end(); return }
  const file = path.resolve(root, pathname.startsWith('/assets/') ? 'public/' + relative : relative)
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); res.end(); return }
  res.setHeader('Content-Type', /\.js$/.test(file) ? 'application/javascript' : file.endsWith('.wasm') ? 'application/wasm' : 'application/octet-stream')
  fs.createReadStream(file).pipe(res)
})
server.listen(Number(process.env.PORT || 4173), '127.0.0.1', () => console.log(`Recorder demo: http://127.0.0.1:${server.address().port}`))
export default server
