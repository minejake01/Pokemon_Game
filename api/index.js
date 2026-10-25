// Vercel serverless entry point: every /api/* request is rewritten here (see vercel.json)
// and handled by the same router the dev server and `npm start` use.
import { handleApi } from '../server/api.js'

export default async function handler(req, res) {
  // The rewrite passes the original sub-path as ?path=…; restore /api/<path> for the router.
  const url = new URL(req.url, 'http://x')
  const path = url.searchParams.get('path')
  if (path !== null && /^\/api(\/index(\.js)?)?\/?$/.test(url.pathname)) {
    url.searchParams.delete('path')
    req.url = `/api/${path}${url.search}`
  }
  await handleApi(req, res, () => {
    res.statusCode = 404
    res.end('Not found')
  })
}
