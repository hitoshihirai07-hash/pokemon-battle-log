export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=UTF-8',
      'cache-control': 'no-store',
    },
  });
}

export function message(error, status = 500) {
  return json({ ok: false, error }, status);
}

export function errorStatus(error, fallback = 500) {
  return Number.isInteger(error?.status) ? error.status : fallback;
}
