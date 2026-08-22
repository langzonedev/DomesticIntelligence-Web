import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mime = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.mjs':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.json':'application/json; charset=utf-8', '.webmanifest':'application/manifest+json', '.svg':'image/svg+xml', '.png':'image/png' };
const failures = [];
const evidence = [];
const assert = (condition, message) => { if (!condition) failures.push(message); };
const legacyMixingWorker = `
const CACHE='domestic-intelligence-legacy-mixing-test';
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.put('./app-v2.js',new Response('throw new Error("Legacy runtime was mixed into the new shell")',{headers:{'content-type':'text/javascript'}}))).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  if(event.request.mode==='navigate'){event.respondWith(fetch(event.request));return;}
  event.respondWith(caches.match(event.request).then(cached=>cached||fetch(event.request)));
});`;

const server = http.createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    if (pathname === '/__legacy-sw.js') {
      response.writeHead(200, { 'content-type':'text/javascript; charset=utf-8', 'cache-control':'no-store', 'service-worker-allowed':'/' });
      response.end(legacyMixingWorker);
      return;
    }
    if (pathname === '/__legacy-bootstrap') {
      response.writeHead(200, { 'content-type':'text/html; charset=utf-8', 'cache-control':'no-store' });
      response.end('<!doctype html><title>Legacy shell bootstrap</title>');
      return;
    }
    const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
    const target = path.resolve(root, relative);
    if (!target.startsWith(root)) throw new Error('Invalid path');
    const body = await fs.readFile(target);
    response.writeHead(200, { 'content-type': mime[path.extname(target)] || 'application/octet-stream', 'cache-control':'no-store' }); response.end(body);
  } catch (_) { response.writeHead(404); response.end('Not found'); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}/`;
const chromePath = process.env.DI_CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const browser = await chromium.launch({ headless:true, executablePath:chromePath });

try {
  const upgradeContext = await browser.newContext({ serviceWorkers:'allow', colorScheme:'light' });
  const upgradePage = await upgradeContext.newPage();
  const upgradeErrors = [];
  upgradePage.on('pageerror', error => upgradeErrors.push(error.message));
  await upgradePage.goto(`${origin}__legacy-bootstrap`, { waitUntil:'domcontentloaded' });
  await upgradePage.evaluate(async () => {
    await navigator.serviceWorker.register('/__legacy-sw.js', { scope:'/' });
    await navigator.serviceWorker.ready;
  });
  await upgradePage.reload({ waitUntil:'domcontentloaded' });
  await upgradePage.goto(`${origin}?legacy-upgrade`, { waitUntil:'networkidle' });
  await upgradePage.waitForSelector('#mapStage');
  const releaseBoundary = await upgradePage.evaluate(() => ({
    fatal:Boolean(document.querySelector('.fatal')),
    styles:[...document.querySelectorAll('link[rel="stylesheet"]')].every(link=>link.href.includes('?v=07-18')),
    scripts:[...document.scripts].every(script=>script.src.includes('?v=07-18'))
  }));
  assert(!releaseBoundary.fatal && releaseBoundary.styles && releaseBoundary.scripts, 'Legacy service worker mixed an old runtime into the versioned release shell');
  assert(upgradeErrors.length === 0, `Legacy service-worker upgrade produced runtime errors: ${upgradeErrors.join(' | ')}`);
  await upgradeContext.close();

  const context = await browser.newContext({ serviceWorkers:'allow', colorScheme:'light' });
  const page = await context.newPage();
  const runtimeErrors = [];
  page.on('pageerror', error => runtimeErrors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') runtimeErrors.push(message.text()); });
  const matrix = [[320,568],[360,800],[390,844],[430,932],[600,960],[768,1024],[1024,768],[1280,800],[1440,900],[1920,1080],[844,390],[1024,768]];
  for (const [width,height] of matrix) {
    await page.setViewportSize({ width, height });
    await page.goto(`${origin}?matrix=${width}x${height}`, { waitUntil:'networkidle' });
    await page.waitForSelector('#mapStage', { state:'attached' });
    const result = await page.evaluate(() => {
      const visible = element => {
        const style = getComputedStyle(element), rect = element.getBoundingClientRect();
        return style.display !== 'none' && style.visibility !== 'hidden' && style.clipPath === 'none' && !element.classList.contains('inline-select-source') && rect.width > 0 && rect.height > 0;
      };
      const controls = [...document.querySelectorAll('button,input:not([type="checkbox"]):not([type="radio"]):not([type="file"]),select,textarea')].filter(visible).map(element => {
        const rect = element.getBoundingClientRect(); return { label:element.getAttribute('aria-label') || element.textContent.trim() || element.name || element.id, width:rect.width, height:rect.height, right:rect.right, left:rect.left };
      });
      const map = document.querySelector('#mapStage').getBoundingClientRect();
      const editor = document.querySelector('.editor-grid').getBoundingClientRect();
      return { fatal:Boolean(document.querySelector('.fatal')), innerWidth, innerHeight, scrollWidth:document.documentElement.scrollWidth, map:{top:map.top,width:map.width,height:map.height}, editor:{top:editor.top,bottom:editor.bottom,height:editor.height}, controls, bodyClass:document.body.className };
    });
    const undersized = result.controls.filter(control => control.width < 43.5 || control.height < 43.5);
    const clipped = result.controls.filter(control => control.left < -0.5 || control.right > result.innerWidth + .5);
    assert(!result.fatal, `${width}x${height}: fatal startup`);
    assert(result.scrollWidth <= result.innerWidth + 1, `${width}x${height}: horizontal overflow ${result.scrollWidth}/${result.innerWidth}`);
    assert(!undersized.length, `${width}x${height}: undersized controls ${undersized.slice(0,4).map(item=>`${item.label}:${Math.round(item.width)}x${Math.round(item.height)}`).join(', ')}`);
    assert(!clipped.length, `${width}x${height}: clipped controls ${clipped.slice(0,4).map(item=>item.label).join(', ')}`);
    assert(result.map.width >= Math.min(260, width - 60) && result.map.height >= 250, `${width}x${height}: map too small ${Math.round(result.map.width)}x${Math.round(result.map.height)}`);
    if (width >= 1101) assert(result.editor.bottom <= result.innerHeight + 1, `${width}x${height}: desktop editor extends below viewport (${Math.round(result.editor.bottom)}/${result.innerHeight})`);
    if (width === 1920) assert(result.map.height >= 820, `Desktop atlas did not reclaim the viewport (${Math.round(result.map.height)}px high)`);
    if (width === 390) assert(result.map.top <= 240, `Phone Plan chrome displaced the atlas below ${Math.round(result.map.top)}px`);
    if (width === 768) assert(result.map.top <= 420, `Tablet chrome displaced the atlas below ${Math.round(result.map.top)}px`);
    if (width === 844 && height === 390) assert(result.bodyClass.includes('atlas-short-landscape') && result.map.height >= height - 1, 'Phone landscape did not retain the full-height atlas shell');
    evidence.push({ width,height,overflow:result.scrollWidth-result.innerWidth,map:`${Math.round(result.map.width)}x${Math.round(result.map.height)}`,controls:result.controls.length,minTarget:Math.round(Math.min(...result.controls.map(item=>Math.min(item.width,item.height)))) });
  }

  await page.setViewportSize({ width:1440,height:900 }); await page.goto(origin,{waitUntil:'networkidle'});
  const beforeZoom = await page.locator('#zoomLevel').textContent(); await page.locator('#zoomIn').click(); const afterZoom = await page.locator('#zoomLevel').textContent();
  assert(beforeZoom !== afterZoom, 'Zoom button did not change the persisted viewport');
  const wall = page.locator('#wallLayer .wall-hit').first(); await wall.click({ force:true });
  assert(await page.locator('#wallInspector').isVisible(), 'Wall click in View mode did not open wall information');
  const beforeWall = await page.evaluate(() => JSON.stringify(window.DIAppBridge.getState().map.walls[0]));
  const afterViewWall = await page.evaluate(() => JSON.stringify(window.DIAppBridge.getState().map.walls[0]));
  assert(beforeWall === afterViewWall, 'View mode allowed an accidental wall edit');
  await page.locator('[data-editor-mode="edit"]').click();
  const point = page.locator('#pointLayer [data-point]').first(); const box = await point.boundingBox();
  if (box) { await page.mouse.move(box.x+box.width/2,box.y+box.height/2); await page.mouse.down(); await page.mouse.move(box.x+box.width/2+36,box.y+box.height/2+24,{steps:3}); await page.mouse.up(); }
  assert(await page.locator('#undoButton').isEnabled(), 'Direct point drag did not create an undoable spatial operation');
  await page.locator('#undoButton').click();
  await point.focus(); const beforeKeyboardPoint = await page.evaluate(() => JSON.stringify(window.DIAppBridge.getState().map.points[0])); await page.keyboard.press('ArrowRight');
  const afterKeyboardPoint = await page.evaluate(() => JSON.stringify(window.DIAppBridge.getState().map.points[0])); assert(beforeKeyboardPoint !== afterKeyboardPoint, 'Keyboard arrow did not move the selected point'); await page.locator('#undoButton').click();

  await page.emulateMedia({ colorScheme:'dark', reducedMotion:'reduce' });
  const dark = await page.evaluate(()=>({bg:getComputedStyle(document.body).backgroundColor,accent:getComputedStyle(document.documentElement).getPropertyValue('--di-accent').trim()}));
  await page.emulateMedia({ colorScheme:'light' });
  const light = await page.evaluate(()=>({bg:getComputedStyle(document.body).backgroundColor,accent:getComputedStyle(document.documentElement).getPropertyValue('--di-accent').trim()}));
  assert(dark.bg !== light.bg && dark.accent !== light.accent, 'System light/dark themes did not produce intentional counterparts');

  const planContext = await browser.newContext({ serviceWorkers:'allow', colorScheme:'light' });
  const planPage = await planContext.newPage(); planPage.on('pageerror', error => runtimeErrors.push(`plan:${error.message}`));
  await planPage.setViewportSize({width:1280,height:800}); await planPage.goto(`${origin}?plans`,{waitUntil:'networkidle'});
  const groundPlan = path.join(root,'tests','fixtures','sample-floor-plan.png'); const secondPlan = path.join(root,'icon-192.png'); const corruptPlan = path.join(root,'tests','fixtures','corrupt-floor-plan.png');
  await planPage.locator('[data-editor-mode="edit"]').click();
  await planPage.locator('#planInput').setInputFiles(groundPlan); await planPage.waitForTimeout(250);
  assert(await planPage.locator('#planInspector').isVisible(), 'Ground-storey reference plan did not render');
  const acceptedPlan = await planPage.evaluate(()=>window.DIAppBridge.getState().map.floorplan?.name);
  await planPage.locator('#planInput').setInputFiles(corruptPlan); await planPage.waitForTimeout(200);
  assert(await planPage.evaluate(()=>window.DIAppBridge.getState().map.floorplan?.name) === acceptedPlan, 'Invalid replacement displaced the last valid reference');
  await planPage.locator('[data-editor-mode="view"]').click(); const viewSafeMap = await planPage.evaluate(()=>JSON.stringify(window.DIAppBridge.getState().map));
  await planPage.locator('#planScale').evaluate(element=>{element.value='150';element.dispatchEvent(new Event('input',{bubbles:true}));element.dispatchEvent(new Event('change',{bubbles:true}));});
  for (const selector of ['#fitReference','#startCalibration','#removePlan','#undoButton']) await planPage.locator(selector).dispatchEvent('click');
  await planPage.locator('#wallLayer [data-wall]').first().click({force:true}); await planPage.locator('#wallX1').evaluate(element=>{element.value=Number(element.value)+20;}); await planPage.locator('#applyWallCoordinates').dispatchEvent('click'); await planPage.locator('#removeWall').dispatchEvent('click');
  await planPage.locator('#pointLayer [data-point]').first().click({force:true}); await planPage.locator('#removePoint').dispatchEvent('click'); await planPage.locator('#gridSize').evaluate(element=>{element.value='40';element.dispatchEvent(new Event('change',{bubbles:true}));}); await planPage.waitForTimeout(100);
  assert(await planPage.evaluate(()=>JSON.stringify(window.DIAppBridge.getState().map)) === viewSafeMap,'View mode allowed an inspector or history spatial mutation');
  assert(await planPage.evaluate(()=>['planScale','fitReference','startCalibration','removePlan','applyWallCoordinates','removeWall','removePoint'].every(id=>document.getElementById(id).disabled)),'View-mode spatial mutation controls were not disabled');
  await planPage.locator('[data-editor-mode="edit"]').click();
  await planPage.locator('.inspector-card').evaluate(element=>{ element.scrollTop=element.scrollHeight; }); await planPage.locator('.calibration-panel summary').click(); await planPage.locator('#startCalibration').click(); const calibrationBox = await planPage.locator('#mapStage').boundingBox();
  if (calibrationBox) { for (const [pointerId,fraction] of [[81,.3],[82,.7]]) { const event={clientX:calibrationBox.x+calibrationBox.width*fraction,clientY:calibrationBox.y+calibrationBox.height*.35,pointerId,pointerType:'mouse',button:0,bubbles:true,cancelable:true}; await planPage.locator('#mapStage').dispatchEvent('pointerdown',event); await planPage.locator('#mapStage').dispatchEvent('pointerup',event); } }
  await planPage.locator('#calibrationDistance').fill('4.2'); await planPage.locator('#applyCalibration').click();
  assert(await planPage.evaluate(()=>window.DIAppBridge.getState().map.calibration?.sourceRealDistance) === 4.2, 'Reference calibration did not persist metric scale');
  assert(await planPage.locator('#calibrationStatus').getAttribute('aria-live') === 'polite' && (await planPage.locator('#calibrationStatus').textContent()).startsWith('Calibrated:'), 'Completed calibration left a stale accessible status');
  assert(await planPage.locator('#applyCalibration').isDisabled(), 'Completed calibration left Apply enabled without selected points');
  assert(await planPage.evaluate(()=>document.activeElement?.id === 'startCalibration'), 'Completed calibration did not move focus to a stable enabled action');
  await Promise.all([planPage.waitForLoadState('domcontentloaded'),planPage.locator('#addFloorButton').click()]); await planPage.waitForTimeout(250);
  await planPage.locator('[data-editor-mode="edit"]').click();
  await planPage.locator('#planInput').setInputFiles(secondPlan);
  await Promise.all([planPage.waitForLoadState('domcontentloaded'),planPage.locator('#floorControls [data-floor-id]:not([aria-checked="true"])').first().click()]); await planPage.waitForTimeout(200);
  await Promise.all([planPage.waitForLoadState('domcontentloaded'),planPage.locator('#floorControls [data-floor-id]:not([aria-checked="true"])').first().click()]); await planPage.waitForTimeout(200);
  const activePlanPair = await planPage.evaluate(async()=>({ metadata:window.DIAppBridge.getState().map.floorplan?.name || null, record:(await window.DIStorage.loadFloorPlan())?.name || null }));
  assert(activePlanPair.metadata === 'icon-192.png' && activePlanPair.record === 'icon-192.png', `Immediate plan upload/storey switch orphaned metadata or binary: ${JSON.stringify(activePlanPair)}`);
  const planNames = await planPage.evaluate(()=>window.DIPropertyModel.syncActiveFloor(window.DIAppBridge.getState()).home.floors.map(floor=>floor.map.floorplan?.name || null));
  assert(planNames.filter(Boolean).length === 2, `Per-storey plan metadata missing: ${JSON.stringify(planNames)}`);
  await planPage.locator('[data-editor-mode="edit"]').click(); await planPage.waitForTimeout(180);
  await planPage.evaluate(()=>{ window.__diOriginalIdbOpen=indexedDB.open; window.__diOriginalStorageSet=Storage.prototype.setItem; indexedDB.open=()=>{throw new Error('Forced database failure');}; Storage.prototype.setItem=()=>{throw new Error('Forced fallback failure');}; });
  await planPage.locator('#planInput').setInputFiles(groundPlan); await planPage.waitForTimeout(250);
  await planPage.evaluate(()=>{ indexedDB.open=window.__diOriginalIdbOpen; Storage.prototype.setItem=window.__diOriginalStorageSet; });
  await planPage.reload({waitUntil:'networkidle'});
  const failedReplacementPair = await planPage.evaluate(async()=>({ metadata:window.DIAppBridge.getState().map.floorplan?.name || null, record:(await window.DIStorage.loadFloorPlan())?.name || null }));
  assert(failedReplacementPair.metadata === 'icon-192.png' && failedReplacementPair.record === 'icon-192.png', `Failed reference persistence did not preserve the prior coherent pair: ${JSON.stringify(failedReplacementPair)}`);
  await planPage.locator('[data-editor-mode="edit"]').click(); await planPage.locator('#planInput').setInputFiles(groundPlan); await planPage.waitForTimeout(250); await planPage.reload({waitUntil:'networkidle'});
  const retriedReplacementPair = await planPage.evaluate(async()=>({ metadata:window.DIAppBridge.getState().map.floorplan?.name || null, record:(await window.DIStorage.loadFloorPlan())?.name || null }));
  assert(retriedReplacementPair.metadata === 'sample-floor-plan.png' && retriedReplacementPair.record === 'sample-floor-plan.png', `Reference retry did not persist a coherent pair: ${JSON.stringify(retriedReplacementPair)}`);
  await planPage.evaluate(()=>navigator.serviceWorker.ready.then(()=>true)); await planContext.setOffline(true); await planPage.reload({waitUntil:'domcontentloaded'}); await planPage.waitForSelector('#mapStage');
  assert(!await planPage.locator('.fatal').count(), 'Previously stored project did not reopen from the offline shell'); await planContext.setOffline(false); await planContext.close();

  const transactionContext = await browser.newContext({ serviceWorkers:'block', colorScheme:'light', viewport:{width:390,height:844} });
  const transactionPage = await transactionContext.newPage(); await transactionPage.goto(`${origin}?transactions`,{waitUntil:'networkidle'}); await transactionPage.locator('[data-mobile-section="plan"]').click();
  await Promise.all([transactionPage.waitForLoadState('domcontentloaded'),transactionPage.locator('#addFloorButton').click()]); await transactionPage.waitForTimeout(180);
  const groundFloorId = await transactionPage.evaluate(()=>window.DIAppBridge.getState().home.floors[0].id); const secondFloorId = await transactionPage.evaluate(()=>window.DIAppBridge.getState().home.floors[1].id);
  await Promise.all([transactionPage.waitForLoadState('domcontentloaded'),transactionPage.locator(`#floorControls [data-floor-id="${groundFloorId}"]`).click()]); await transactionPage.locator('[data-mobile-section="plan"]').click();
  const pointSnapshot = () => transactionPage.evaluate(()=>JSON.stringify(window.DIAppBridge.getState().map.points[0]));
  const beginDraftMove = async () => {
    await transactionPage.locator('[data-editor-mode="edit"]').click();
    await transactionPage.waitForSelector('body.mobile-floor-edit');
    const point = transactionPage.locator('#pointLayer [data-point]').first();
    await point.focus();
    const before = await pointSnapshot();
    await transactionPage.keyboard.press('ArrowRight');
    await transactionPage.waitForTimeout(100);
    assert(await pointSnapshot() !== before, 'Mobile edit did not create a staged device move');
  };
  const originalPoint = await pointSnapshot();
  const originalViewport = await transactionPage.evaluate(()=>JSON.stringify(window.DIAppBridge.getState().map.viewport));
  await beginDraftMove(); await transactionPage.locator('#mapStage').dispatchEvent('wheel',{deltaY:-160,clientX:190,clientY:420,bubbles:true,cancelable:true}); await transactionPage.waitForTimeout(140); await transactionPage.locator('#mobileEditCancel').click(); await transactionPage.waitForTimeout(250);
  assert(await pointSnapshot() === originalPoint,'Mobile Cancel did not restore the pre-edit transaction');
  assert(await transactionPage.evaluate(()=>JSON.stringify(window.DIAppBridge.getState().map.viewport)) === originalViewport,'Mobile Cancel did not restore the pre-edit viewport');
  const floorCountBeforeGuard = await transactionPage.evaluate(()=>window.DIAppBridge.getState().home.floors.length); await beginDraftMove(); await transactionPage.waitForTimeout(260); await transactionPage.locator(`#floorControls [data-floor-id="${secondFloorId}"]`).dispatchEvent('click'); await transactionPage.locator('#addFloorButton').dispatchEvent('click'); await transactionPage.waitForTimeout(100);
  assert(await transactionPage.locator('body').evaluate(body=>body.classList.contains('mobile-floor-edit')) && await transactionPage.evaluate(expected=>window.DIAppBridge.getState().home.activeFloorId === expected,groundFloorId),'Storey switch escaped the active mobile edit transaction');
  assert(await transactionPage.evaluate(expected=>window.DIAppBridge.getState().home.floors.length === expected,floorCountBeforeGuard),'Add storey escaped the active mobile edit transaction'); await transactionPage.locator('#mobileEditCancel').click(); await transactionPage.waitForTimeout(250); assert(await pointSnapshot() === originalPoint,'Guarded storey navigation persisted a cancelled draft');
  await beginDraftMove();
  const editGeometry = await transactionPage.evaluate(()=>({ tools:[document.querySelector('.edit-toolbar').clientWidth,document.querySelector('.edit-toolbar').scrollWidth], mapHeight:document.querySelector('#mapStage').getBoundingClientRect().height, floorVisible:Boolean(document.querySelector('#floorControls')?.getClientRects().length) }));
  assert(editGeometry.tools[0] === editGeometry.tools[1] && editGeometry.mapHeight >= 650 && !editGeometry.floorVisible, `Mobile Edit did not use a compact full-screen tool layout: ${JSON.stringify(editGeometry)}`);
  const savedPoint = await pointSnapshot(); const saveViewportBefore = await transactionPage.evaluate(()=>window.DIAppBridge.getState().map.viewport.zoom); await transactionPage.locator('#mapStage').dispatchEvent('wheel',{deltaY:-160,clientX:190,clientY:420,bubbles:true,cancelable:true}); const savedZoomLabel = await transactionPage.locator('#zoomLevel').textContent(); await transactionPage.locator('#mobileEditSave').click(); await transactionPage.waitForTimeout(300); await transactionPage.reload({waitUntil:'networkidle'});
  assert(await pointSnapshot() === savedPoint,'Mobile Save did not durably persist the edit transaction');
  assert(await transactionPage.evaluate(()=>window.DIAppBridge.getState().map.viewport.zoom) > saveViewportBefore && await transactionPage.locator('#zoomLevel').textContent() === savedZoomLabel,'Immediate mobile Save dropped the pending viewport change');
  await transactionPage.locator('[data-mobile-section="plan"]').click(); await beginDraftMove(); await transactionPage.goBack(); await transactionPage.waitForTimeout(300);
  assert(await pointSnapshot() === savedPoint,'Browser Back did not roll back the mobile edit transaction');
  await transactionPage.locator('[data-mobile-section="plan"]').click(); await beginDraftMove(); await transactionPage.setViewportSize({width:768,height:1024}); await transactionPage.waitForTimeout(350);
  assert(await pointSnapshot() === savedPoint,'Breakpoint exit did not roll back the mobile edit transaction'); await transactionContext.close();

  await page.setViewportSize({width:390,height:844}); await page.goto(`${origin}?mobile-flow`,{waitUntil:'networkidle'});
  await page.locator('[data-mobile-section="plan"]').click();
  await page.locator('#atlasLayersButton').click(); await page.waitForTimeout(50);
  const deviceLayerToggle = page.locator('[data-sheet-layer="devices"]'); await deviceLayerToggle.focus(); await page.keyboard.press('Space'); await page.waitForTimeout(80);
  assert(await page.locator('#pointLayer [data-point]').count() === 0,'Phone layer sheet did not hide device geometry and hit targets');
  assert(await page.evaluate(()=>document.activeElement?.dataset.sheetLayer === 'devices'),'Layer visibility toggle lost its logical keyboard focus');
  await page.keyboard.press('Space'); const deviceLock = page.locator('[data-sheet-lock="devices"]'); await deviceLock.focus(); await page.keyboard.press('Enter');
  assert(await page.evaluate(()=>window.DIAppBridge.getState().map.layerLocks.devices === true),'Phone layer sheet did not lock the device layer');
  assert(await page.evaluate(()=>document.activeElement?.dataset.sheetLock === 'devices'),'Layer lock action lost its logical keyboard focus');
  assert(await page.locator('#atlasLayersDialog').evaluate(dialog=>dialog.open),'Phone layer sheet closed during consecutive keyboard changes');
  await page.locator('#atlasLayersShowAll').dispatchEvent('click');
  assert(await page.evaluate(()=>window.DIAppBridge.getState().map.layers.devices && !window.DIAppBridge.getState().map.layerLocks.devices),'Show all and unlock did not recover phone layers');
  await page.locator('#atlasLayersClose').dispatchEvent('click');
  await page.locator('#pointLayer [data-point]').first().dispatchEvent('click');
  await page.waitForTimeout(100);
  assert(await page.locator('#mobileDeviceSummary').isVisible(), 'Phone device tap did not open the summary sheet');
  assert((await page.locator('#mobileDeviceSummaryChecks').textContent()).includes('checks passed'), 'Phone device summary omitted the commissioning glance count');
  await page.locator('#mobileDeviceSummary .summary-grabber').dispatchEvent('pointerdown',{pointerId:71,pointerType:'touch',clientY:600,bubbles:true}); await page.locator('#mobileDeviceSummary .summary-grabber').dispatchEvent('pointerup',{pointerId:71,pointerType:'touch',clientY:540,bubbles:true});
  assert(await page.locator('#mobileDeviceSummary').getAttribute('data-expanded') === 'true' && await page.locator('#mobileDeviceQuickRecord').isVisible(), 'Upward summary swipe did not reveal the quick device record');
  await page.locator('#mobileDeviceSummary .summary-grabber').dispatchEvent('pointerdown',{pointerId:72,pointerType:'touch',clientY:540,bubbles:true}); await page.locator('#mobileDeviceSummary .summary-grabber').dispatchEvent('pointerup',{pointerId:72,pointerType:'touch',clientY:610,bubbles:true});
  assert(await page.locator('#mobileDeviceSummary').getAttribute('data-expanded') === 'false', 'Downward summary swipe did not collapse the quick device record');
  await page.locator('#openDeviceRecord').click();
  assert(await page.locator('body').evaluate(body=>body.classList.contains('mobile-point-detail')), 'Phone summary did not expand to full details');
  assert(await page.locator('.inspector-card').getAttribute('role') === 'dialog', 'Phone device details are not exposed as a dialog');
  const detailPriority = await page.evaluate(()=>({ navHeight:document.querySelector('.mobile-point-nav').getBoundingClientRect().height, first:[...document.querySelectorAll('#pointForm>details')].sort((a,b)=>a.getBoundingClientRect().top-b.getBoundingClientRect().top)[0]?.querySelector('summary')?.textContent, saveVisible:Boolean(document.querySelector('#mobilePointSave')?.getClientRects().length) }));
  assert(detailPriority.navHeight >= 44 && detailPriority.first === 'Commissioning and lifecycle' && detailPriority.saveVisible, `Phone device record did not prioritise commissioning with persistent navigation: ${JSON.stringify(detailPriority)}`);
  const macField = page.locator('#pointForm [name="macAddress"]'); await macField.evaluate(element=>{ element.closest('details').open=true; }); await macField.fill('not-a-mac'); await page.locator('#pointForm button[type="submit"]').click();
  assert(await macField.getAttribute('aria-invalid') === 'true' && await page.evaluate(()=>document.activeElement?.name === 'macAddress'),'Invalid MAC did not expose a focused inline field error');
  await macField.fill('AA:BB:CC:DD:EE:FF'); assert(await macField.getAttribute('aria-invalid') === null,'Correcting a constrained field did not clear its inline error');
  for(let index=0;index<18;index++) await page.keyboard.press('Tab');
  assert(await page.evaluate(()=>document.querySelector('.inspector-card').contains(document.activeElement)),'Phone modal focus escaped to the atlas background');
  await page.keyboard.press('Escape');
  assert(!(await page.locator('body').evaluate(body=>body.classList.contains('mobile-point-detail'))), 'Escape did not close phone device details');

  const landscapeContext = await browser.newContext({ serviceWorkers:'block', hasTouch:true, isMobile:true, viewport:{width:844,height:390} }); const landscapePage = await landscapeContext.newPage(); await landscapePage.goto(`${origin}?phone-landscape`,{waitUntil:'networkidle'});
  assert(await landscapePage.locator('.mobile-bottom-nav').isVisible(),'Rotated phone did not build its mobile navigation shell');
  await landscapePage.locator('#pointLayer [data-point]').first().dispatchEvent('click'); await landscapePage.waitForTimeout(100);
  assert(await landscapePage.locator('#mobileDeviceSummary').isVisible(),'Rotated-phone device tap did not open the summary'); await landscapePage.locator('#openDeviceRecord').click();
  assert(await landscapePage.locator('.inspector-card').isVisible() && await landscapePage.locator('.inspector-card').getAttribute('role') === 'dialog','Rotated-phone summary did not open the full accessible record'); await landscapePage.keyboard.press('Escape'); await landscapeContext.close();

  const touchContext = await browser.newContext({ serviceWorkers:'block', hasTouch:true, isMobile:true, viewport:{width:390,height:844} }); const touchPage = await touchContext.newPage(); await touchPage.goto(`${origin}?touch`,{waitUntil:'networkidle'}); await touchPage.locator('[data-mobile-section="plan"]').click();
  const pinBox = await touchPage.locator('#pointLayer .pin-body').first().boundingBox(); if(pinBox) await touchPage.touchscreen.tap(pinBox.x+pinBox.width/2,pinBox.y+pinBox.height/2); await touchPage.waitForTimeout(150);
  assert(await touchPage.locator('#mobileDeviceSummary').isVisible(),'Real touch tap did not open the device summary'); await touchPage.locator('#closeDeviceSummary').click();
  const touchZoomBefore = await touchPage.locator('#zoomLevel').textContent(); await touchPage.locator('#mapStage').evaluate(stage=>{const make=(id,x,y)=>new Touch({identifier:id,target:stage,clientX:x,clientY:y,pageX:x,pageY:y,screenX:x,screenY:y}); const a=make(1,120,300),b=make(2,250,300); stage.dispatchEvent(new TouchEvent('touchstart',{bubbles:true,cancelable:true,touches:[a,b],targetTouches:[a,b],changedTouches:[a,b]})); const c=make(1,80,300),d=make(2,290,300); stage.dispatchEvent(new TouchEvent('touchmove',{bubbles:true,cancelable:true,touches:[c,d],targetTouches:[c,d],changedTouches:[c,d]})); stage.dispatchEvent(new TouchEvent('touchend',{bubbles:true,cancelable:true,touches:[],targetTouches:[],changedTouches:[c,d]}));}); await touchPage.waitForTimeout(180);
  assert(await touchPage.locator('#zoomLevel').textContent() !== touchZoomBefore,'Pinch touch path did not zoom the atlas'); await touchContext.close();

  assert(runtimeErrors.length === 0, `Runtime console errors: ${runtimeErrors.join(' | ')}`);
  console.log(JSON.stringify({ outcome:failures.length?'FAIL':'PASS', matrix:evidence, themes:{dark,light}, runtimeErrors, failures },null,2));
} finally {
  await browser.close(); await new Promise(resolve=>server.close(resolve));
}
if (failures.length) process.exitCode = 1;
