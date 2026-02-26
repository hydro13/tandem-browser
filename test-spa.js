const http = require('http');

async function doFetch(url, method = 'GET', body = null) {
  return new Promise((resolve, reject) => {
    const opts = {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.TOKEN}`
      }
    };
    const req = http.request(url, opts, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(JSON.parse(data)));
    });
    req.on('error', reject);
    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

async function run() {
  try {
    const status = await doFetch('http://localhost:8765/status');
    if (!status.ready) {
      console.error('API not ready. Is the browser running?');
      process.exit(1);
    }
    
    console.log('Navigating to Viture SDK docs...');
    const navRes = await doFetch('http://localhost:8765/navigate', 'POST', { url: 'https://viture.com/developer/unity-sdk/requirements' });
    console.log('Nav response:', navRes);
    
    await new Promise(r => setTimeout(r, 4000));
    
    console.log('Fetching page content (SPA wait)...');
    const start = Date.now();
    const content = await doFetch('http://localhost:8765/page-content?settle=1000&timeout=15000&minLength=2000');
    const duration = Date.now() - start;
    
    console.log(`Extracted in ${duration}ms. Title: ${content.title}`);
    console.log(`Content length: ${content.length}`);
    console.log('Preview:', content.text ? content.text.substring(0, 500) + '...' : 'NONE');
  } catch (err) {
    console.error(err);
  }
}
run();
