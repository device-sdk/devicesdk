export default {
  // TODO: add types to env and ctx
  async fetch(request: Request, env: any, ctx: any) {
    // Serve static assets using the ASSETS binding
    const url = new URL(request.url);
    if (url.pathname.startsWith('/static/')) {
      return env.ASSETS.fetch(request);
    }

    let path = url.pathname;
    if (url.pathname === '/') {
      path = 'index.html'
    }

    // rustic mime type guesser
    let contentType = 'text/html; charset=utf-8';
    if (path.endsWith('.css')) {
      contentType = 'text/css';
    } else if (path.endsWith('.json')) {
      contentType = 'application/json';
    } else if (path.endsWith('.js')) {
      contentType = 'application/javascript';
    } else if (path.endsWith('.ico')) {
      contentType = 'image/x-icon';
    }

    const resp = await env.ASSETS.fetch(`http://localhost:8080/${path}`)

    if (!resp.ok) {
      const respNotFound = await env.ASSETS.fetch(`http://localhost:8080/404.html`)
      return new Response(respNotFound.body, {
        headers: {
          "content-type": 'text/html; charset=utf-8',
        },
        status: 404,
      });
    }

    return new Response(resp.body, {
      headers: {
        "content-type": contentType,
      },
      status: resp.status,
    });
  },
};
