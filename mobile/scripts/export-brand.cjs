// Rasterize original vector brand artwork. No generated concept pixels are edited.
// Run with sharp available (NODE_PATH may point to the workspace dependency bundle).
const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');
const root = path.resolve(__dirname, '..');
const out = path.join(root, 'store-metadata/assets');
const defs = `<defs><linearGradient id="r" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#22E6DE"/><stop offset=".5" stop-color="#0AA9F9"/><stop offset="1" stop-color="#3564FA"/></linearGradient></defs>`;
const mark = `<path d="M348 157 C300 99 153 112 142 190 C130 273 374 238 365 323 C357 402 218 420 156 357" fill="none" stroke="url(#r)" stroke-width="74" stroke-linecap="round"/><path d="M254 208 Q263 246 300 255 Q263 264 254 301 Q245 264 208 255 Q245 246 254 208Z" fill="#fff"/>`;
const svg = (w,h,body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${defs}${body}</svg>`;
async function save(name, source, alpha=true) {
  fs.mkdirSync(path.dirname(path.join(out,name)),{recursive:true});
  fs.writeFileSync(path.join(out,name.replace(/\.png$/,'.svg')),source);
  let image=sharp(Buffer.from(source));
  image=alpha?image.ensureAlpha():image.flatten({background:'#153774'}).removeAlpha();
  await image.png().toFile(path.join(out,name));
}
(async()=>{
 const logo=svg(512,512,mark);
 await save('brand/logo.png',logo);
 await save('play-icon.png',svg(512,512,`<rect width="512" height="512" fill="#0F172A"/>${mark}`));
 await save('brand/launcher.png',svg(1024,1024,`<rect width="1024" height="1024" fill="#0F172A"/><g transform="scale(2)">${mark}</g>`));
 // All visible artwork fits inside the adaptive-icon central safe circle.
 await save('brand/adaptive-foreground.png',svg(1024,1024,`<g transform="translate(179 179) scale(1.3)">${mark}</g>`));
 await save('brand/wordmark.png',svg(1100,260,`<g transform="scale(.5)">${mark}</g><text x="280" y="157" font-family="Arial, sans-serif" font-size="115" font-weight="700" fill="#0F172A">SmartCare</text>`));
 await save('feature-graphic.png',svg(1024,500,`<rect width="1024" height="500" fill="#153774"/><circle cx="900" cy="65" r="250" fill="#1D56A0"/><circle cx="860" cy="460" r="240" fill="#0D7189"/><g transform="translate(670 150)"><rect width="130" height="164" rx="20" fill="#44DDD0" transform="rotate(-12)"/><rect x="35" y="8" width="130" height="164" rx="20" fill="#69B9FF" transform="rotate(10 100 80)"/><path d="M88 70 Q96 98 124 106 Q96 114 88 142 Q80 114 52 106 Q80 98 88 70" fill="#fff"/></g><text x="94" y="192" font-family="Arial, sans-serif" font-size="58" font-weight="700" fill="#fff">Make room for</text><text x="94" y="261" font-family="Arial, sans-serif" font-size="58" font-weight="700" fill="#fff">what matters.</text><text x="96" y="321" font-family="Arial, sans-serif" font-size="24" fill="#C8E9FF">Review files. Keep your favourites.</text><text x="96" y="370" font-family="Arial, sans-serif" font-size="22" font-weight="700" fill="#5FEBDA">SmartCare</text>`),false);
 fs.copyFileSync(path.join(out,'brand/launcher.png'),path.join(root,'src/assets/icon.png'));
 fs.copyFileSync(path.join(out,'brand/adaptive-foreground.png'),path.join(root,'src/assets/adaptive-icon.png'));
 fs.copyFileSync(path.join(out,'brand/logo.png'),path.join(root,'src/assets/logo.png'));
 await sharp(Buffer.from(logo)).resize(48,48).png().toFile(path.join(root,'src/assets/favicon.png'));
 for(const name of ['play-icon.png','feature-graphic.png','brand/launcher.png','brand/adaptive-foreground.png']) {
 const file=path.join(out,name);const meta=await sharp(file).metadata();console.log(name,meta.width,meta.height,'alpha='+meta.hasAlpha,fs.statSync(file).size+' bytes');
 }
})();
