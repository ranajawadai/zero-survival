const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9222;
const ROOT_DIR = path.resolve(__dirname, '..');
const HTML_FILE = 'file:///' + path.join(ROOT_DIR, 'index.html').replace(/\\/g, '/');
const SCREENSHOTS_DIR = path.join(ROOT_DIR, 'screenshots');

if (!fs.existsSync(SCREENSHOTS_DIR)) {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
}

function sendCDP(ws, method, params = {}, id = 1) {
  return new Promise((resolve, reject) => {
    const handler = (evt) => {
      const msg = JSON.parse(evt.data);
      if (msg.id === id) {
        ws.removeEventListener('message', handler);
        if (msg.error) reject(new Error(msg.error.message));
        else resolve(msg.result);
      }
    };
    ws.addEventListener('message', handler);
    ws.send(JSON.stringify({ id, method, params }));
  });
}

async function capture(url, outFilename) {
  console.log(`Capturing: ${url} -> ${outFilename}`);
  const newTargetRes = await fetch(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent(url)}`, { method: 'PUT' });
  const target = await newTargetRes.json();
  const ws = new WebSocket(target.webSocketDebuggerUrl);

  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve);
    ws.addEventListener('error', reject);
  });

  let msgId = 1;
  await sendCDP(ws, 'Page.enable', {}, msgId++);
  await sendCDP(ws, 'Emulation.setDeviceMetricsOverride', {
    width: 1280,
    height: 720,
    deviceScaleFactor: 1,
    mobile: false
  }, msgId++);

  await new Promise(r => setTimeout(r, 1200));

  const result = await sendCDP(ws, 'Page.captureScreenshot', { format: 'png' }, msgId++);
  const buffer = Buffer.from(result.data, 'base64');
  const outPath = path.join(SCREENSHOTS_DIR, outFilename);
  fs.writeFileSync(outPath, buffer);
  console.log(`Saved screenshot: ${outPath} (${buffer.length} bytes)`);

  ws.close();
  await fetch(`http://127.0.0.1:${PORT}/json/close/${target.id}`).catch(() => {});
}

async function main() {
  const chrome = spawn(CHROME_PATH, [
    '--headless=new',
    `--remote-debugging-port=${PORT}`,
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--allow-file-access-from-files',
    '--window-size=1280,720'
  ]);

  await new Promise(r => setTimeout(r, 1500));

  try {
    await capture(`${HTML_FILE}`, 'menu.png');
    await capture(`${HTML_FILE}?demo=action`, 'gameplay.png');
    await capture(`${HTML_FILE}?demo=combat`, 'combat.png');
    await capture(`${HTML_FILE}?demo=victory`, 'victory.png');
    console.log('All screenshots captured successfully!');
  } catch (err) {
    console.error('Error during capture:', err);
  } finally {
    chrome.kill();
  }
}

main();
