import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import './build-learning-data.mjs';
const root=path.resolve(fileURLToPath(new URL('..',import.meta.url)));
const source=path.join(root,'dist');
const names=['index.html','style.css','vocabulary.css','app.js','vocabulary-data.js','learning-data.js','vocabulary.js','sync-model.js','sync.js','pwa.js','sw.js','manifest.webmanifest','images/word-anchors.svg','icons/icon-192.png','icons/icon-512.png','icons/maskable-512.png','icons/apple-touch-icon.png'];
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'application/javascript; charset=utf-8','.json':'application/json','.webmanifest':'application/manifest+json','.png':'image/png','.svg':'image/svg+xml'};
const assets={};
for(const name of names){const body=await fs.readFile(path.join(source,name));assets['/'+name]={type:types[path.extname(name)],body:body.toString('base64')};}
const model=await fs.readFile(path.join(source,'sync-model.js'),'utf8');
const worker=await fs.readFile(path.join(root,'worker/index.js'),'utf8');
const output=path.join(source,'server');await fs.mkdir(output,{recursive:true});
await fs.writeFile(path.join(output,'index.js'),model+'\nconst ASSETS='+JSON.stringify(assets)+';\n'+worker);
await fs.mkdir(path.join(source,'.openai'),{recursive:true});await fs.copyFile(path.join(root,'.openai/hosting.json'),path.join(source,'.openai/hosting.json'));
await fs.cp(path.join(root,'drizzle'),path.join(source,'drizzle'),{recursive:true});
// ESM packaging validator from the supported starter contract.
const compiled=await fs.readFile(path.join(output,'index.js'),'utf8');
const module=await import('data:text/javascript;base64,'+Buffer.from(compiled).toString('base64'));
if(typeof module.default?.fetch!=='function')throw new Error('Worker must export default.fetch');
console.log('Built and validated Worker ESM with '+names.length+' embedded assets');
