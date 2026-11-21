'use strict';
const { app, BrowserWindow, Menu, Tray, nativeImage, screen, ipcMain, globalShortcut, dialog } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { manifest, STATES, directionForOffset, animationCell, lookCell, clampPosition } = require('../lib/atlas.cjs');
const { dataDirectory } = require('../lib/paths.cjs');
const { ensurePrivateDirectory, writeEndpoint } = require('../lib/endpoint-file.cjs');
const { validateCommand } = require('../lib/commands.cjs');
const { createControlServer } = require('../lib/control-server.cjs');
const { createReactionController } = require('../lib/reactions.cjs');
const { DEFAULT_TRACKING_MODE, TRACKING_MODES, TRACKING_WINDOW_MS, createTrackingController } = require('../lib/tracking.cjs');
const { CAPTURE_TIMES, captureRequest, captureTarget, writeCapture } = require('../lib/capture-output.cjs');
const { mobility, classifyMotion, canChase, travelVisual } = require('../lib/mobility.cjs');
const reactionPolicy = require('../config/reactions.json');
const reactionController = createReactionController(reactionPolicy);
const LAYOUT = { width: 512, height: 400, petX: 160, petY: 180, petWidth: 192, petHeight: 208 };

app.setName('Mini Mad Cat');
// This small transparent canvas needs no GPU. Software compositing also keeps
// hidden own-window captures consistent on Windows display scaling setups.
app.disableHardwareAcceleration();
const dataDir = ensurePrivateDirectory(dataDirectory());
app.setPath('userData', dataDir);
if (!app.requestSingleInstanceLock()) { app.quit(); }
else {
  let window, tray, control, interval, saveTimer;
  let preferences = { scale: 1, followCursor: false, trackingMode: DEFAULT_TRACKING_MODE, clickThrough: false, reducedMotion: false, contextBubbles: true, position: null };
  let manual = null, currentState = 'idle', stateStarted = Date.now(), drag = null;
  let latestFrame = null, mouseIgnored = null;
  let renderedCell = { row: 0, column: 0, sheet: 'core' };
  let motionMode = null, motionStarted = Date.now(), thrustActive = false;
  const optionalAssets = { mobility: false, thrust: false };
  const alphaFrames = new Map();
  const hidden = process.argv.includes('--hidden');
  const capture = captureRequest(process.argv);
  const settingsPath = path.join(dataDir, 'settings.json');
  const endpointPath = path.join(dataDir, 'control.json');
  const htmlUrl = pathToFileURL(path.join(__dirname, 'index.html')).href;
  const x11Requested = process.argv.includes('--ozone-platform=x11');
  const wayland = process.platform === 'linux' && (process.env.XDG_SESSION_TYPE === 'wayland' || !!process.env.WAYLAND_DISPLAY) && !x11Requested;
  const cursorTracking = !wayland;
  try {
    const saved = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    if (Number.isFinite(saved.scale) && saved.scale >= .5 && saved.scale <= 2) preferences.scale = saved.scale;
    for (const key of ['followCursor', 'clickThrough', 'reducedMotion', 'contextBubbles']) if (typeof saved[key] === 'boolean') preferences[key] = saved[key];
    if (TRACKING_MODES.includes(saved.trackingMode)) preferences.trackingMode = saved.trackingMode;
    if (saved.position && Number.isFinite(saved.position.x) && Number.isFinite(saved.position.y)) preferences.position = saved.position;
  } catch {}
  if (!cursorTracking) { preferences.followCursor = false; preferences.clickThrough = true; }
  const tracking = createTrackingController({ mode: preferences.trackingMode });

  function saveSettingsSoon() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      if (!window || window.isDestroyed()) return;
      const [x, y] = window.getPosition();
      const temp = settingsPath + '.tmp';
      fs.writeFileSync(temp, JSON.stringify({ ...preferences, position: { x, y } }, null, 2), { mode: 0o600 });
      fs.renameSync(temp, settingsPath);
    }, 300);
  }
  function status() {
    const position = window && !window.isDestroyed() ? window.getPosition() : null;
    return { name: manifest.name, version: app.getVersion(), state: currentState, motion: { mode:motionMode, thrust:thrustActive }, temporaryState: manual?.state || null, preferences: { ...preferences, position:position?{x:position[0],y:position[1]}:null }, tracking: { ...tracking.status(), active:tracking.behavior({available:cursorTracking}).active }, capabilities: { cursorTracking, followCursor: cursorTracking, transparentOverlay: true, mobility:optionalAssets.mobility, thrust:optionalAssets.thrust, effects:fs.existsSync(path.join(__dirname,'../assets/effects.png')), linuxSession: wayland ? 'Wayland-limited' : null } };
  }
  function setAnimation(state, durationMs = 7000, once = false, holdMs = 0, holdFrame = null) {
    manual = state === 'idle' ? null : { state, until: Date.now() + durationMs, once, holdMs, holdFrame };
    currentState = state; stateStarted = Date.now();
  }
  function applyPreferences(values) {
    if (values.followCursor !== undefined) {
      if (values.followCursor && !cursorTracking) throw new Error('Cursor tracking is unavailable in native Wayland. Use an X11 session or --ozone-platform=x11 where X11 is available.');
      preferences.followCursor = values.followCursor;
    }
    if (values.trackingMode !== undefined) {
      preferences.trackingMode = values.trackingMode;
      tracking.setMode(values.trackingMode);
    }
    if (values.clickThrough !== undefined) preferences.clickThrough = values.clickThrough;
    if (values.scale !== undefined) {
      preferences.scale = values.scale;
      window.setSize(Math.round(LAYOUT.width * values.scale), Math.round(LAYOUT.height * values.scale));
      keepOnScreen();
    }
    for (const key of ['reducedMotion','contextBubbles']) if (values[key] !== undefined) preferences[key] = values[key];
    window.webContents.send('pet:preferences', { reducedMotion:preferences.reducedMotion, contextBubbles:preferences.contextBubbles });
    mouseIgnored = null; latestFrame = null;
    saveSettingsSoon(); updateMenu();
  }
  function resetPosition() {
    const area = screen.getPrimaryDisplay().workArea;
    const [width, height] = window.getSize();
    window.setPosition(area.x + area.width - width - 32, area.y + area.height - height - 24);
    saveSettingsSoon();
  }
  function keepOnScreen() {
    if (wayland) return;
    const [x, y] = window.getPosition();
    const [width, height] = window.getSize();
    const area = screen.getDisplayMatching({ x, y, width, height }).workArea;
    const fixed = clampPosition(x, y, width, height, area);
    window.setPosition(fixed.x, fixed.y);
  }
  function menuTemplate() {
    return [
      { label: 'Mini Mad Cat', enabled: false },
      { label: 'Animation', submenu: STATES.map(state => ({ label: state, click: () => setAnimation(state) })) },
      { type: 'separator' },
      { label: 'Mouse tracking', submenu: [
        { label: 'Always', mode: 'always' },
        { label: `${TRACKING_WINDOW_MS / 1000} seconds after click`, mode: 'after-click' },
        { label: 'Off', mode: 'off' }
      ].map(item => ({ label:item.label, type:'radio', checked:preferences.trackingMode===item.mode, enabled:cursorTracking||item.mode==='off', click:()=>applyPreferences({trackingMode:item.mode}) })) },
      { label: 'Follow cursor', type: 'checkbox', checked: preferences.followCursor, enabled: cursorTracking, click: item => applyPreferences({ followCursor: item.checked }) },
      { label: 'Click through', type: 'checkbox', checked: preferences.clickThrough, click: item => applyPreferences({ clickThrough: item.checked }) },
      { label: 'Reduced motion', type: 'checkbox', checked: preferences.reducedMotion, click: item => applyPreferences({ reducedMotion: item.checked }) },
      { label: 'Context bubbles', type: 'checkbox', checked: preferences.contextBubbles, click: item => applyPreferences({ contextBubbles: item.checked }) },
      { label: 'Size', submenu: [.75,1,1.25,1.5,2].map(scale => ({ label: Math.round(scale*100) + '%', type:'radio', checked: preferences.scale === scale, click: () => applyPreferences({scale}) })) },
      { label: 'Reset position', click: resetPosition },
      { label: 'Show / hide (Ctrl+Alt+M)', click: () => window.isVisible() ? window.hide() : window.showInactive() },
      { type:'separator' }, { label: 'Quit Mini Mad Cat', click: () => app.quit() }
    ];
  }
  function updateMenu() { if (tray) tray.setContextMenu(Menu.buildFromTemplate(menuTemplate())); }
  function allowedSender(event) { return window && !window.isDestroyed() && event.sender === window.webContents && event.senderFrame?.url === htmlUrl; }
  function bindIpc(channel, handler) { ipcMain.on(channel, event => { if (allowedSender(event)) handler(); }); }

  app.whenReady().then(async () => {
    const art = path.join(__dirname, '..', 'assets', manifest.sheet);
    if (!fs.existsSync(art)) { dialog.showErrorBox('Mini Mad Cat artwork is missing', 'Install the complete package including assets/spritesheet.png.'); app.quit(); return; }
    const image = nativeImage.createFromPath(art);
    const imageSize = image.getSize();
    if (imageSize.width !== manifest.width || imageSize.height !== manifest.height) { dialog.showErrorBox('Invalid Mini Mad Cat artwork', 'The v2 sprite sheet must be exactly 1536 by 2288 pixels.'); app.quit(); return; }
    function optionalImage(filename, width, height) {
      const file = path.join(__dirname, '..', 'assets', filename);
      if (!fs.existsSync(file)) return null;
      const candidate = nativeImage.createFromPath(file), size = candidate.getSize();
      return size.width === width && size.height === height ? candidate : null;
    }
    const spriteImages = { core:image, mobility:optionalImage(mobility.sheet,mobility.width,mobility.height) };
    optionalAssets.mobility = !!spriteImages.mobility;
    optionalAssets.thrust = !!optionalImage(mobility.thrust.sheet,mobility.thrust.width,mobility.thrust.height);
    function alphaAtCursor(cursor, x, y, cell = renderedCell) {
      const localX=Math.floor((cursor.x-x)/preferences.scale)-LAYOUT.petX;
      const localY=Math.floor((cursor.y-y)/preferences.scale)-LAYOUT.petY;
      if(localX<0||localX>=192||localY<0||localY>=208)return 0;
      const sheet = cell.sheet === 'mobility' && spriteImages.mobility ? 'mobility' : 'core';
      const key=sheet+':'+cell.row+':'+cell.column;
      if(!alphaFrames.has(key))alphaFrames.set(key,spriteImages[sheet].crop({x:cell.column*192,y:cell.row*208,width:192,height:208}).toBitmap());
      return alphaFrames.get(key)[(localY*192+localX)*4+3];
    }
    window = new BrowserWindow({
      width: Math.round(LAYOUT.width * preferences.scale), height: Math.round(LAYOUT.height * preferences.scale),
      frame: false, transparent: true, backgroundColor: '#00000000', hasShadow: false,
      alwaysOnTop: true, resizable: false, maximizable: false, fullscreenable: false,
      skipTaskbar: true, focusable: false, show: false,
      webPreferences: { preload: path.join(__dirname, 'preload.cjs'), nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true, backgroundThrottling: false, offscreen: hidden }
    });
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    window.webContents.on('will-navigate', event => event.preventDefault());
    window.webContents.session.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
    window.setIgnoreMouseEvents(true, { forward: true }); mouseIgnored = true;
    if (preferences.position && !wayland) window.setPosition(Math.round(preferences.position.x), Math.round(preferences.position.y)); else resetPosition();
    keepOnScreen();
    await window.loadFile(path.join(__dirname, 'index.html'));
    if (hidden) { window.webContents.setFrameRate(30); window.webContents.startPainting(); }
    if (!hidden) window.showInactive();
    window.on('move', saveSettingsSoon);
    bindIpc('pet:drag-start', () => {
      if (!cursorTracking || preferences.clickThrough) return;
      const cursor = screen.getCursorScreenPoint(); const [x,y] = window.getPosition();
      if (alphaAtCursor(cursor,x,y)<24) return;
      tracking.notePrimaryInteraction();
      drag = { dx: cursor.x-x, dy: cursor.y-y };
    });
    bindIpc('pet:drag-end', () => {
      if (!drag) return;
      // Renew once when a click or deliberate drag finishes, never on pointer
      // movement or duplicate pointer-up/lost-capture notifications.
      tracking.notePrimaryInteraction();
      drag = null; saveSettingsSoon();
    });
    bindIpc('pet:wave', () => setAnimation('waving', 880, true));
    bindIpc('pet:menu', () => Menu.buildFromTemplate(menuTemplate()).popup({ window }));
    try {
      const icon = image.crop({ x:0,y:0,width:192,height:208 }).resize({ width:24,height:26 });
      tray = new Tray(icon); tray.setToolTip('Mini Mad Cat'); updateMenu();
      tray.on('click', () => { if (window) window.showInactive(); });
    } catch (error) { console.error('System tray unavailable:', error.message); }
    globalShortcut.register('CommandOrControl+Alt+M', () => window.isVisible() ? window.hide() : window.showInactive());
    control = await createControlServer({ getStatus: status, execute: async value => {
      const command = validateCommand(value);
      if (command.action === 'animate') setAnimation(command.state, command.durationMs);
      if (command.action === 'configure') applyPreferences(command);
      if (command.action === 'react') {
        const {action,...event}=command;
        const result=reactionController.react(event,{reducedMotion:preferences.reducedMotion});
        if(result.accepted){setAnimation(result.reaction.state,result.reaction.animationMs,true,result.reaction.holdMs,result.reaction.holdFrame);window.webContents.send('pet:reaction',{...result.reaction,contextBubbles:preferences.contextBubbles});}
        return {...result,status:status()};
      }
      if (command.action === 'reset') setAnimation('idle');
      if (command.action === 'quit') setTimeout(() => app.quit(), 100);
      return status();
    }});
    writeEndpoint(dataDir, { port:control.port, token:control.token, pid:process.pid, version:1 });
    interval = setInterval(() => {
      if (!window || window.isDestroyed()) return;
      const now = Date.now();
      let [x,y] = window.getPosition(); const [width,height] = window.getSize();
      const originX = x, originY = y;
      if (manual && now >= manual.until) manual = null;
      const cursor = cursorTracking ? screen.getCursorScreenPoint() : null;
      const pointerBehavior = tracking.behavior({available:cursorTracking,followCursor:preferences.followCursor,dragging:!!drag});
      if (drag && cursor) {
        const area = screen.getDisplayNearestPoint(cursor).workArea;
        const pos = clampPosition(cursor.x-drag.dx, cursor.y-drag.dy, width,height,area);
        window.setPosition(pos.x,pos.y); x=pos.x; y=pos.y;
      } else if (canChase({trackingAllowsChase:pointerBehavior.chase,manualActive:!!manual,dragging:!!drag}) && cursor) {
        const area = screen.getDisplayNearestPoint(cursor).workArea;
        const target = clampPosition(cursor.x-(LAYOUT.petX+LAYOUT.petWidth*.75)*preferences.scale, cursor.y+40-LAYOUT.petY*preferences.scale, width,height,area);
        const dx=target.x-x, dy=target.y-y, distance=Math.hypot(dx,dy);
        if (distance > 10) { const step=Math.min(distance,4); x=Math.round(x+dx/distance*step); y=Math.round(y+dy/distance*step); window.setPosition(x,y); }
      }
      const moving = x !== originX || y !== originY;
      const nextMotion = manual ? null : classifyMotion(x-originX,y-originY,motionMode);
      if (nextMotion !== motionMode) { motionMode = nextMotion; motionStarted = now; if (!manual) stateStarted = now; }
      let desiredState = manual?.state || 'idle';
      if (motionMode) desiredState = mobility.modes[motionMode]?.fallbackState || motionMode;
      if (desiredState !== currentState) { currentState = desiredState; stateStarted = now; }
      let elapsed=now-stateStarted;
      if(manual?.once&&manual.holdMs&&manual.holdFrame!==null){
        const pauseAt=manifest.states[currentState].durations.slice(0,manual.holdFrame).reduce((sum,value)=>sum+value,0);
        if(elapsed>pauseAt)elapsed=elapsed<pauseAt+manual.holdMs?pauseAt:elapsed-manual.holdMs;
      }
      let cell = { ...animationCell(currentState, preferences.reducedMotion ? 0 : elapsed, {loop:!manual?.once}), sheet:'core', motion:null, thrust:false, reducedMotion:preferences.reducedMotion };
      if (motionMode) cell = travelVisual(motionMode,now-motionStarted,{mobilityAvailable:optionalAssets.mobility,thrustAvailable:optionalAssets.thrust,reducedMotion:preferences.reducedMotion});
      if (!manual && !moving && currentState === 'idle' && pointerBehavior.gaze && cursor) {
        const direction = directionForOffset(cursor.x-(x+(LAYOUT.petX+96)*preferences.scale),cursor.y-(y+(LAYOUT.petY+208*.46)*preferences.scale),60*preferences.scale);
        if (direction !== null) cell = lookCell(direction);
      }
      if (cursor) {
        const alpha=alphaAtCursor(cursor,x,y,cell);
        const shouldIgnore=preferences.clickThrough || (!drag && alpha<24);
        if(mouseIgnored!==shouldIgnore){window.setIgnoreMouseEvents(shouldIgnore,{forward:true});mouseIgnored=shouldIgnore;}
      }
      renderedCell = cell;
      thrustActive = cell.thrust;
      const serial = `${cell.sheet}:${cell.row}:${cell.column}:${currentState}:${cell.motion}:${cell.thrust}:${cell.thrustSpec?.column}:${cell.reducedMotion}`;
      if (serial !== latestFrame) { latestFrame = serial; window.webContents.send('pet:frame', { ...cell, state:currentState }); }
    }, 1000/30);
    if (capture) {
      const captureTimes=capture.series?CAPTURE_TIMES:[1200];
      for(const delay of captureTimes)setTimeout(async()=>{
        try {
          fs.mkdirSync(capture.directory,{recursive:true,mode:0o700});
          const rendererSnapshot=await window.webContents.executeJavaScript('({frame,reaction,now:performance.now(),visibility:document.visibilityState})');
          const shot=hidden?await new Promise((resolve,reject)=>{
            const timeout=setTimeout(()=>{window.webContents.removeListener('paint',paint);reject(new Error('Offscreen renderer paint timed out'));},2000);
            function paint(_event,_dirty,image){clearTimeout(timeout);resolve(image);}
            window.webContents.once('paint',paint);window.webContents.invalidate();
          }):await window.webContents.capturePage();
          const target=captureTarget(capture,delay);
          writeCapture(target,shot.toPNG());
          const bitmap=shot.toBitmap();const dimensions=shot.getSize();const ratio=dimensions.width/(LAYOUT.width*preferences.scale);let visiblePixels=0,petPixels=0;
          for(let py=0;py<dimensions.height;py++)for(let px=0;px<dimensions.width;px++)if(bitmap[(py*dimensions.width+px)*4+3]>0){visiblePixels++;if(px>=LAYOUT.petX*preferences.scale*ratio&&px<(LAYOUT.petX+192)*preferences.scale*ratio&&py>=LAYOUT.petY*preferences.scale*ratio&&py<(LAYOUT.petY+208)*preferences.scale*ratio)petPixels++;}
          writeCapture(target+'.json',JSON.stringify({width:dimensions.width,height:dimensions.height,logicalWidth:LAYOUT.width*preferences.scale,logicalHeight:LAYOUT.height*preferences.scale,visiblePixels,petPixels,captureMethod:hidden?'offscreen-paint':'capturePage',state:currentState,frame:latestFrame,renderer:rendererSnapshot,preferences:{reducedMotion:preferences.reducedMotion}},null,2));
          console.error('Captured companion preview:',target);
        }catch(error){console.error('Capture failed:',error.message);}
      },delay);
      if(process.argv.includes('--capture-exit'))setTimeout(()=>app.quit(),captureTimes.at(-1)+300);
    }
  }).catch(error => { console.error(error); dialog.showErrorBox('Mini Mad Cat could not start', error.message); app.quit(); });
  app.on('second-instance', () => { if (window) window.showInactive(); });
  app.on('window-all-closed', () => app.quit());
  app.on('before-quit', () => {
    clearInterval(interval); clearTimeout(saveTimer); globalShortcut.unregisterAll();
    if (window && !window.isDestroyed()) { const [x,y]=window.getPosition(); try { fs.writeFileSync(settingsPath,JSON.stringify({...preferences,position:{x,y}},null,2),{mode:0o600}); } catch {} }
    try { const endpoint=JSON.parse(fs.readFileSync(endpointPath,'utf8')); if (endpoint.pid === process.pid) fs.unlinkSync(endpointPath); } catch {}
    if (control) control.server.close(); if (tray) tray.destroy();
  });
}
