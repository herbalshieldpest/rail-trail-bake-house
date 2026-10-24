// Password-protects the whole site while it's in preview.
// Set SITE_PASSWORD (and optionally SITE_USER) in Vercel → Settings → Environment Variables.
import { next } from '@vercel/functions';

export const config = {
  matcher: '/:path*',
};

function unauthorized() {
  return new Response('This site is private while it is being built.', {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Basic realm="Rail Trail Bakehouse preview", charset="UTF-8"',
      'Cache-Control': 'no-store',
    },
  });
}

function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export default function middleware(request) {
  const password = process.env.SITE_PASSWORD;
  if (!password) {
    return new Response('Preview password is not set yet. Add SITE_PASSWORD in Vercel and redeploy.', {
      status: 503,
      headers: { 'Cache-Control': 'no-store' },
    });
  }

  const header = request.headers.get('authorization') || '';
  if (!header.startsWith('Basic ')) return unauthorized();

  let decoded = '';
  try {
    decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
  } catch {
    return unauthorized();
  }
  const sep = decoded.indexOf(':');
  const user = sep >= 0 ? decoded.slice(0, sep) : '';
  const pass = sep >= 0 ? decoded.slice(sep + 1) : '';

  const expectedUser = process.env.SITE_USER;
  const userOk = expectedUser ? safeEqual(user, expectedUser) : true;
  if (userOk && safeEqual(pass, password)) return next();

  return unauthorized();
}
