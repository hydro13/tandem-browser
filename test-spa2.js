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
    console.log('Fetching page-html...');
    const res = await doFetch('http://localhost:8765/execute-js', 'POST', { code: 'document.body.innerHTML.length' });
    console.log('Body innerHTML length:', res.result);
    
    const textRes = await doFetch('http://localhost:8765/execute-js', 'POST', { code: 'document.body.innerText.length' });
    console.log('Body innerText length:', textRes.result);
    
    const rootRes = await doFetch('http://localhost:8765/execute-js', 'POST', { code: 'document.querySelector("#__next")?.innerHTML.length || document.querySelector("#root")?.innerHTML.length' });
    console.log('React Root HTML length:', rootRes.result);
  } catch (err) {
    console.error(err);
  }
}
run();
