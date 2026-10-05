const http = require('http');

const port = process.env.PORT || 3000;

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end('<h1>hello</h1>');
});

server.listen(port, () => {
  console.log(`listening on ${port}`);
});
