self.addEventListener('message', async (event) => {
  const url = event.data?.url
  if (typeof url !== 'string') return
  try {
    const response = await fetch(url)
    const text = await response.text()
    let body = text
    try {
      body = JSON.parse(text)
    } catch {}
    self.postMessage({ url, status: response.status, body, error: null })
  } catch (error) {
    self.postMessage({ url, status: 'network-error', body: null, error: String(error) })
  }
})
