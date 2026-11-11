import { chromium } from 'playwright';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const html = resolve('docs/manual/manual.html');
const destino = resolve('docs/Manual-JULEX-negocios.pdf');

const navegador = await chromium.launch({ channel: 'chrome', headless: true });
const pagina = await navegador.newPage();
await pagina.goto(pathToFileURL(html).href, { waitUntil: 'networkidle' });
await pagina.evaluate(() => document.fonts.ready);
await pagina.emulateMedia({ media: 'print' });

await pagina.pdf({
  path: destino,
  format: 'A4',
  printBackground: true,
  displayHeaderFooter: true,
  headerTemplate: '<div></div>',
  footerTemplate:
    '<div style="width:100%;padding:0 16mm;font-family:Helvetica,Arial,sans-serif;font-size:7.5pt;color:#8b897f;display:flex;justify-content:space-between;">' +
    '<span>JULEX · Manual del negocio</span>' +
    '<span class="pageNumber"></span>' +
    '</div>',
  margin: { top: '16mm', bottom: '18mm', left: '16mm', right: '16mm' },
});

console.log('PDF:', destino);
await navegador.close();
