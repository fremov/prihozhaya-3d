import { build } from 'esbuild';
import { readFile, writeFile } from 'node:fs/promises';
const result = await build({entryPoints:['room.js'],bundle:true,write:false,format:'iife',minify:true,legalComments:'inline'});
const template = await readFile('viewer.html','utf8');
const html = template.replace('<!-- BUNDLE -->',()=>'<script>'+result.outputFiles[0].text.replaceAll('</script','<\\/script')+'</script>');
for (const output of ['prihozhaya-3d.html', 'prihozhaya-varianty.html']) {
  await writeFile(output, html);
  console.log('Created '+output+' — standalone, no network dependencies');
}
