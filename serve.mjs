import http from 'node:http';
import { readFile } from 'node:fs/promises';
const files = new Map([['/','prihozhaya-varianty.html'],['/prihozhaya-3d.html','prihozhaya-3d.html'],['/prihozhaya-varianty.html','prihozhaya-varianty.html']]);
http.createServer(async(req,res)=>{const file=files.get(req.url);if(!file){res.writeHead(404);res.end();return;}try{res.setHeader('Content-Type','text/html; charset=utf-8');res.end(await readFile(file));}catch{res.writeHead(503);res.end('Build first: npm run build');}}).listen(4173,'127.0.0.1',()=>console.log('Loft living room: http://127.0.0.1:4173'));
