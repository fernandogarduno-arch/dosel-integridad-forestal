import { build } from 'esbuild';
import fs from 'fs';
const r = await build({ entryPoints: ['src/main.js'], bundle: true, minify: true, format: 'iife', loader: { '.json': 'json' }, write: false, target: 'es2020', logLevel: 'warning' });
let js = r.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const css = fs.readFileSync('src/style.css', 'utf8');
const html = fs.readFileSync('src/index.html', 'utf8').replace('/*__CSS__*/', () => css).replace('/*__JS__*/', () => js);
fs.mkdirSync('dist', { recursive: true }); fs.writeFileSync('dist/index.html', html);
console.log('OK', (html.length / 1024).toFixed(0), 'KB');
// Fragmento para publicar como Artifact (el skeleton lo agrega la plataforma)
const frag = `<title>Verificación Forestal Michoacán</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap" rel="stylesheet">
<style>${css}</style>
<div id="app"></div>
<script>${js}</script>`;
fs.writeFileSync('dist/artifact.html', frag);
console.log('artifact fragment', (frag.length / 1024).toFixed(0), 'KB');
