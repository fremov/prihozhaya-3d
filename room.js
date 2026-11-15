import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';

const $ = id => document.getElementById(id);
const cfg = { L: 6, W: 6, H: 2.7, door: .6 };
let underStairs = 'closed';
let clearanceGroup;
const scene = new THREE.Scene();
scene.background = new THREE.Color('#e2e6de');
const camera = new THREE.PerspectiveCamera(44, 1, .05, 100);
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
} catch (error) {
  $('loading').textContent = 'WebGL недоступен. План расстановки доступен кнопкой «План с размерами».';
  $('loading').style.pointerEvents = 'none';
}
if (renderer) {
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  $('stage').prepend(renderer.domElement);
}
const controls = renderer ? new OrbitControls(camera, renderer.domElement) : null;
if (controls) {
  controls.maxPolarAngle = Math.PI / 2 - .015;
  controls.minDistance = .4;
  controls.maxDistance = 25;
  controls.addEventListener('change', render);
}
const ambient = new THREE.HemisphereLight('#fffcf2', '#9ca58f', 2.2);
scene.add(ambient);
const sun = new THREE.DirectionalLight('#fff5df', 3);
sun.position.set(2, 9, 5);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -9, right: 9, top: 9, bottom: -9, near: .1, far: 30 });
sun.shadow.bias = -.0003;
sun.shadow.normalBias = .025;
scene.add(sun);
const fill = new THREE.DirectionalLight('#dae6ef', 1.2);
fill.position.set(-3, 5, -2);
scene.add(fill);
const warmLights = [];
const standard = (color, props = {}) => new THREE.MeshStandardMaterial({ color, roughness: .82, ...props });
function woodTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 128; canvas.height = 512;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#bc996e'; ctx.fillRect(0, 0, 128, 512);
  for (let i = 0; i < 150; i++) {
    ctx.strokeStyle = `rgba(${i % 3 ? '96,65,34' : '240,215,170'},${.025 + (i % 5) * .009})`;
    ctx.beginPath();
    const x = (i * 47.31) % 128;
    ctx.moveTo(x, 0);
    ctx.bezierCurveTo(x + Math.sin(i) * 6, 150, x - Math.cos(i) * 4, 350, x + 2, 512);
    ctx.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
const wood = woodTexture();
const mat = {
  wall: standard('#d4cfc5'), front: standard('#454340'), wood: standard('#ffffff', { map: wood }),
  floor: standard('#cfc7b9'), floorAlt: standard('#d7cfc2'), grout: standard('#b8b1a5'),
  dark: standard('#252525', { metalness: .6, roughness: .4 }), white: standard('#ded9cf'),
  fabric: standard('#a15e3d', { roughness: 1 }), rug: standard('#898178', { roughness: 1 }),
  mirror: standard('#b2c5c6', { metalness: .2, roughness: .18 }),
  door: standard('#77736e'), handle: standard('#858d88', { metalness: .9, roughness: .2 }),
  led: standard('#ffdeb0', { emissive: '#ffcf8a', emissiveIntensity: .5 }),
  leaf: standard('#596f4c'), pot: standard('#c6b8a5'),
  clearance: standard('#7caa75', { transparent: true, opacity: .28, depthWrite: false }),
  screen: standard('#18232a', { roughness: .35 }),
  brick: standard('#925e48'),
  book: standard('#bca58a'),
};
const geometry = new THREE.BoxGeometry(1, 1, 1);
const cylinder = new THREE.CylinderGeometry(1, 1, 1, 24);
let root, walls = [], doors, labels, items = [], activeView = 'overall', selected = null;
const selectable = [];
function box(parent, name, x, y, z, w, h, d, material) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.position.set(x, y, z); mesh.scale.set(w, h, d);
  mesh.castShadow = true; mesh.receiveShadow = true;
  parent.add(mesh); return mesh;
}
function round(parent, name, x, y, z, r, h, material) {
  const mesh = new THREE.Mesh(cylinder, material);
  mesh.name = name; mesh.position.set(x, y, z); mesh.scale.set(r, h, r);
  mesh.castShadow = true; parent.add(mesh); return mesh;
}
function bar(parent, a, b, thickness, material) {
  const p = new THREE.Vector3(...a), q = new THREE.Vector3(...b);
  const mesh = box(parent, 'Поручень', 0, 0, 0, thickness, p.distanceTo(q), thickness, material);
  mesh.position.copy(p).add(q).multiplyScalar(.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), q.sub(p).normalize());
}
function label(text, x, y, z, width = 1.2) {
  const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 96;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'rgba(250,251,248,.95)'; ctx.beginPath(); ctx.roundRect(0, 0, 512, 96, 16); ctx.fill();
  ctx.fillStyle = '#34482f'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = '500 35px Segoe UI, sans-serif';
  ctx.fillText(text, 256, 48);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false }));
  sprite.position.set(x, y, z); sprite.scale.set(width, width * 96 / 512, 1); sprite.renderOrder = 5;
  labels.add(sprite);
}
function makeItem(id, title, size, description, plan, build) {
  const group = new THREE.Group(); group.name = title; group.userData.item = id;
  root.add(group); selectable.push(group);
  const item = { id, title, size, description, plan, group };
  items.push(item); build(group); return item;
}
function wall(side, length, openings) {
  const group = new THREE.Group(); group.name = `Стена ${side}`;
  root.add(group); walls.push({ side, group });
  const northSouth = side === 'north' || side === 'south';
  function segment(a, b, y, height) {
    if (b <= a) return;
    const center = (a + b) / 2;
    const x = northSouth ? center : side === 'west' ? -.06 : cfg.L + .06;
    const z = northSouth ? side === 'north' ? -.06 : cfg.W + .06 : center;
    box(group, 'Штукатурка', x, y, z, northSouth ? b - a : .12, height, northSouth ? .12 : b - a, mat.wall);
    if (y < .1 + height / 2) box(group, 'Плинтус', x, .045, z, northSouth ? b - a : .145, .09, northSouth ? .145 : b - a, mat.white);
  }
  let previous = 0;
  for (const opening of openings) {
    const { start, width, title } = opening;
    segment(previous, start, cfg.H / 2, cfg.H);
    segment(start, start + width, 2.1 + (cfg.H - 2.1) / 2, cfg.H - 2.1);
    const frame = new THREE.Group(); group.add(frame);
    for (const t of [start, start + width]) {
      box(frame, 'Наличник', northSouth ? t : side === 'west' ? .015 : cfg.L - .015, 1.06,
        northSouth ? side === 'north' ? .015 : cfg.W - .015 : t,
        northSouth ? .055 : .065, 2.12, northSouth ? .065 : .055, mat.white);
    }
    box(frame, 'Наличник верх', northSouth ? start + width / 2 : side === 'west' ? .015 : cfg.L - .015, 2.12,
      northSouth ? side === 'north' ? .015 : cfg.W - .015 : start + width / 2,
      northSouth ? width + .08 : .065, .055, northSouth ? .065 : width + .08, mat.white);
    const leaf = box(doors, title, northSouth ? start + width / 2 : side === 'west' ? 0 : cfg.L, 1.035,
      northSouth ? side === 'north' ? 0 : cfg.W : start + width / 2,
      northSouth ? width - .04 : .04, 2.07, northSouth ? .04 : width - .04, mat.door);
    leaf.userData.opening = title;
    box(doors, 'Ручка', leaf.position.x + (northSouth ? width / 2 - .12 : side === 'west' ? .05 : -.05), 1.02,
      leaf.position.z + (northSouth ? side === 'north' ? .06 : -.06 : width / 2 - .12),
      northSouth ? .13 : .07, .025, northSouth ? .07 : .13, mat.handle);
    previous = start + width;
  }
  segment(previous, length, cfg.H / 2, cfg.H);
}
function rebuild() {
  if (root) {
    root.traverse(obj => { if (obj.isSprite && obj.material?.map) { obj.material.map.dispose(); obj.material.dispose(); } });
    scene.remove(root);
  }
  warmLights.splice(0).forEach(light => scene.remove(light));
  walls = []; items = []; selectable.length = 0;
  root = new THREE.Group(); root.name = 'Лофт-гостиная — предварительный проект'; scene.add(root);
  doors = new THREE.Group(); doors.name = 'Дверные полотна'; doors.visible = $('doors').checked; root.add(doors);
  labels = new THREE.Group(); labels.name = 'Подписи'; root.add(labels);
  const { L, W, H, door } = cfg;
  clearanceGroup = new THREE.Group(); clearanceGroup.name = 'Свободные подходы'; root.add(clearanceGroup);
  clearanceGroup.visible = $('clearances')?.checked ?? false;
  box(root, 'Основание пола', L / 2, -.065, W / 2, L + .24, .12, W + .24, mat.grout);
  for (let z = 0, row = 0; z < W; z += 1.2, row++) {
    for (let x = -.1 * (row % 2), col = 0; x < L; x += .2, col++) {
      const a = Math.max(0, x), b = Math.min(L, x + .2), end = Math.min(W, z + 1.2);
      if (b - a > .01) box(root, 'Керамогранит под дерево', (a + b) / 2, .004, (z + end) / 2, b - a - .003, .015, end - z - .003, (row + col) % 4 ? mat.floor : mat.floorAlt);
    }
  }
  wall('north', L, [{ start: 1.16, width: door, title: 'Дверь 1' }, { start: 1.16 + door + 1.8, width: door, title: 'Дверь 2' }]);
  wall('west', W, [{ start: .7, width: .8, title: 'Терраса / улица' }]);
  wall('east', W, [{ start: 1, width: .8, title: 'Боковая дверь' }]);
  wall('south', L, [{ start: 1.3, width: .92, title: 'Веранда' }]);
  // Lounge along the left wall; the middle stays a circulation zone.
  makeItem('sofa', 'Двухместный диван', '190 × 90 × 82 см', 'У левой глухой стены, после двери с террасы. Коньячная обивка, тонкие чёрные ножки. Диван обращён к лестнице и необязательному телевизору; не заменяет проход к дверям.', [.08, 2.05, .9, 1.9], group => {
    box(group, 'Основание дивана', .53, .29, 3, .9, .22, 1.9, mat.fabric);
    box(group, 'Спинка', .17, .59, 3, .19, .46, 1.9, mat.fabric);
    for (const z of [2.15, 3.85]) box(group, 'Подлокотник', .55, .49, z, .85, .38, .2, mat.fabric);
    for (const z of [2.6, 3.4]) box(group, 'Подушка сиденья', .62, .44, z, .68, .14, .77, mat.fabric);
    for (const x of [.22, .85]) for (const z of [2.2, 3.8]) box(group, 'Ножка дивана', x, .1, z, .035, .2, .035, mat.dark);
  });
  box(root, 'Ковёр гостиной', 1.55, .023, 3.05, 2.2, .02, 2.3, mat.rug);
  makeItem('shelf', 'Открытый стеллаж', '120 × 32 × 200 см', 'Продолжает левую стену после дивана. Чёрный металлический каркас и дубовые полки для книг и декора; отделяет гостиную от барной зоны, не перекрывая центр. Закрепить к стене.', [.04, W - 1.55, .32, 1.2], group => {
    const cz = W - .95;
    for (const x of [.06, .34]) for (const z of [cz - .58, cz + .58]) box(group, 'Стойка стеллажа', x, 1, z, .025, 2, .025, mat.dark);
    for (let i = 0; i < 5; i++) {
      const y = .12 + i * .45;
      box(group, 'Дубовая полка', .2, y, cz, .32, .035, 1.2, mat.wood);
      if (i < 4) for (let j = 0; j < 4; j++) box(group, 'Книга', .19, y + .15, cz - .35 + j * .055 + (i % 2) * .4, .18, .26 - j * .02, .04, j % 2 ? mat.book : mat.front);
    }
  });
  const mirrorX = 1.16 + door + .9;
  makeItem('mirror', 'Ростовое зеркало между дверями', '110 × 210 см · отступ от пола 5 см', 'По центру простенка 180 см: по 35 см до соседних проёмов при исходных дверях. Без консоли перед зеркалом — отражение в полный рост и свободный подход. Тонкая чёрная рама; стекло здесь схематичное, без реального отражения.', [mirrorX - .55, .03, 1.1, .06], group => {
    box(group, 'Чёрная рама зеркала', mirrorX, 1.1, .055, 1.1, 2.1, .055, mat.dark);
    box(group, 'Зеркальное полотно', mirrorX, 1.1, .088, 1.055, 2.055, .012, mat.mirror);
    for (const x of [mirrorX - .57, mirrorX + .57]) box(group, 'Подсветка зеркала', x, 1.1, .04, .012, 2, .012, mat.led);
  });
  makeItem('bar', 'Барная стойка на двоих', '150 × 55 × 105 см · два стула', 'У стены справа от выхода на веранду. Столешница из дуба, металлическая опора; стулья со стороны комнаты. Стойка — для кофе и общения, без мойки. До лестницы 90 см по ширине при комнате 6 м; выход на веранду не занят.', [2.6, W - .58, 1.5, .55], group => {
    const cz = W - .305;
    box(group, 'Барная столешница', 3.35, 1.025, cz, 1.5, .05, .55, mat.wood);
    for (const x of [2.68, 4.02]) for (const z of [cz - .21, cz + .21]) box(group, 'Опора барной стойки', x, .5, z, .035, 1, .035, mat.dark);
    bar(group, [2.68, .24, cz + .2], [4.02, .24, cz + .2], .025, mat.dark);
    for (const x of [2.95, 3.75]) {
      round(group, 'Сиденье барного стула', x, .735, W - 1.02, .2, .07, mat.wood);
      for (const dx of [-.13, .13]) for (const dz of [-.13, .13]) box(group, 'Ножка стула', x + dx, .35, W - 1.02 + dz, .022, .7, .022, mat.dark);
      bar(group, [x - .13, .25, W - 1.15], [x + .13, .25, W - 1.15], .02, mat.dark);
    }
  });
  const stairX = L - .55, run = 3.4 / 16, rise = H / 16;
  makeItem('stairs', 'Лестница и металлическое ограждение', 'Существующий марш · условно 90 × 340 см', 'Сохраняем положение лестницы, не проектируем новую конструкцию. Дубовые ступени и частые чёрные стойки визуально выделяют лестничную зону. У первой ступени до дальней стены всего 35 см: боковой заход и высоту прохода обязательно проверить обмером; это не согласованное безопасное решение.', [L - 1, W - 3.75, .9, 3.4], group => {
    for (let i = 0; i < 16; i++) {
      const y = (i + 1) * rise, z = W - .35 - (i + .5) * run;
      box(group, 'Дубовая ступень', stairX, y - .028, z, .9, .055, run + .025, mat.wood);
      for (const offset of [-run / 4, run / 4]) box(group, 'Стойка зонирующего ограждения', L - 1, y + .44, z + offset, .018, .95, .018, mat.dark);
    }
    for (const x of [L - .95, L - .15]) bar(group, [x, .07, W - .31], [x, H - .06, W - 3.76], .075, mat.dark);
    bar(group, [L - 1, rise + .91, W - .35 - run / 2], [L - 1, H + .91, W - 3.75 + run / 2], .04, mat.dark);
  });
  makeItem('understairs', underStairs === 'closed' ? 'Под лестницей · всё закрыто' : 'Под лестницей · открытая ниша', 'Заполнение по уклону · глубина около 80 см', underStairs === 'closed'
    ? 'Графитовое заполнение ступенчатым контуром полностью закрывает пространство под маршем. За ТВ — неподвижная панель, соседние секции открываются в комнату. Высоты, доступ за панель и способ открывания определить после замера косоуров и коммуникаций.'
    : 'Открытые дубовые полки в чёрном каркасе и тёплая подсветка превращают пространство под лестницей в библиотеку и место для декора. Не рабочее место: высота под маршем недостаточна. ТВ при желании отключается кнопкой.', [L - .95, W - 3.75, .8, 3.4], group => {
    if (underStairs === 'closed') {
      for (let i = 0; i < 16; i++) {
        const h = (i + 1) * rise - .09, z = W - .35 - (i + .5) * run;
        box(group, 'Закрытое заполнение под лестницей', L - .55, h / 2 + .014, z, .8, h, run - .006, mat.front);
        if (i > 1 && i < 10) box(group, 'Ручка секции', L - .962, Math.max(.12, h - .1), z, .025, .018, .075, mat.dark);
      }
    } else {
      for (let i = 0; i < 4; i++) {
        const z = W - 3.75 + .4 + i * .8;
        const h = Math.max(.1, (15 - (i + 1) * .8 / run) * rise - .18);
        box(group, 'Задник открытой ниши', L - .13, h / 2 + .04, z, .035, h, .78, mat.front);
        for (const dz of [-.39, .39]) box(group, 'Каркас ниши', L - .55, h / 2 + .04, z + dz, .8, h, .022, mat.dark);
        for (let y = .08; y < h; y += .4) {
          box(group, 'Полка под лестницей', L - .55, y, z, .8, .025, .78, mat.wood);
          box(group, 'Подсветка полки', L - .93, y - .02, z, .015, .012, .7, mat.led);
          if (y + .2 < h) for (let j = 0; j < 3; j++) box(group, 'Книга в нише', L - .78, y + .12, z - .22 + j * .075, .22, .21, .055, mat.book);
        }
      }
    }
  });
  if ($('tv').checked) makeItem('tv', 'Телевизор · опционально', 'Экран около 50″ · напротив дивана', 'Перед высокой частью подлестничного заполнения, на отдельном металлическом каркасе. Около 4 м до дивана; диагональ и высоту центра подобрать на месте. Можно убрать переключателем: расстановка мебели не меняется.', [L - 1.13, W - 3.675, .1, 1.15], group => {
    const z = W - 3.1;
    for (const dz of [-.5, .5]) box(group, 'Неподвижная опора ТВ', L - 1.06, .73, z + dz, .035, 1.46, .035, mat.dark);
    box(group, 'Корпус телевизора', L - 1.1, 1.15, z, .055, .67, 1.15, mat.dark);
    box(group, 'Экран телевизора', L - 1.132, 1.15, z, .009, .625, 1.105, mat.screen);
  });
  // A restrained brick accent marks the stair zone without changing openings.
  for (let row = 0; row < 13; row++) for (let col = 0; col < 6; col++) {
    box(walls.find(wall => wall.side === 'east').group, 'Кирпич акцентной стены', L - .012, .12 + row * .19, W - 3.65 + col * .52 + (row % 2) * .13, .025, .175, .49, mat.brick);
  }
  for (const zone of [
    { x: 1.05, z: 1.55, w: 1.2, d: W - 1.65, label: 'Маршрут к веранде' },
    { x: 1, z: .75, w: L - 1.2, d: .8, label: 'К дверям' },
    { x: L - 1.9, z: W - 1.2, w: .85, d: .8, label: 'Боковой заход — проверить' },
  ]) {
    const mesh = box(clearanceGroup, zone.label, zone.x + zone.w / 2, .04, zone.z + zone.d / 2, zone.w, .006, zone.d, mat.clearance);
    mesh.castShadow = false; mesh.receiveShadow = false; mesh.userData.clearance = true;
  }
  for (let i = 0; i < 2; i++) {
    const x = L * (.32 + i * .36);
    box(root, 'Линия потолочного света (потолок скрыт)', x, H - .075, W / 2, .055, .045, 2.5, mat.dark);
    for (let j = 0; j < 3; j++) {
      round(root, 'Светильник', x, H - .15, W / 2 - .9 + j * .9, .055, .12, mat.dark);
      round(root, 'Рассеиватель', x, H - .215, W / 2 - .9 + j * .9, .046, .012, mat.led);
    }
    const light = new THREE.PointLight('#ffca88', 0, 8, 2); light.position.set(x, H - .3, W / 2); scene.add(light); warmLights.push(light);
  }
  label('Терраса / улица', -.3, .1, 1.1, 1.4);
  label('Веранда · 92 см', 1.76, .08, W + .35, 1.5);
  selected = null;
  $('items').innerHTML = items.map((item, i) => `<button class="item" data-item="${item.id}" aria-pressed="false"><span class="number">${String(i + 1).padStart(2, '0')}</span><span><strong>${item.title}</strong><small>${item.size}</small></span></button>`).join('');
  $('dimensions').textContent = `${L.toFixed(2).replace('.', ',')} × ${W.toFixed(2).replace('.', ',')} м · ${(L * W).toFixed(1).replace('.', ',')} м² · высота ${H.toFixed(2).replace('.', ',')} м (уточнить)`;
  $('layoutHeading').textContent = underStairs === 'closed' ? 'Графитовые фасады под лестницей' : 'Открытая библиотека под лестницей';
  $('layoutSummary').textContent = 'Диван и стеллаж слева, бар у веранды, ростовое зеркало между дверями. Дуб, чёрный металл, бетонный тон стен и кирпичный акцент у лестницы.';
  selectItem('understairs');
  updatePlan(); setLight(document.querySelector('[data-light][aria-pressed="true"]').dataset.light);
  setView(activeView);
}
function selectItem(id) {
  const item = items.find(item => item.id === id);
  if (!item) return;
  selected = id;
  document.querySelectorAll('[data-item]').forEach(button => button.setAttribute('aria-pressed', button.dataset.item === id));
  $('selected').innerHTML = `<p class="eyebrow">Проектная мебель / ${items.indexOf(item) + 1}</p><h2>${item.title}</h2><p>${item.size}</p><p class="muted">${item.description}</p>`;
  render();
}
function render() {
  if (!renderer || !root || activeView === 'plan') return;
  for (const { side, group } of walls) group.visible = !(
    (side === 'north' && camera.position.z < -.1) || (side === 'south' && camera.position.z > cfg.W + .1) ||
    (side === 'west' && camera.position.x < -.1) || (side === 'east' && camera.position.x > cfg.L + .1));
  renderer.render(scene, camera);
}
function setView(view) {
  activeView = view;
  document.querySelectorAll('[data-view]').forEach(button => button.setAttribute('aria-pressed', button.dataset.view === view));
  if ($('plan')) $('plan').hidden = view !== 'plan';
  $('viewTag').hidden = view === 'plan'; $('hint').hidden = view === 'plan';
  $('viewTag').textContent = { overall: 'ОБЩИЙ ВИД · БЕЗ ПОТОЛКА', entry: 'ОТ ВХОДА · УРОВЕНЬ ГЛАЗ', stairs: 'К ЛЕСТНИЦЕ · УРОВЕНЬ ГЛАЗ', lounge: 'ОТ ДИВАНА · УРОВЕНЬ ГЛАЗ' }[view] || '';
  if (renderer) renderer.domElement.hidden = view === 'plan';
  if (!controls) { if (view === 'plan') $('loading').hidden = true; return; }
  if (view === 'plan') return;
  labels.visible = view === 'overall';
  clearanceGroup.visible = Boolean($('clearances')?.checked) && view === 'overall';
  const { L, W } = cfg;
  if (view === 'overall') {
    controls.target.set(L / 2, .85, W / 2);
    camera.position.set(-4.3, 8.3, W + 5.1).sub(controls.target).multiplyScalar(Math.max(1, 1.2 / camera.aspect)).add(controls.target);
  }
  if (view === 'entry') { camera.position.set(.95, 1.68, 1.07); controls.target.set(L - 1.2, 1.05, W - 1.6); }
  if (view === 'stairs') { camera.position.set(2.4, 1.85, 2.1); controls.target.set(L - .65, 1.3, W - 1.9); }
  if (view === 'lounge') { camera.position.set(1.4, 1.6, 4.1); controls.target.set(L - .65, 1.1, W - 3); }
  controls.update(); render();
}
function setLight(mode) {
  document.querySelectorAll('[data-light]').forEach(button => button.setAttribute('aria-pressed', button.dataset.light === mode));
  const evening = mode === 'evening';
  ambient.intensity = evening ? .8 : 2.2; sun.intensity = evening ? .2 : 3; fill.intensity = evening ? .25 : 1.2;
  warmLights.forEach(light => light.intensity = evening ? 35 : 0);
  mat.led.emissiveIntensity = evening ? 3 : .5;
  scene.background.set(evening ? '#46433f' : '#e2e6de'); render();
}
function setPalette(name) {
  const colors = { oak: ['#454340', '#d4cfc5', '#a15e3d'], sage: ['#454947', '#c5c6c0', '#898c80'], sand: ['#786a5d', '#dfd6c8', '#b39272'] }[name];
  mat.front.color.set(colors[0]); mat.wall.color.set(colors[1]); mat.fabric.color.set(colors[2]);
  document.querySelectorAll('[data-palette]').forEach(button => button.setAttribute('aria-pressed', button.dataset.palette === name));
  render(); updatePlan();
}
function planSVG() {
  const { L, W, door } = cfg, scale = 85, ox = 78, oy = 64;
  const x = m => ox + m * scale, z = m => oy + m * scale;
  const width = L * scale + 170, height = W * scale + 155;
  const rect = (a, b, w, d, attrs) => `<rect x="${x(a)}" y="${z(b)}" width="${w * scale}" height="${d * scale}" ${attrs}/>`;
  const text = (a, b, content, attrs = '') => `<text x="${x(a)}" y="${z(b)}" ${attrs}>${content}</text>`;
  const opening = (side, start, w) => {
    const horizontal = ['north', 'south'].includes(side);
    const a = horizontal ? x(start) : side === 'west' ? x(0) : x(L);
    const b = horizontal ? side === 'north' ? z(0) : z(W) : z(start);
    const endX = horizontal ? a + w * scale : a, endY = horizontal ? b : b + w * scale;
    const inward = side === 'north' || side === 'west' ? 1 : -1;
    const leafX = horizontal ? a : a + inward * w * scale, leafY = horizontal ? b + inward * w * scale : b;
    return `<path d="M${a},${b} L${endX},${endY}" stroke="#fafbf8" stroke-width="10"/><path d="M${a},${b} L${leafX},${leafY}" stroke="#989f91" fill="none" stroke-width="1.2"/><path d="M${endX},${endY} Q${horizontal ? endX : leafX},${horizontal ? leafY : endY} ${leafX},${leafY}" fill="none" stroke="#989f91" stroke-dasharray="3 3"/>`;
  };
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="План лофт-гостиной с размерами и расстановкой"><style>text{font-family:Segoe UI,Arial,sans-serif;font-size:12px;fill:#34412f;text-anchor:middle}.small{font-size:10px;fill:#677260}.dim{font-size:13px;font-weight:600}</style><defs><marker id="arrow" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto-start-reverse"><path d="M6,0 L0,3 L6,6" fill="none" stroke="#89957f"/></marker></defs><rect width="100%" height="100%" fill="#fafbf8"/>`;
  svg += rect(0, 0, L, W, 'fill="#f1eee6" stroke="#56614f" stroke-width="7"');
  svg += opening('north', 1.16, door) + opening('north', 1.16 + door + 1.8, door) + opening('west', .7, .8) + opening('east', 1, .8) + opening('south', 1.3, .92);
  svg += `<path d="M${x(.1)},${z(1.1)} H${x(L - .2)} M${x(1.6)},${z(1.1)} V${z(W - .8)} L${x(1.76)},${z(W)} M${x(1.6)},${z(4.15)} H${x(L - 1.45)} V${z(W - .5)}" stroke="#6f8a63" stroke-width="2" stroke-dasharray="6 5" fill="none"/>`;
  for (const [i, item] of items.entries()) {
    if (item.id === 'stairs') continue;
    const [a, b, w, d] = item.plan;
    svg += rect(a, b, w, d, `fill="${item.id === 'tv' ? '#323934' : '#cfbea3'}" stroke="#887e68" stroke-width="1.2" rx="2"`);
    const cx = x(a + w / 2), cy = z(b + d / 2);
    svg += `<circle cx="${cx}" cy="${cy}" r="12" fill="#fafbf8" stroke="#88967d"/><text x="${cx}" y="${cy + 4}">${i + 1}</text>`;
  }
  for (const px of [2.95, 3.75]) svg += `<circle cx="${x(px)}" cy="${z(W - 1.02)}" r="${.2 * scale}" fill="#cfbea3" stroke="#887e68"/>`;
  svg += rect(L - 1, W - 3.75, .9, 3.4, 'fill="none" stroke="#887e68" stroke-width="1.2"');
  for (let i = 0; i < 16; i++) svg += `<line x1="${x(L - 1)}" y1="${z(W - .35 - i * 3.4 / 16)}" x2="${x(L - .1)}" y2="${z(W - .35 - i * 3.4 / 16)}" stroke="#a59b84"/>`;
  svg += `<path d="M${x(L - .72)},${z(W - .55)} L${x(L - .72)},${z(W - 3.45)}" stroke="#56614f" marker-end="url(#arrow)"/>`;
  svg += `<circle cx="${x(L - .35)}" cy="${z(W - 3.35)}" r="12" fill="#fafbf8" stroke="#88967d"/>` + text(L - .35, W - 3.35 + 4 / scale, '5');
  svg += `<path d="M${x(0)},${z(-.34)} H${x(L)} M${x(-.4)},${z(0)} V${z(W)}" stroke="#89957f" stroke-width="1" marker-start="url(#arrow)" marker-end="url(#arrow)"/>`;
  svg += text(L / 2, -.44, `${Math.round(L * 100)} см`, 'class="dim"');
  svg += text(-.58, W / 2, `${Math.round(W * 100)} см`, `class="dim" transform="rotate(-90 ${x(-.58)} ${z(W / 2)})"`);
  svg += text(1.16 + door / 2, -.09, `${Math.round(door * 100)}`, 'class="small"');
  svg += text(1.16 + door + .9, -.09, '180 см', 'class="small"');
  svg += text(1.16 + door + 1.8 + door / 2, -.09, `${Math.round(door * 100)}`, 'class="small"');
  svg += text(1.76, W + .3, 'ВЕРАНДА · 92 см');
  svg += text(.72, .52, 'ВХОД · 80 см', 'class="small"');
  svg += text(L - .48, .75, '80 см', 'class="small"');
  svg += text(L / 2, W + .65, items.map((item, i) => `${i + 1} ${ { sofa: 'Диван', shelf: 'Стеллаж', mirror: 'Зеркало', bar: 'Бар', stairs: 'Лестница', understairs: 'Ниша', tv: 'ТВ' }[item.id] }`).join(' · '), 'class="small"');
  svg += text(L / 2, W + .89, 'Предварительно. Геометрию, проёмы и открывание дверей уточнить обмером.', 'class="small"');
  return svg + '</svg>';
}
function updatePlan() { if ($('plan')) $('plan').innerHTML = planSVG(); }
function download(blob, name) {
  const url = URL.createObjectURL(blob), link = document.createElement('a'); link.href = url; link.download = name;
  link.click(); setTimeout(() => URL.revokeObjectURL(url), 30000);
}
async function exportModel() {
  const visibility = [];
  for (const { group } of walls) { visibility.push([group, group.visible]); group.visible = true; }
  visibility.push([labels, labels.visible], [doors, doors.visible], [clearanceGroup, clearanceGroup.visible]); labels.visible = false; doors.visible = true; clearanceGroup.visible = false;
  root.updateMatrixWorld(true);
  try { return await new GLTFExporter().parseAsync(root, { binary: true, onlyVisible: true }); }
  finally { visibility.forEach(([object, visible]) => { object.visible = visible; }); render(); }
}
$('views').addEventListener('click', event => { const button = event.target.closest('[data-view]'); if (button) setView(button.dataset.view); });
$('palettes').addEventListener('click', event => { const button = event.target.closest('[data-palette]'); if (button) setPalette(button.dataset.palette); });
$('lights').addEventListener('click', event => { const button = event.target.closest('[data-light]'); if (button) setLight(button.dataset.light); });
$('items').addEventListener('click', event => { const button = event.target.closest('[data-item]'); if (button) selectItem(button.dataset.item); });
$('doors').addEventListener('change', () => { doors.visible = $('doors').checked; render(); });
$('savePlan')?.addEventListener('click', () => download(new Blob([planSVG()], { type: 'image/svg+xml;charset=utf-8' }), 'prihozhaya-plan.svg'));
$('saveModel')?.addEventListener('click', async () => {
  $('saveModel').disabled = true; $('status').textContent = 'Экспортирую модель…';
  try { download(new Blob([await exportModel()], { type: 'model/gltf-binary' }), 'prihozhaya.glb'); $('status').textContent = 'GLB сохранён · единицы — метры · стены и двери включены'; }
  catch (error) { $('status').textContent = `Не удалось экспортировать GLB: ${error.message}`; }
  finally { $('saveModel').disabled = false; }
});
$('measurements')?.addEventListener('submit', event => {
  event.preventDefault();
  const next = Object.fromEntries([...new FormData(event.target)].map(([key, value]) => [key, Number(value)]));
  if (1.16 + next.door * 2 + 1.8 >= next.L - .5) { $('error').textContent = 'Для этих проёмов не хватает длины стены.'; return; }
  Object.assign(cfg, next); $('error').textContent = ''; rebuild();
  $('status').textContent = 'Размеры применены; дверные привязки и размеры мебели сохранены.';
});
$('layouts')?.addEventListener('click', event => {
  const button = event.target.closest('[data-layout]');
  if (!button || button.dataset.layout === underStairs) return;
  underStairs = button.dataset.layout;
  document.querySelectorAll('[data-layout]').forEach(item => item.setAttribute('aria-pressed', item === button));
  rebuild();
  $('status').textContent = underStairs === 'closed' ? 'Под лестницей — закрытые фасады' : 'Под лестницей — открытые полки';
});
$('tv').addEventListener('change', rebuild);
$('clearances')?.addEventListener('change', () => {
  clearanceGroup.visible = $('clearances').checked && activeView === 'overall';
  render();
});
if (renderer) {
  const raycaster = new THREE.Raycaster(), pointer = new THREE.Vector2(); let down;
  renderer.domElement.addEventListener('pointerdown', event => { down = [event.clientX, event.clientY]; });
  renderer.domElement.addEventListener('pointerup', event => {
    if (!down || Math.hypot(event.clientX - down[0], event.clientY - down[1]) > 5) return;
    const bounds = renderer.domElement.getBoundingClientRect();
    pointer.set((event.clientX - bounds.left) / bounds.width * 2 - 1, -(event.clientY - bounds.top) / bounds.height * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObjects(root.children, true).find(hit => {
      if (hit.object.isSprite || hit.object.userData.clearance) return false;
      for (let object = hit.object; object; object = object.parent) if (!object.visible) return false;
      return true;
    });
    let object = hit?.object;
    while (object && !object.userData.item) object = object.parent;
    if (object) selectItem(object.userData.item);
  });
  new ResizeObserver(() => {
    const width = $('stage').clientWidth, height = $('stage').clientHeight;
    if (!width || !height) return;
    camera.aspect = width / height; camera.updateProjectionMatrix(); renderer.setSize(width, height);
    if (activeView === 'overall') setView('overall'); else render();
  }).observe($('stage'));
}
rebuild();
if (renderer) $('loading').hidden = true;
window.room = { cfg, scene, root: () => root, camera, controls, items: () => items, exportModel, planSVG, setView, selectItem, render, renderer };
window.__roomReady = true;
