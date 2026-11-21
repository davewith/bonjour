export async function api(pathname, options) {
  const res = await fetch(pathname, options);
  let body = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  if (!body || body.ok === false) {
    const message =
      (body && body.error) || `Request failed (${res.status})`;
    const hint = body && body.hint ? ` ${body.hint}` : "";
    throw new Error(message + hint);
  }
  return body.data;
}

export function postJson(payload) {
  return {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  };
}

export async function speak(text) {
  const res = await fetch(`/api/tts?text=${encodeURIComponent(text)}`);
  if (!res.ok) {
    let message = `Audio unavailable (${res.status})`;
    try {
      const body = await res.json();
      if (body && body.error) {
        message = body.error + (body.hint ? ` ${body.hint}` : "");
      }
    } catch {
      /* keep default message */
    }
    throw new Error(message);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  try {
    const audio = new Audio(url);
    await audio.play();
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
  }
}
