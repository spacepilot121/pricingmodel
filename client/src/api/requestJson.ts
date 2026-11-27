export class ApiError extends Error {
  constructor(message: string, public status = 0) { super(message); }
}

export async function requestJson(url: string, init: RequestInit = {}, timeoutMs = 25000): Promise<any> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response: Response;
    let data: any;
    try {
      response = await fetch(url, { ...init, signal: controller.signal });
      const text = await response.text();
      try { data = JSON.parse(text); }
      catch { throw new ApiError('Unexpected service response. Check the API endpoint.', response.status); }
    } catch (error: any) {
      if (error.name === 'AbortError') throw new ApiError('The request timed out. Please try again.');
      throw error;
    } finally { clearTimeout(timer); }
    if (response.ok) return data;
    // Network failures may already have consumed credit; retry only explicit transient statuses.
    if ([429, 502, 503, 504].includes(response.status) && attempt < 2) {
      const raw = response.headers.get('Retry-After');
      const seconds = raw ? Number(raw) : NaN;
      const delay = Number.isFinite(seconds) ? seconds * 1000 : 700 * 2 ** attempt;
      if (delay <= 10000) { await new Promise(resolve => setTimeout(resolve, Math.max(0, delay))); continue; }
    }
    const message = data?.error?.message || data?.error || data?.message;
    throw new ApiError(typeof message === 'string' ? message : `Service returned ${response.status}`, response.status);
  }
  throw new ApiError('Request failed.');
}
