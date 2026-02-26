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
    console.log('Navigating to root of developer portal...');
    const navRes = await doFetch('http://localhost:8765/navigate', 'POST', { url: 'https://viture.com/developer/unity-sdk/unity' });
    console.log('Nav response:', navRes);
    
    // Wait for the page to load
    await new Promise(r => setTimeout(r, 4000));
    
    console.log('Fetching page content (SPA wait)...');
    const content1 = await doFetch('http://localhost:8765/page-content?settle=1000&timeout=10000');
    console.log('Overview text length:', content1.text?.length);
    console.log('Preview:', content1.text?.substring(0, 100));

    // Wait slightly
    await new Promise(r => setTimeout(r, 2000));
    
    // Read DOM again
    const res = await doFetch('http://localhost:8765/page-content?settle=1000&timeout=10000');
    console.log('Content after wait text length:', res.text?.length);
    console.log('Preview:', res.text?.substring(0, 100));
  } catch (err) {
    console.error(err);
  }
}
run();
